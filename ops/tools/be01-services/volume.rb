# frozen_string_literal: true
require "find"
# AIDEV-NOTE: Inspect content before exact owned-volume removal; unexpected paths retain the volume.
mode = ARGV.fetch(0)
raise "mode" unless /\A(?:init|check)-(?:data|config|storage|state)\z/.match?(mode)
root = "/acceptance"
if mode == "init-state"
  raise "nonempty state" unless Dir.empty?(root)
  File.chown(10001, 10001, root)
  File.chmod(0o700, root)
else
  allowed = case mode
            when "check-data" then /\A(?:PG_VERSION|base|global|pg_[a-z0-9_]+|pg_(?:hba|ident)\.conf|postgresql\.(?:auto\.)?conf|postmaster\.(?:pid|opts))\z/
            when "check-config" then /\A[a-zA-Z0-9_.-]+\.conf\z/
            when "check-storage" then /\Astub\z/
            when "check-state" then /\A(?:state|identities|services-ready|database-baseline|credentials-baseline)\.json\z/
            else raise "mode"
            end
  raise "unexpected root content" unless Dir.children(root).all? { |name| allowed.match?(name) }
  count = 0
  Find.find(root) do |path|
    stat = File.lstat(path)
    raise "unsafe file type" unless stat.file? || stat.directory?
    raise "content limit" if (count += 1) > 100_000
  end
end
puts "PASS volume #{mode}"
