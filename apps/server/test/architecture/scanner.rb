# frozen_string_literal: true

require "ripper"
require "json"
require "digest"

# AIDEV-NOTE: Parse Ruby syntax, not comments; exact exceptions cannot authorize a different caller or target.
class ArchitectureScanner
  attr_reader :definitions, :references

  def initialize(sources)
    @sources = sources
    @definitions = {}
    @declarations = Hash.new { |hash, key| hash[key] = [] }
    @references = []
    sources.each { |file, source| walk(Ripper.sexp(source) || raise("Invalid Ruby: #{file}"), [], file, true) }
    sources.each { |file, source| walk(Ripper.sexp(source), [], file, false) }
  end

  def path(node)
    return [] unless node.is_a?(Array)
    return [node[1]] if node[0] == :@const
    return path(node[1]) if %i[const_ref var_ref top_const_ref].include?(node[0])
    return path(node[1]) + path(node[2]) if %i[const_path_ref const_path_field].include?(node[0])
    []
  end

  def walk(node, scope, file, declaring)
    return unless node.is_a?(Array)
    if %i[class module].include?(node[0])
      name = path(node[1])
      full = name.first == "Elevateo" ? name : scope + name
      @definitions[full.join("::")] = file if declaring
      @declarations[full.join("::")] << file if declaring
      node.drop(2).each { |child| walk(child, full, file, declaring) }
    elsif node[0] == :assign && node[1]&.first == :var_field && node[1][1]&.first == :@const
      @definitions[(scope + [node[1][1][1]]).join("::")] = file if declaring
      walk(node[2], scope, file, declaring)
    elsif %i[const_path_ref top_const_ref const_ref var_ref].include?(node[0]) && !path(node).empty?
      unless declaring
        name = path(node).join("::")
        candidates = scope.length.downto(0).map { |n| (scope.first(n) + [name]).join("::") }
        target = candidates.find { |candidate| @definitions.key?(candidate) }
        # Resolve known nested values exactly; unknown descendants still resolve to their known owner.
        target ||= candidates.flat_map { |candidate| parts = candidate.split("::"); (parts.size - 1).downto(1).map { |n| parts.first(n).join("::") } }.find { |candidate| @definitions.key?(candidate) }
        @references << [file, target] if target && target.start_with?("Elevateo::")
      end
    else
      node.each { |child| walk(child, scope, file, declaring) if child.is_a?(Array) }
    end
  end

  def tables
    @sources.flat_map do |file, source|
      # Inspect literal fragments; dynamic relation construction requires a reviewed source digest below.
      strings = Ripper.lex(source).select { |token| token[1] == :on_tstring_content }.map { |token| token[2] }
      strings.flat_map do |string|
        string.scan(/\b(app(?:_[a-z_]+)?)"?[ \t]*\.[ \t]*"?([a-z_][a-z_0-9]*)/i).map { |schema, table| [file, "#{schema}.#{table}".downcase] }
      end
    end.uniq.sort
  end

  def violations(policy)
    files = policy.fetch("files")
    owners = policy.fetch("tables")
    exceptions = policy.fetch("exceptions")
    errors = @sources.keys.reject { |file| files.key?(file) }.map { |file| "Unclassified source: #{file}" }
    @declarations.each do |name, declarations|
      next if name == "Elevateo"
      errors << "Cross-module declaration: #{name}" if declarations.map { |file| files[file] }.uniq.size > 1
      parts = name.split("::")
      (2...parts.length).each do |length|
        parents = @declarations.fetch(parts.first(length).join("::"), [])
        if parents.any? { |parent| declarations.any? { |file| files[parent] != files[file] } }
          errors << "Cross-module namespace extension: #{name}"
        end
      end
    end
    # AIDEV-NOTE: Dynamic SQL adapters require an exact source digest; edits force a fresh ownership review.
    @sources.each do |file, source|
      dynamic = source.match?(/\bapp(?:_[a-z_]+)?\.[a-z_]*\#\{/i) || source.include?('.sub("app.",') ||
        source.match?(/\b(?:FROM|JOIN|UPDATE|INTO)\s+\#\{/i) ||
        Ripper.lex(source).any? { |token| token[1] == :on_tstring_content && token[2].match?(/(?:(?:\b(?:FROM|JOIN|INTO)|\A\s*UPDATE)\s+|\bapp(?:_[a-z_]+)?\.)\z/i) }
      if dynamic && policy.fetch("dynamic_sql", {})[file] != Digest::SHA256.hexdigest(source.gsub("\r\n", "\n"))
        errors << "Unreviewed dynamic SQL: #{file}"
      end
      Ripper.lex(source).select { |token| token[1] == :on_tstring_content }.each do |token|
        string = token[2]
        next unless string.match?(/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i)
        string.scan(/\b(FROM|JOIN|UPDATE|INTO)\s+("?[a-z_][a-z_0-9]*"?)(\s*[.(]|[^a-z_0-9]|$)/i).each do |verb, name, following|
          next if name.casecmp?("SET") # ON CONFLICT DO UPDATE SET is not a relation.
          next if following.strip == "." || (following.strip == "(" && %w[FROM JOIN].include?(verb.upcase))
          key = "#{file}|#{name.delete('"').downcase}"
          errors << "Unqualified SQL relation: #{key}" unless policy.fetch("local_sql_names", []).include?(key)
        end
      end
      if Ripper.lex(source).any? { |token| token[1] == :on_ident && %w[const_get constantize safe_constantize].include?(token[2]) }
        errors << "Dynamic constant lookup is not an architecture contract: #{file}"
      end
    end
    edges = references.uniq.filter_map do |file, target|
      owner = definitions.fetch(target)
      next if files[file] == files[owner]
      next if policy.fetch("public").include?(target)
      ["constant", file, target]
    end
    tables.each do |file, table|
      if policy.fetch("functions").include?(table)
        errors << "Undeclared SQL contract: #{file}|#{table}" unless policy.fetch("sql_contracts", []).include?("#{file}|#{table}")
        next
      end
      owner = owners[table]
      if owner.nil?
        errors << "Unknown SQL object: #{file} -> #{table}"
      elsif owner != "shared_kernel" && owner != files[file]
        edges << ["table", file, table]
      end
    end
    edges.uniq.each do |kind, file, target|
      key = [kind, file, target].join("|")
      errors << "Undeclared #{key}" unless exceptions.key?(key) && !exceptions[key].strip.empty?
    end
    exceptions.each_key do |key|
      errors << "Stale exception: #{key}" unless edges.any? { |edge| edge.join("|") == key }
    end
    errors.sort
  end

  def self.sources(root)
    patterns = ["lib/elevateo/**/*.rb", "app/**/*.rb", "bin/*", "attachment_gateway/**/*.rb", "attachment_gateway/*.ru", "config/initializers/*.rb"]
    patterns.flat_map { |pattern| Dir.glob(File.join(root, pattern)) }.sort.to_h do |file|
      [file.delete_prefix(root + "/"), File.read(file)]
    end
  end
end
