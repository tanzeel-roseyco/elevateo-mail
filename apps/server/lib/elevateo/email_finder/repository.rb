# frozen_string_literal: true

require "json"
require "digest"
require "time"
require_relative "input"
require_relative "core"

module Elevateo
  module EmailFinder
    # AIDEV-NOTE: Bound SQL runs inside the host session transaction; worker access is module-table-only.
    class Repository
      def initialize(connection:)
        @connection = connection
      end

      def rows(sql, values = [])
        binds = values.map do |value|
          ActiveRecord::Relation::QueryAttribute.new("finder", value.nil? ? nil : value.to_s, ActiveRecord::Type::String.new)
        end
        @connection.exec_query(sql, "Email finder", binds).to_a
      end

      def object(value)
        value.is_a?(String) ? JSON.parse(value) : value
      end

      def enqueue(org, user, kind, inputs)
        # AIDEV-NOTE: The protected-write transaction commits the parent and child rows together.
        row = rows(<<~SQL, [org, user, kind, inputs.length]).fetch(0)
          INSERT INTO app.email_finder_jobs(organization_id,user_id,kind,total)
          VALUES($1::uuid,$2::uuid,$3,$4::integer) RETURNING *
        SQL
        rows(<<~SQL, [org, row.fetch("id"), JSON.generate(inputs)])
          INSERT INTO app.email_finder_job_items(organization_id,job_id,row_number,input)
          SELECT $1::uuid,$2::uuid,item.ordinality,item.value
          FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY item
        SQL
        empty_items = [] # @type var empty_items: Array[object]
        row.slice("id", "kind", "status", "total", "completed").merge("created_at" => timestamp(row.fetch("created_at")), "items" => empty_items)
      end

      def jobs(org, user)
        empty_items = [] # @type var empty_items: Array[object]
        rows("SELECT id,kind,status,total,completed,created_at FROM app.email_finder_jobs WHERE organization_id=$1::uuid AND user_id=$2::uuid ORDER BY created_at DESC LIMIT 50", [org, user])
          .map { |row| row.merge("created_at" => timestamp(row.fetch("created_at")), "items" => empty_items) }
      end

      def job(org, user, id)
        row = rows("SELECT * FROM app.email_finder_jobs WHERE organization_id=$1::uuid AND user_id=$2::uuid AND id=$3::uuid", [org, user, id]).first
        raise CollaborationError.new("not_available") unless row
        project_job(row)
      end

      def project_job(row)
        org = row.fetch("organization_id").to_s
        items = rows("SELECT row_number AS row,input,result FROM app.email_finder_job_items WHERE job_id=$1::uuid ORDER BY row_number", [row.fetch("id")]).map do |item|
          # AIDEV-NOTE: PG worker rows are strings; preserve the integer API shape previously decoded from JSON.
          item["row"] = item.fetch("row").to_i
          item["input"] = object(item.fetch("input"))
          item["result"] = object(item["result"]) if item["result"]
          item.delete("result") unless item["result"]
          item
        end
        rules = suppression_rules(org)
        suppressed_names = rules.keys.filter_map { |key| key.delete_prefix("person:") if key.start_with?("person:") }
        unless suppressed_names.empty?
          rows("SELECT email,name FROM app.email_finder_people WHERE organization_id=$1::uuid", [org]).each do |person|
            if rules.key?("person:#{Input.suppression('person', person.fetch('name'))}")
              rules["email:#{person.fetch("email")}"] = true
            end
          end
        end
        items.each do |item|
          item.delete("work")
          input = item.fetch("input")
          result = item["result"]
          if suppressed?(org, input, rules) || (result && suppressed?(org, input.merge("email" => result["email"], "name" => result["name"] || input["name"]), rules))
            empty_input = {} # @type var empty_input: object
            item["input"] = empty_input
            item["result"] = suppressed_result
          elsif result && result["emails"]
            result["emails"] = result["emails"].reject { |entry| suppressed?(org, { "email" => entry["email"], "name" => entry["name"] }, rules) }
          end
        end
        row.slice("id", "kind", "status", "total", "completed").merge("created_at" => timestamp(row.fetch("created_at")), "items" => items)
      end

      def suppressed_result
        { "status" => "suppressed", "confidence" => 0, "reasons" => ["Opt-out suppression"], "sources" => [], "checked_at" => Time.now.utc.iso8601 }
      end

      def suppressions(org)
        rows("SELECT id,kind,value,created_at FROM app.email_finder_suppressions WHERE organization_id=$1::uuid ORDER BY created_at DESC LIMIT 10000", [org])
          .map { |row| row.merge("created_at" => timestamp(row.fetch("created_at"))) }
      end

      def suppress(org, kind, value)
        normalized = Input.suppression(kind, value)
        # AIDEV-NOTE: Serialize opt-out additions per tenant so the management cap never hides older rules.
        rows("SELECT pg_advisory_xact_lock(hashtextextended($1, 7419030))", [org])
        current = suppressions(org)
        existing = current.find { |row| row["kind"] == kind && row["value"] == normalized }
        return existing if existing
        raise CollaborationError.new("request_invalid") if current.length >= 10000
        rows("INSERT INTO app.email_finder_suppressions(organization_id,kind,value) VALUES($1::uuid,$2,$3) ON CONFLICT DO NOTHING", [org, kind, normalized])
        suppressions(org).find { |row| row["kind"] == kind && row["value"] == normalized } || raise(CollaborationError.new("internal_error"))
      end

      def unsuppress(org, id)
        rows("DELETE FROM app.email_finder_suppressions WHERE organization_id=$1::uuid AND id=$2::uuid", [org, id])
        { "deleted" => true }
      end

      def suppression_rules(org)
        # AIDEV-NOTE: Expand once per batch; conservative opt-outs also cover predictable but unconfirmed addresses.
        index = {} # @type var index: Hash[String, bool]
        suppressions(org).each do |rule|
          index["#{rule.fetch('kind')}:#{rule.fetch('value')}"] = true
          next unless rule["kind"] == "person"
          Core.candidates(rule.fetch("value"), "suppression.invalid").each do |candidate|
            index["email_local:#{candidate.fetch('email').split('@').first}"] = true
          end
        end
        index
      end

      def suppressed?(org, input, rules = nil)
        email = input["email"].to_s.downcase
        domain = input["domain"].to_s.downcase
        email_domain = email.split("@").last.to_s
        domains = [domain, email_domain].reject(&:empty?).uniq
        name = input["name"].to_s
        name = Input.suppression("person", name) unless name.empty?
        if rules
          return true if rules.key?("email:#{email}") || rules.key?("person:#{name}") ||
            (!email.empty? && rules.key?("email_local:#{email.split('@').first}"))
          return domains.any? do |host|
            labels = host.split(".")
            labels.each_index.any? { |position| rules.key?("domain:#{labels.drop(position).join('.')}") }
          end
        end
        matched = !rows(<<~SQL, [org, email, domain, name, email_domain]).empty?
          SELECT 1 FROM app.email_finder_suppressions WHERE organization_id=$1::uuid
          AND ((kind='email' AND value=$2) OR (kind='domain' AND (value=$3 OR $3 LIKE '%.' || value OR value=$5 OR $5 LIKE '%.' || value))
          OR (kind='person' AND (value=$4 OR EXISTS (
            SELECT 1 FROM app.email_finder_people p WHERE p.organization_id=$1::uuid AND p.email=$2 AND p.name=value)))) LIMIT 1
        SQL
        return true if matched
        return false if email.empty?
        rows("SELECT value FROM app.email_finder_suppressions WHERE organization_id=$1::uuid AND kind='person'", [org]).any? do |rule|
          !Core.patterns_for(rule.fetch("value"), email).empty?
        end
      end

      def state_get(key)
        row = rows("SELECT value FROM app.email_finder_rate_state WHERE key=$1", [key]).first
        row ? object(row.fetch("value")) : {}
      end

      def state_put(key, value)
        rows("INSERT INTO app.email_finder_rate_state(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [key, JSON.generate(value)])
        nil
      end

      def health
        health = state_get("health")
        limits = state_get("smtp")
        used = limits["day"] == Time.now.utc.strftime("%F") ? limits.fetch("used", 0).to_i : 0
        { "smtp_available" => health.fetch("available", false), "smtp_reason" => health.fetch("reason", "Worker has not started"),
          "ehlo_hostname" => health["hostname"], "remaining_daily_probes" => [50 - used, 0].max,
          "halted_until" => limits["halted_until"], "worker_seen_at" => health["seen_at"] }
      end

      def timestamp(value)
        value.is_a?(Time) ? value.utc.iso8601 : Time.parse(value.to_s).utc.iso8601
      end

      def export(job)
        CSV.generate do |csv|
          csv << %w[row status email confidence name title reasons sources checked_at]
          job.fetch("items").each do |item|
            empty_result = {} # @type var empty_result: object
            result = item.fetch("result", empty_result)
            values = [item["row"], result["status"] || "pending", result["email"], result["confidence"],
              result["name"], result["title"], Array(result["reasons"]).join("; "), Array(result["sources"]).join("; "), result["checked_at"]]
            # AIDEV-NOTE: Prefix spreadsheet formula triggers, including whitespace, in every exported cell.
            csv << values.map { |value| value.to_s.match?(/\A[\s]*[=+@-]/) ? "'#{value}" : value }
          end
        end
      end
    end
  end
end
