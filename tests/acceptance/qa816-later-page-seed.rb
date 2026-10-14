# frozen_string_literal: true

require "json"
require "pg"
require "securerandom"
require "time"
require "uri"

# AIDEV-NOTE: Task-private augmentation after the frozen BE02 seed; only a disposable fleet DB may run this.
module Qa816LaterPageSeed
  UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/
  SEED_PATH = "/acceptance/seed.json"
  SIDECAR_PATH = "/acceptance/qa816-later-page.json"

  def self.require_safe(value, code)
    raise code unless value
  end

  def self.run
    require_safe(ENV.fetch("ELEVATEO_BROWSER_ORIGIN") == "http://app.test" &&
      ENV.fetch("ELEVATEO_MODE") == "local" && ENV.fetch("ELEVATEO_OUTBOUND_HOLD") == "true", "isolated_environment_required")
    endpoint = URI.parse(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    require_safe(%w[postgres postgresql].include?(endpoint.scheme) && endpoint.host == "db" &&
      endpoint.port == 5432 && endpoint.user == "supabase_admin" && endpoint.path == "/postgres" &&
      !endpoint.password.to_s.empty? && endpoint.query.nil? && endpoint.fragment.nil?, "database_endpoint_invalid")
    directory = File.lstat("/acceptance")
    require_safe(directory.directory? && File.realpath("/acceptance") == "/acceptance" &&
      (directory.mode & 0o777) == 0o700 && !File.exist?(SIDECAR_PATH), "private_output_required")
    seed = File.open(SEED_PATH, File::RDONLY | File::NOFOLLOW) do |file|
      require_safe(file.stat.file? && file.stat.size <= 65_536, "seed_file_invalid")
      JSON.parse(file.read)
    end
    require_safe(seed.fetch("kind") == "runtime" && seed.fetch("schema_version") == 2 &&
      seed.fetch("fixture_variant") == "base", "base_runtime_seed_required")
    org, mailbox = seed.fetch("organizations").fetch("primary"), seed.fetch("mailboxes").fetch("primary")
    thread = seed.fetch("data").fetch("thread_primary")
    require_safe([org, mailbox, thread].all? { |id| UUID.match?(id) }, "seed_ids_invalid")
    base_time = Time.iso8601(seed.fetch("data").fetch("ordered_at")).utc
    marker = "QA816_LATER_#{SecureRandom.hex(12)}"
    ids = Array.new(20) { SecureRandom.uuid }
    db = PG.connect(host: "db", port: 5432, dbname: "postgres", user: "supabase_admin",
      password: URI::DEFAULT_PARSER.unescape(endpoint.password), connect_timeout: 3,
      options: "-c statement_timeout=10000 -c lock_timeout=5000 -c application_name=qa816_later_page_seed")
    db.set_notice_processor { |_notice| nil }
    begin
      require_safe(db.exec("SELECT session_user").getvalue(0, 0) == "supabase_admin", "admin_role_required")
      db.transaction do
        count = db.exec_params("SELECT count(*) FROM app.messages WHERE organization_id=$1 AND mailbox_id=$2 AND thread_id=$3",
          [org, mailbox, thread]).getvalue(0, 0)
        require_safe(count == "1", "fresh_one_message_thread_required")
        ids.each_with_index do |id, index|
          sent_at = (base_time + index + 1).iso8601(6)
          body = index == 19 ? marker : "QA816 page #{index + 2} synthetic text"
          db.exec_params(<<~SQL, [id, org, mailbox, thread, sent_at, body])
            INSERT INTO app.messages
              (id, organization_id, mailbox_id, thread_id, sender, recipients, sent_at, body_text, attachment_count, created_at)
            VALUES ($1,$2,$3,$4,'{"display_name":"QA816 synthetic","address":"qa816@acceptance.test"}',
              '[]',$5,$6,0,$5)
          SQL
        end
        count = db.exec_params("SELECT count(*) FROM app.messages WHERE organization_id=$1 AND mailbox_id=$2 AND thread_id=$3",
          [org, mailbox, thread]).getvalue(0, 0)
        require_safe(count == "21", "later_page_count_invalid")
      end
    ensure
      db.close
    end
    sidecar = { schema_version: 1, kind: "qa816_later_page", mailbox_id: mailbox, thread_id: thread,
      message_id: ids.last, marker: marker, message_count: 21, first_page_limit: 20 }
    File.open(SIDECAR_PATH, File::WRONLY | File::CREAT | File::EXCL | File::NOFOLLOW, 0o600) do |file|
      require_safe(file.stat.uid == Process.euid && (file.stat.mode & 0o777) == 0o600, "sidecar_mode_invalid")
      file.write(JSON.generate(sidecar) + "\n")
      file.flush
      file.fsync
    end
    puts "qa816_later_page=ready messages=21"
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    File.umask(0o077)
    Qa816LaterPageSeed.run
  rescue StandardError
    warn "qa816_later_page=failed; discard the disposable fixture"
    exit 1
  end
end
