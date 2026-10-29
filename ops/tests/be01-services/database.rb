# frozen_string_literal: true

require "pg"
require "digest"
require "timeout"
require_relative "state"

# AIDEV-NOTE: This is a separate administrator fixture process; restricted checks never inherit its password.
begin
  Timeout.timeout(60) do
    mode = ARGV.fetch(0)
    Be01Services.expect(%w[seed baseline compare].include?(mode), "database phase")
    mode = "compare" if mode == "seed" && File.exist?("/acceptance/database-baseline.json")
    data = Be01Services::State.load
    ids = Be01Services::State.identities
    db = PG.connect(host: "db", dbname: "postgres", user: "supabase_admin",
                    password: ENV.fetch("POSTGRES_PASSWORD"), connect_timeout: 3,
                    options: "-c statement_timeout=5000 -c lock_timeout=2000")
    Be01Services.expect(db.exec("SELECT session_user, current_user").values == [["supabase_admin", "supabase_admin"]],
                        "fixture admin identity")
    if mode == "seed"
      # No conflict upserts: missing rows must not be silently recreated after a restart.
      db.transaction do |connection|
        connection.exec_params("INSERT INTO app.organizations(id,name) VALUES($1,$2)", [data.fetch("org"), "BE01 acceptance"])
        ids.each do |id|
          connection.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES($1,$2)",
                                 [data.fetch("org"), id])
        end
        connection.exec_params(<<~SQL, [data.fetch("mailbox"), data.fetch("org"), "proof@be01.invalid"])
          INSERT INTO app.mailboxes(id,organization_id,address,visibility,storage_object_path)
          VALUES($1::uuid,$2,$3,'private',$1::text || '/proof.bin')
        SQL
        connection.exec_params(<<~SQL, [data.fetch("org"), data.fetch("mailbox"), ids.first])
          INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id) VALUES($1,$2,$3)
        SQL
      end
    end
    # Whole-table sorted rows catch duplicate seed writes as well as loss of the selected fixture.
    snapshot = %w[organizations organization_memberships mailboxes mailbox_memberships].to_h do |table|
      rows = db.exec("SELECT row_to_json(t)::text FROM app.#{table} t ORDER BY row_to_json(t)::text").values.flatten
      [table, { "count" => rows.length, "sha256" => Digest::SHA256.hexdigest(JSON.generate(rows)) }]
    end
    Be01Services.expect(snapshot.fetch("organizations").fetch("count") > 0, "nonempty persistence baseline")
    if %w[seed baseline].include?(mode)
      Be01Services::State.write_once("/acceptance/database-baseline.json", snapshot)
    else
      Be01Services.expect(snapshot == Be01Services::State.read("/acceptance/database-baseline.json"),
                          "all application rows retained exactly")
    end
    puts "PASS database #{mode}"
  ensure
    db&.close
  end
rescue StandardError => error
  warn "FAIL database fixture (#{error.class.name})"
  exit 1
end
