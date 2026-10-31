require_relative "scanner"
s = ArchitectureScanner.new(ArchitectureScanner.sources(File.expand_path("../..", __dir__)))
puts JSON.pretty_generate({definitions: s.definitions, references: s.references.uniq.sort, tables: s.tables})
