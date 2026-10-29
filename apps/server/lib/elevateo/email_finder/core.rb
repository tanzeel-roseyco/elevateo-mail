# frozen_string_literal: true

require "time"
require "nokogiri"

module Elevateo
  module EmailFinder
    # AIDEV-NOTE: Pure evidence rules never turn a public sighting or catch-all acceptance into verification.
    module Core
      PATTERNS = %w[first.last firstlast flast f.last first firstl last.first last first_last first-last].freeze
      EMAIL = /[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}/i
      TITLE = /\b(?:CEO|CTO|CFO|COO|CMO|CIO|Chief [\p{L} ]{2,40} Officer|Head of [\p{L} &-]{2,40}|(?:Vice President|VP|Director|President|Founder|Co-Founder)(?: of [\p{L} &-]{2,40})?)\b/i

      def self.normalize(value)
        value.unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").downcase.tr("łđðø", "lddo")
          .gsub("þ", "th").gsub("æ", "ae").gsub("œ", "oe").gsub("ß", "ss")
      end

      def self.role_matches?(title, role)
        aliases = { "ceo" => "chief executive officer", "cto" => "chief technology officer",
          "cfo" => "chief financial officer", "coo" => "chief operating officer",
          "cmo" => "chief marketing officer", "cio" => "chief information officer" }
        requested = normalize(role).strip.gsub(/\s+/, " ")
        return false if requested.empty?
        canonical = aliases.fetch(requested, requested)
        actual = normalize(title).gsub(/\b(?:ceo|cto|cfo|coo|cmo|cio)\b/) { |word| aliases.fetch(word) }
        /(?:\A|\W)#{Regexp.escape(canonical)}(?:\z|\W)/.match?(actual)
      end

      def self.name_parts(name)
        words = normalize(name).gsub(/[^a-z\s-]/, "").split
        words.reject! { |word| %w[mr mrs ms dr prof jr sr].include?(word) }
        return ["", ""] if words.empty?
        remaining = words.drop(1)
        # AIDEV-NOTE: Preserve surname particles; otherwise a middle given name is not part of the surname.
        last = %w[de del della di da dos du van von der den la le].include?(remaining.first) ? remaining.join : remaining.last.to_s
        [words.first.to_s.delete("-"), last.delete("-")]
      end

      def self.candidates(name, domain, domain_patterns = {}, global_patterns = {})
        first, last = name_parts(name)
        return [] if first.empty? || last.empty?
        locals = ["#{first}.#{last}", "#{first}#{last}", "#{first[0]}#{last}", "#{first[0]}.#{last}",
          first, "#{first}#{last[0]}", "#{last}.#{first}", last, "#{first}_#{last}", "#{first}-#{last}"]
        ranked = PATTERNS.each_with_index.map { |pattern, index| { "email" => "#{locals[index]}@#{domain.downcase}", "pattern" => pattern } }
        # AIDEV-NOTE: Boundary-valid long names may still produce SMTP-invalid candidate local parts.
        ranked.select! { |candidate| candidate.fetch("email").bytesize <= 254 && candidate.fetch("email").split("@", 2).first.to_s.bytesize <= 64 }
        ranked.sort_by { |candidate| [-domain_patterns.fetch(candidate.fetch("pattern"), 0),
          -global_patterns.fetch(candidate.fetch("pattern"), 0), PATTERNS.index(candidate.fetch("pattern")).to_i] }
          .uniq { |candidate| candidate.fetch("email") }
      end

      def self.patterns_for(name, email)
        domain = email.split("@", 2).last.to_s
        candidates(name, domain).select { |candidate| candidate.fetch("email") == email.downcase }
          .map { |candidate| candidate.fetch("pattern") }
      end

      def self.classify(code, _text = "")
        return "valid" if code == 250
        return "invalid" if [550, 551, 553].include?(code)
        "unknown"
      end

      def self.blocked?(text)
        /spamhaus|blocked|blacklisted|blocklist|poor reputation/i.match?(text)
      end

      def self.catch_all_score(pattern_count, total_count, sightings)
        evidence = total_count.positive? ? (40.0 * pattern_count / total_count).round : 0
        [25 + evidence + [sightings, 3].min * 8, 89].min
      end

      def self.result(status, checked_at:, email: nil, confidence: 0, reasons: [], sources: [])
        result = { "status" => status, "confidence" => confidence.clamp(0, 100), "reasons" => reasons,
          "sources" => sources.uniq, "checked_at" => checked_at }
        result["email"] = email unless email.nil?
        result
      end

      def self.extract_emails(text, domain = nil)
        plain = text.gsub(/\s*(?:\[at\]|\(at\))\s*/i, "@").gsub(/\s*(?:\[dot\]|\(dot\))\s*/i, ".")
        plain.downcase.scan(EMAIL).filter_map do |email|
          next unless email.is_a?(String)
          local = email.split("@").first.to_s
          valid = email.bytesize <= 254 && local.bytesize <= 64 && !local.start_with?(".") && !local.end_with?(".") && !local.include?("..") &&
            (domain.nil? || email.split("@").last == domain.downcase)
          email if valid
        end.uniq.first(200)
      end

      def self.document(html)
        Nokogiri::HTML5::Document.parse(html, nil, "UTF-8", max_tree_depth: 128, max_attributes: 128, max_errors: 0)
      end

      def self.node_text(node)
        node.xpath(".//text()[not(ancestor::script) and not(ancestor::style)]").to_a.map(&:content).join(" ").gsub(/\s+/, " ").strip
      end

      def self.extract_people(html)
        document(html).css("article,li,.person,.team-member,.leadership-member").to_a.filter_map do |node|
          text = node_text(node)
          title = text[TITLE]
          heading = node.at_css("h2,h3,h4,.name")
          name = heading ? heading.content.strip : text.split(/\s*[-|–]\s*/, 2).first.to_s
          next unless title && name.match?(/\A[\p{L}][\p{L} .'-]{1,100}\z/) && name.split.length.between?(2, 6)
          next if name.match?(TITLE)
          { "name" => name, "title" => title }
        end.uniq.first(100)
      end

      def self.person_from_snippet(title, snippet)
        name = title.split(/\s*[-|–]\s*/, 2).first.to_s.strip
        role = "#{title} #{snippet}"[TITLE]
        return nil unless role && name.match?(/\A[\p{L}][\p{L} .'-]{1,100}\z/) && name.split.length.between?(2, 6)
        { "name" => name, "title" => role }
      end

      def self.provider(hosts)
        normalized = hosts.map { |host| host.downcase.delete_suffix(".") }
        return "google_workspace" if normalized.any? { |host| host.match?(/(?:\A|\.)(?:google|googlemail)\.com\z/) }
        return "microsoft_365" if normalized.any? { |host| host.end_with?(".mail.protection.outlook.com") }
        return "proofpoint" if normalized.any? { |host| host.match?(/(?:\A|\.)(?:pphosted|ppe-hosted)\.com\z/) }
        return "mimecast" if normalized.any? { |host| host.end_with?(".mimecast.com") }
        "other"
      end
    end
  end
end
