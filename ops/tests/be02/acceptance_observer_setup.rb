# frozen_string_literal: true

require_relative "acceptance_observer_role"
require_relative "acceptance_observer_io"
require "uri"

module Be02Acceptance
  # AIDEV-NOTE: Only Soren's disposable CI fixture container receives admin configuration; observer/browser never do.
  class ObserverSetup
    def self.run
      raise "disposable_environment_required" unless ENV.fetch("BE02_ACCEPTANCE_DISPOSABLE") == "true" &&
        ENV.fetch("ELEVATEO_MODE") == "local" && ENV.fetch("ELEVATEO_OUTBOUND_HOLD") == "true"
      nonce = ENV.fetch("BE02_ACCEPTANCE_NONCE")
      raise "disposable_nonce_invalid" unless /\A[0-9a-f]{64}\z/.match?(nonce)
      url = URI.parse(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
      raise "disposable_database_invalid" unless %w[postgres postgresql].include?(url.scheme) &&
        url.host == "db" && url.port == 5432 && url.path == "/postgres" && url.user == "supabase_admin" &&
        !url.password.to_s.empty? && url.query.nil? && url.fragment.nil?
      seed = ObserverIO.read_private("/acceptance/seed.json")
      actor = seed.fetch("actors").fetch("composer")
      password = SecureRandom.hex(32)
      db = PG.connect(host: "db", port: 5432, dbname: "postgres", user: "supabase_admin",
        password: URI::DEFAULT_PARSER.unescape(url.password), connect_timeout: 3)
      db.set_notice_processor { |_notice| nil }
      db.exec_params("SELECT set_config('qa404.disposable_nonce',$1,false)", [nonce])
      binding = ObserverRole.create(db, organization_id: seed.fetch("organizations").fetch("primary"),
        mailbox_id: seed.fetch("mailboxes").fetch("primary"), actor_id: actor.fetch("user_id"),
        sentinel_draft_id: seed.fetch("data").fetch("draft_primary"), disposable_nonce: nonce, password: password)
      %w[/observer-config /observer-control].each do |directory|
        stat = File.lstat(directory)
        raise "observer_directory_invalid" unless stat.directory? && stat.uid == Process.euid &&
          (stat.mode & 0o777) == 0o700 && File.realpath(directory) == directory && Dir.empty?(directory)
      end
      write("/observer-config/role.json", { "binding" => binding, "password" => password })
      write("/observer-control/binding.json", { "nonce" => nonce })
      published = true
    ensure
      ObserverRole.drop(db, binding) if db && binding && !published
      db&.close
    end

    def self.write(path, data)
      File.open(path, File::WRONLY | File::CREAT | File::EXCL | File::NOFOLLOW, 0o600) do |file|
        file.write(JSON.generate(data) + "\n")
        file.flush
        file.fsync
      end
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    Be02Acceptance::ObserverSetup.run
    puts "observer_setup=ready"
  rescue StandardError
    warn "observer_setup=failed; discard exact disposable task dataset"
    exit 1
  end
end
