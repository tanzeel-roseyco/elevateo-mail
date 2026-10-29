# frozen_string_literal: true

require "net/http"
require "uri"
require "tempfile"
require "base64"
require_relative "smtp"

module Elevateo
  module EmailFinder
    class Discovery
      ENGINES = { "duckduckgo" => "https://html.duckduckgo.com/html/?q=",
        "bing" => "https://www.bing.com/search?q=", "mojeek" => "https://www.mojeek.com/search?q=" }.freeze
      AGENTS = ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15"].freeze
      PATHS = %w[/ /contact /about /team /leadership /people /company].freeze

      def initialize(state:)
        @state = state
      end

      # AIDEV-NOTE: Only the globally serialized worker calls discovery; engine clocks survive worker restarts.
      def discover(domain: nil, company: nil, role: nil, allowed_domain: ->(_domain) { true })
        # @type var reasons: Array[String]
        reasons = []
        if domain.nil? || domain.empty?
          found = search("#{company} official website")
          reasons.concat(found.fetch("reasons"))
          domain = found.fetch("results").filter_map do |result|
            candidate = URI.parse(result.fetch("url")).host
            next if candidate.nil? || candidate.match?(/(?:linkedin|facebook|wikipedia|bing|duckduckgo|mojeek)\./i)
            candidate = candidate.delete_prefix("www.")
            next unless allowed_domain.call(candidate)
            begin
              next if DNS.mx(candidate).empty?
              candidate
            rescue IOError, SystemCallError, Timeout::Error, Resolv::ResolvError
              nil
            end
          end.first
          return empty(reasons, found.fetch("unavailable")) if domain.nil?
        end
        return empty(["Domain suppressed"], false).merge("domain" => domain, "suppressed" => true) unless allowed_domain.call(domain)
        mx = DNS.mx(domain)
        return empty(["Domain has no MX records"], false).merge("domain" => domain) if mx.empty?
        site = crawl(domain)
        query = role.nil? || role.empty? ? "\"@#{domain}\"" : "\"#{role}\" \"#{company || domain}\" site:linkedin.com/in"
        found = search(query)
        emails = site.fetch("emails")
        people = site.fetch("people")
        found.fetch("results").each do |result|
          source = result.fetch("url")
          Core.extract_emails("#{result.fetch('title')} #{result.fetch('snippet')}", domain).each do |email|
            emails << { "email" => email, "source" => source }
          end
          person = Core.person_from_snippet(result.fetch("title"), result.fetch("snippet"))
          people << person.merge("source" => source) if person
        end
        { "domain" => domain, "mx" => mx, "provider" => Core.provider(mx.map { |item| item.fetch("host") }),
          "emails" => emails.uniq.first(200), "people" => people.uniq.first(100),
          "sources" => (site.fetch("sources") + found.fetch("results").map { |item| item.fetch("url") }).uniq,
          "reasons" => reasons + site.fetch("reasons") + found.fetch("reasons"),
          "unavailable" => site.fetch("sources").empty? && found.fetch("unavailable") }
      rescue IOError, SystemCallError, Timeout::Error, Resolv::ResolvError, URI::InvalidURIError => error
        empty(["Discovery unavailable: #{error.class}: #{error.message}"], true)
      end

      def search(query)
        # @type var reasons: Array[String]
        reasons = []
        available = false
        ENGINES.each do |engine, endpoint|
          key = "search:#{engine}"
          state = @state.state_get(key)
          now = Time.now.to_f
          if state.fetch("blocked_until", 0).to_f > now || state.fetch("next_at", 0).to_f > now
            reasons << "#{engine}: temporarily unavailable (rate limit or block backoff)"
            next
          end
          @state.state_put(key, state.merge("next_at" => now + 10 + Random.rand(0.0..5.0)))
          begin
            response = fetch("#{endpoint}#{URI.encode_www_form_component(query.slice(0, 300))}")
            html = response.fetch("body")
            if response.fetch("code") != 200 || blocked?(html)
              @state.state_put(key, { "next_at" => now + 21_600, "blocked_until" => now + 21_600 })
              reasons << "#{engine}: blocked; retry after six hours"
              next
            end
            available = true
            results = parse_search(engine, html)
            return { "results" => results, "unavailable" => false, "reasons" => reasons } unless results.empty?
          rescue IOError, SystemCallError, Timeout::Error, OpenSSL::SSL::SSLError, Resolv::ResolvError, ArgumentError, URI::InvalidURIError => error
            reasons << "#{engine}: #{error.class}"
          end
        end
        { "results" => [], "unavailable" => !available, "reasons" => reasons }
      end

      def parse_search(engine, html)
        selector = { "duckduckgo" => ".result", "bing" => "li.b_algo", "mojeek" => "ul.results-standard li" }.fetch(engine)
        Core.document(html).css(selector).to_a.first(20).filter_map do |node|
          link = node.at_css("a.result__a,h2 a,a.title")
          next unless link
          url = link["href"].to_s
          url = "https:#{url}" if url.start_with?("//")
          parsed = URI.parse(url)
          if parsed.host&.end_with?("duckduckgo.com") && parsed.query
            url = URI.decode_www_form(parsed.query).to_h.fetch("uddg", url)
            parsed = URI.parse(url)
          end
          if parsed.host == "www.bing.com" && parsed.path == "/ck/a" && parsed.query
            encoded = URI.decode_www_form(parsed.query).to_h.fetch("u", "")
            if encoded.start_with?("a1")
              url = Base64.urlsafe_decode64(encoded.delete_prefix("a1"))
              parsed = URI.parse(url)
            end
          end
          next unless %w[http https].include?(parsed.scheme) && parsed.host && !parsed.userinfo
          { "url" => url.slice(0, 2048).to_s, "title" => link.content.strip.slice(0, 300).to_s,
            "snippet" => Core.node_text(node).slice(0, 1000).to_s }
        rescue URI::InvalidURIError, ArgumentError
          nil
        end
      end

      def crawl(domain)
        origin = "https://#{domain}"
        robots = fetch("#{origin}/robots.txt", origin: origin)
        unless [200, 404, 410].include?(robots.fetch("code"))
          return { "emails" => [], "people" => [], "sources" => [], "reasons" => ["robots.txt unavailable; crawl withheld"] }
        end
        rules = robots.fetch("code") == 200 ? robots.fetch("body") : ""
        robots_cache = { "#{origin}:443" => rules }
        queue = PATHS.map { |path| "#{origin}#{path}" }
        # @type var visited: Array[String]
        visited = []
        # @type var emails: Array[Hash[String, String]]
        emails = []
        # @type var people: Array[Hash[String, String]]
        people = []
        # @type var sources: Array[String]
        sources = []
        # @type var reasons: Array[String]
        reasons = []
        until queue.empty? || visited.length >= 14
          url = queue.shift.to_s
          next if visited.include?(url)
          visited << url
          parsed_url = URI.parse(url)
          next unless parsed_url.is_a?(URI::HTTP)
          path = parsed_url.request_uri
          begin
            response = fetch(url, origin: origin, robots_cache: robots_cache)
            next unless response.fetch("code") == 200
            body = response.fetch("body")
            if response.fetch("type").include?("application/pdf") || path.downcase.end_with?(".pdf")
              text = pdf_text(body)
            else
              document = Core.document(body)
              text = Core.node_text(document) + " " + document.css("a[href^='mailto:']").to_a.map { |link| link["href"].to_s }.join(" ")
              Core.extract_people(body).each { |person| people << person.merge("source" => url) }
              document.css("a[href]").to_a.first(500).each do |link|
                target = URI.join(url, link["href"].to_s)
                next unless same_site?(target, origin) && target.query.nil?
                next unless target.path.to_s.match?(/contact|about|team|leadership|people|company|\.pdf\z/i)
                target.fragment = nil
                queue << target.to_s if queue.length < 30
              rescue URI::InvalidURIError
                next
              end
            end
            sources << url
            Core.extract_emails(text, domain).each { |email| emails << { "email" => email, "source" => url } }
          rescue IOError, SystemCallError, Timeout::Error, OpenSSL::SSL::SSLError, Resolv::ResolvError, ArgumentError, URI::InvalidURIError => error
            reasons << "#{url}: #{error.class}"
          end
        end
        { "emails" => emails.uniq, "people" => people.uniq, "sources" => sources, "reasons" => reasons }
      rescue IOError, SystemCallError, Timeout::Error, OpenSSL::SSL::SSLError, Resolv::ResolvError, ArgumentError, URI::InvalidURIError => error
        { "emails" => [], "people" => [], "sources" => [], "reasons" => ["Company site unavailable: #{error.class}"] }
      end

      def robots_allowed?(body, path)
        priority = 0
        selected_priority = 0
        directives_seen = false
        # @type var matching: Array[[Integer, Integer, bool]]
        matching = []
        body.each_line do |line|
          directive, value = line.split("#", 2).first.to_s.split(":", 2).map(&:strip)
          next unless directive && value
          if directive.downcase == "user-agent"
            priority = 0 if directives_seen
            directives_seen = false
            agent_priority = value.downcase == "emailfinder" ? 2 : (value == "*" ? 1 : 0)
            priority = [priority, agent_priority].max
            selected_priority = [selected_priority, priority].max
          elsif %w[allow disallow].include?(directive.downcase)
            directives_seen = true
            next unless priority.positive? && !value.empty?
            expression = Regexp.escape(value).gsub("\\*", ".*").gsub("\\$", "$")
            matching << [priority, value.length, directive.downcase == "allow"] if Regexp.new("\\A#{expression}").match?(path)
          end
        end
        # AIDEV-NOTE: A specific crawler group replaces wildcard rules; repeated selected groups combine.
        selected = matching.select { |rank, _length, _allow| rank == selected_priority }
        selected.empty? || selected.sort_by { |_rank, length, allow| [length, allow ? 1 : 0] }.last&.last == true
      end

      private

      def blocked?(html)
        html.match?(/captcha|anomaly-modal|verify (?:you are|that you)|unusual traffic|access denied|automated requests/i)
      end

      def empty(reasons, unavailable)
        { "domain" => nil, "mx" => [], "provider" => "other", "emails" => [], "people" => [],
          "sources" => [], "reasons" => reasons, "unavailable" => unavailable }
      end

      def same_site?(uri, origin)
        base = URI.parse(origin)
        uri.scheme == base.scheme && uri.port == base.port && uri.host&.delete_prefix("www.") == base.host&.delete_prefix("www.")
      end

      def fetch(url, origin: nil, redirects: 0, robots_cache: nil)
        uri = URI.parse(url)
        raise IOError, "Unsafe URL" unless uri.is_a?(URI::HTTP) && uri.host && !uri.userinfo && [80, 443].include?(uri.port)
        raise IOError, "Cross-origin crawl redirect" if origin && !same_site?(uri, origin)
        if robots_cache
          # AIDEV-NOTE: Recheck every redirect before I/O; www and apex have independent robots policies.
          authority = "#{uri.scheme}://#{uri.host}:#{uri.port}"
          unless robots_cache.key?(authority)
            policy = fetch("#{authority}/robots.txt", origin: origin)
            raise IOError, "robots.txt unavailable; crawl withheld" unless [200, 404, 410].include?(policy.fetch("code"))
            robots_cache[authority] = policy.fetch("code") == 200 ? policy.fetch("body") : ""
          end
          raise IOError, "robots.txt disallows this URL" unless robots_allowed?(robots_cache.fetch(authority), uri.request_uri)
        end
        address = DNS.address(uri.host.to_s)
        http = Net::HTTP.new(uri.host.to_s, uri.port, nil)
        http.ipaddr = address
        http.use_ssl = uri.scheme == "https"
        http.open_timeout = 5
        http.read_timeout = 5
        http.write_timeout = 5
        body = +""
        # @type var response: Net::HTTPResponse?
        response = nil
        Timeout.timeout(15) do
          http.request_get(uri.request_uri, { "User-Agent" => "#{AGENTS.sample} EmailFinder/1.0", "Accept-Encoding" => "identity" }) do |incoming|
            response = incoming
            incoming.read_body do |chunk|
              raise IOError, "Response exceeds 2 MB" if body.bytesize + chunk.bytesize > 2_097_152
              body << chunk
            end
          end
        end
        raise IOError, "No HTTP response" unless response
        if [301, 302, 303, 307, 308].include?(response.code.to_i)
          raise IOError, "Redirect limit exceeded" if redirects >= 2
          return fetch(URI.join(url, response["location"].to_s).to_s, origin: origin, redirects: redirects + 1, robots_cache: robots_cache)
        end
        body = body.force_encoding(Encoding::UTF_8).scrub unless response["content-type"].to_s.include?("application/pdf")
        { "code" => response.code.to_i, "body" => body,
          "type" => response["content-type"].to_s }
      end

      def pdf_text(body)
        Tempfile.create(["email-finder", ".pdf"]) do |file|
          file.binmode
          file.write(body)
          file.flush
          output = +""
          IO.popen(["pdftotext", "-f", "1", "-l", "20", "-enc", "UTF-8", file.path, "-"], "r") do |pipe|
            begin
              Timeout.timeout(10) { output = pipe.read(2_097_153).to_s }
              raise IOError, "PDF output exceeds 2 MB" if output.bytesize > 2_097_152
            ensure
              begin
                Process.kill("KILL", pipe.pid)
              rescue Errno::ESRCH
                # AIDEV-NOTE: The converter can already have exited; IO.popen reaps its child in either case.
              end
            end
          end
          output
        end
      end
    end
  end
end
