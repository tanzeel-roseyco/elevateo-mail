# frozen_string_literal: true

require "securerandom"
require_relative "repository"
require_relative "core"
require_relative "discovery"
require_relative "smtp"

module Elevateo
  module EmailFinder
    # AIDEV-NOTE: One session advisory lock covers all network work, including startup and search/crawl.
    class Worker
      LOCK = 7_419_029

      def initialize(repository:, public_ip:, discovery: nil, smtp: nil)
        @repository = repository
        @public_ip = public_ip
        @discovery = discovery || Discovery.new(state: repository)
        @smtp = smtp
      end

      def startup
        return false unless @repository.rows("SELECT pg_try_advisory_lock(#{LOCK}) AS locked").fetch(0)["locked"] == true
        health = Smtp.startup(public_ip: @public_ip)
        health["seen_at"] = Time.now.utc.iso8601
        @repository.state_put("health", health)
        @smtp ||= Smtp.new(hostname: health.fetch("hostname").to_s) if health["available"]
        puts JSON.generate("event" => "email_finder.started", "hostname" => health["hostname"], "available" => health["available"], "reason" => health["reason"])
        true
      end

      def run_once
        owned = @repository.rows("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND objid=#{LOCK} AND granted) AS owned").fetch(0)["owned"]
        raise "Email finder lost its global worker lock" unless owned == true
        health = @repository.state_get("health")
        @repository.state_put("health", health.merge("seen_at" => Time.now.utc.iso8601))
        job = @repository.rows("SELECT * FROM app.email_finder_jobs WHERE status IN ('queued','running') AND next_at<=now() ORDER BY next_at,created_at LIMIT 1").first
        return false unless job
        process(job)
        true
      end

      def process(job)
        org = job.fetch("organization_id").to_s
        # AIDEV-NOTE: Resume one child row; retries never rewrite the other 4,999 inputs/results.
        item = @repository.rows("SELECT row_number AS row,input,work,result FROM app.email_finder_job_items WHERE job_id=$1::uuid AND row_number=$2::integer", [job.fetch("id"), job.fetch("completed").to_i + 1]).fetch(0)
        %w[input work result].each { |key| item[key] = @repository.object(item[key]) if item[key] }
        input = item.fetch("input")
        if @repository.suppressed?(org, input)
          return finish(job, item, @repository.suppressed_result)
        end
        key = Digest::SHA256.hexdigest(JSON.generate([job.fetch("kind"), input.sort.to_h]))
        cached = @repository.rows("SELECT result FROM app.email_finder_results WHERE organization_id=$1::uuid AND cache_key=$2 AND checked_at>now()-interval '30 days'", [org, key]).first
        return finish(job, item, @repository.object(cached.fetch("result"))) if cached
        work = item["work"]
        unless work
          work = discover(job.fetch("kind"), input, org)
          item["work"] = work
          save(job, item)
        end
        result = work["result"] || verify(job, item, work, org, input)
        return unless result
        result = @repository.suppressed_result if @repository.suppressed?(org, input.merge("email" => result["email"], "name" => result["name"] || input["name"]))
        @repository.rows(<<~SQL, [org, key, JSON.generate(input), JSON.generate(result)])
          INSERT INTO app.email_finder_results(organization_id,cache_key,input,result) VALUES($1::uuid,$2,$3::jsonb,$4::jsonb)
          ON CONFLICT(organization_id,cache_key) DO UPDATE SET result=EXCLUDED.result,input=EXCLUDED.input,checked_at=now()
        SQL
        finish(job, item, result)
      rescue StandardError => error
        # AIDEV-NOTE: Persist a safe per-row failure, not scraped content or exception messages containing addresses.
        raise unless item && job
        finish(job, item, result("unknown", reasons: ["Worker error: #{error.class.name}"]))
      end

      def discover(kind, input, org)
        requested_domain = kind == "verify" ? input.fetch("email").split("@").last : input["domain"]
        evidence = @discovery.discover(domain: requested_domain, company: input["company"], role: input["role"],
          allowed_domain: ->(host) { !@repository.suppressed?(org, input.merge("domain" => host)) })
        return { "result" => @repository.suppressed_result } if evidence["suppressed"]
        domain = evidence["domain"].to_s
        return { "result" => result("sources_unavailable", reasons: evidence.fetch("reasons", [])) } if evidence["unavailable"] && domain.empty?
        return { "result" => result("unknown", reasons: ["No resolving company domain with MX found"]) } if domain.empty?
        return { "result" => @repository.suppressed_result } if @repository.suppressed?(org, input.merge("domain" => domain))
        sources = evidence.fetch("sources", []).select { |source| source.bytesize <= 512 }.first(kind == "company" ? 20 : 2)
        rules = @repository.suppression_rules(org)
        emails = evidence.fetch("emails", []).reject { |entry| @repository.suppressed?(org, { "email" => entry.fetch("email") }, rules) }
        if kind == "company"
          entries = emails.map { |entry| result("unknown", email: entry.fetch("email"), confidence: 35, sources: [entry.fetch("source")], reasons: ["Public sighting; SMTP not checked"]) }
          return { "result" => result(evidence["unavailable"] && entries.empty? ? "sources_unavailable" : "unknown", sources: sources,
            reasons: ["Company public email discovery"]).merge("emails" => entries) }
        end
        name = input["name"]
        title = nil
        if kind == "decision_maker"
          person = evidence.fetch("people", []).find { |person| Core.role_matches?(person.fetch("title"), input.fetch("role")) && !@repository.suppressed?(org, { "name" => person.fetch("name"), "domain" => domain }) }
          return { "result" => result(evidence["unavailable"] ? "sources_unavailable" : "unknown", sources: sources, reasons: ["No matching decision maker found"]) } unless person
          name = person.fetch("name")
          title = person.fetch("title")
        end
        patterns = pattern_counts(org, domain)
        candidates = kind == "verify" ? [{ "email" => input.fetch("email"), "pattern" => "" }] : Core.candidates(name.to_s, domain, patterns, pattern_counts(org, nil))
        candidates = candidates.reject { |candidate| @repository.suppressed?(org, { "email" => candidate.fetch("email"), "name" => name }) }.first(3)
        mx = evidence.fetch("mx", []).sort_by { |entry| entry.fetch("priority").to_i }.first
        data = @repository.rows("SELECT data FROM app.email_finder_domains WHERE organization_id=$1::uuid AND domain=$2 AND checked_at>now()-interval '30 days'", [org, domain]).first
        # @type var old: object
        old = data ? @repository.object(data.fetch("data")) : {}
        { "domain" => domain, "name" => name, "title" => title, "sources" => sources, "emails" => emails,
          "candidates" => candidates, "index" => 0, "attempts" => 0, "catch_attempts" => 0,
          "host" => mx && mx["host"], "catch_all" => old["catch_all"], "patterns" => patterns,
          "provider" => evidence["provider"], "mx" => evidence["mx"], "sources_unavailable" => evidence["unavailable"] }
      end

      def pattern_counts(org, domain)
        # AIDEV-NOTE: Separate predicates let the expression index serve domain-specific learning.
        rows = if domain
          @repository.rows("SELECT patterns FROM app.email_finder_people WHERE organization_id=$1::uuid AND split_part(email,'@',2)=$2", [org, domain])
        else
          @repository.rows("SELECT patterns FROM app.email_finder_people WHERE organization_id=$1::uuid", [org])
        end
        counts = {} # @type var counts: Hash[String, Integer]
        rows.each { |row| @repository.object(row.fetch("patterns")).each { |pattern| counts[pattern] = counts.fetch(pattern, 0) + 1 } }
        counts
      end

      def verify(job, item, work, org, input)
        candidates = work.fetch("candidates")
        candidate = candidates[work.fetch("index")]
        return result("unknown", reasons: ["Candidate probe limit reached"], sources: work.fetch("sources")) unless candidate
        health = @repository.state_get("health")
        return @repository.suppressed_result if @repository.suppressed?(org, input.merge("email" => candidate.fetch("email"), "name" => work["name"], "domain" => work["domain"]))
        if work["catch_all"]
          count = work.fetch("patterns").fetch(candidate.fetch("pattern"), 0)
          sightings = work.fetch("emails").count { |entry| entry["email"] == candidate["email"] }
          return decorate(result("risky", email: candidate["email"], confidence: Core.catch_all_score(count, work.fetch("patterns").values.sum, sightings), reasons: ["Catch-all domain; acceptance does not establish a mailbox"]), work)
        end
        return decorate(result(work["sources_unavailable"] ? "sources_unavailable" : "unknown", email: candidate["email"], reasons: [health.fetch("reason", "SMTP unavailable")]), work) unless health["available"] && work["host"]
        catch_probe = work["catch_all"].nil?
        if catch_probe && work.fetch("catch_attempts") >= 3
          return decorate(result("unknown", reasons: ["Catch-all status could not be determined"]), work)
        end
        if !catch_probe && work.fetch("attempts") >= 3
          return decorate(result("unknown", reasons: ["Three candidate probes exhausted"]), work)
        end
        delay = reserve_probe(work.fetch("host"))
        if delay
          save(job, item, delay)
          return nil
        end
        email = catch_probe ? "#{SecureRandom.hex(10)}@#{work.fetch('domain')}" : candidate.fetch("email")
        counter = catch_probe ? "catch_attempts" : "attempts"
        work[counter] += 1
        save(job, item)
        smtp = @smtp || raise("SMTP startup required")
        reply = smtp.probe(host: work.fetch("host"), email: email)
        apply_backoff(work.fetch("host"), reply)
        if reply["status"] == "unknown"
          if work[counter] >= 3
            return decorate(result("unknown", reasons: ["SMTP did not provide a conclusive answer"]), work)
          end
          save(job, item, reply["blocklisted"] ? 86_400 : 3600)
          return nil
        end
        if catch_probe
          work["catch_all"] = reply["status"] == "valid"
          @repository.rows(<<~SQL, [org, work.fetch("domain"), JSON.generate(work.slice("catch_all", "mx", "provider", "patterns"))])
            INSERT INTO app.email_finder_domains(organization_id,domain,data) VALUES($1::uuid,$2,$3::jsonb)
            ON CONFLICT(organization_id,domain) DO UPDATE SET data=EXCLUDED.data,checked_at=now()
          SQL
          save(job, item, 60)
          return nil
        end
        if reply["status"] == "valid"
          learn(org, work, candidate)
          return decorate(result("valid", email: candidate["email"], confidence: 95, reasons: ["SMTP recipient accepted; random recipient rejected"]), work)
        end
        return decorate(result("invalid", email: candidate["email"], reasons: ["SMTP recipient rejected"]), work) if job["kind"] == "verify"
        work["index"] += 1
        save(job, item, 60)
        nil
      end

      def reserve_probe(host)
        now = Time.now.utc
        global = @repository.state_get("smtp")
        local = @repository.state_get("host:#{host}")
        deadline = [global["halted_until"], local["next_at"]].compact.map { |value| Time.iso8601(value) }.max
        return [(deadline - now).ceil, 1].max if deadline && deadline > now
        used = global["day"] == now.strftime("%F") ? global.fetch("used", 0).to_i : 0
        return 86_400 - (now.hour * 3600 + now.min * 60 + now.sec) if used >= 50
        # AIDEV-NOTE: Reserve before touching TCP; a crash spends a probe rather than permitting an extra one.
        @repository.rows(<<~SQL, [JSON.generate(global.merge("day" => now.strftime("%F"), "used" => used + 1)), "host:#{host}", JSON.generate(local.merge("next_at" => (now + 60).iso8601))])
          INSERT INTO app.email_finder_rate_state(key,value) VALUES('smtp',$1::jsonb),($2,$3::jsonb)
          ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value
        SQL
        nil
      end

      def apply_backoff(host, reply)
        now = Time.now.utc
        @repository.state_put("host:#{host}", { "next_at" => (now + 3600).iso8601 }) if reply["temporary"]
        if reply["blocklisted"]
          @repository.state_put("smtp", @repository.state_get("smtp").merge("halted_until" => (now + 86_400).iso8601))
        end
      end

      def learn(org, work, candidate)
        name = work["name"].to_s
        return if name.empty?
        patterns = Core.patterns_for(name, candidate.fetch("email"))
        name = Input.suppression("person", name)
        @repository.rows(<<~SQL, [org, Input.email(candidate.fetch("email")), name, JSON.generate(patterns)])
          INSERT INTO app.email_finder_people(organization_id,email,name,patterns) VALUES($1::uuid,$2,$3,$4::jsonb)
          ON CONFLICT(organization_id,email) DO UPDATE SET name=EXCLUDED.name,patterns=EXCLUDED.patterns,checked_at=now()
        SQL
      end

      def result(status, email: nil, confidence: 0, reasons: [], sources: [])
        value = { "status" => status, "confidence" => confidence, "reasons" => reasons, "sources" => sources, "checked_at" => Time.now.utc.iso8601 }
        value["email"] = email if email
        value
      end

      def decorate(value, work)
        value["sources"] = work.fetch("sources")
        value["name"] = work["name"] if work["name"]
        value["title"] = work["title"] if work["title"]
        value
      end

      def save(job, item, delay = 0)
        # AIDEV-NOTE: Child state and scheduling commit together, including pre-probe reservations.
        @repository.rows(<<~SQL, [job.fetch("id"), item.fetch("row"), JSON.generate(item.fetch("work")), delay])
          WITH saved AS (
            UPDATE app.email_finder_job_items SET work=$3::jsonb
            WHERE job_id=$1::uuid AND row_number=$2::integer RETURNING job_id
          ) UPDATE app.email_finder_jobs SET status='running',next_at=now()+($4::integer*interval '1 second')
            WHERE id IN (SELECT job_id FROM saved)
        SQL
        nil
      end

      def finish(job, item, value)
        completed = job.fetch("completed").to_i + 1
        item["result"] = value
        item.delete("work")
        @repository.rows(<<~SQL, [job.fetch("id"), completed, completed == job.fetch("total").to_i ? "completed" : "running", JSON.generate(value)])
          WITH finished AS (
            UPDATE app.email_finder_job_items SET result=$4::jsonb,work=NULL
            WHERE job_id=$1::uuid AND row_number=$2::integer RETURNING job_id
          ) UPDATE app.email_finder_jobs SET completed=$2::integer,status=$3,next_at=now()
            WHERE id IN (SELECT job_id FROM finished)
        SQL
        nil
      end
    end
  end
end
