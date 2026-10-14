# frozen_string_literal: true

require_relative "../be02/http_support"

module Be03HTTP
  class Failure < StandardError; end

  # AIDEV-NOTE: Real Auth/cookie helpers are reused only inside Soren's isolated disposable lifecycle.
  class Fixture
    attr_reader :client, :seed, :assertions

    def initialize
      @assertions = 0
      @headers = {} # : Hash[String, String]
      database = URI(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
      check(%w[postgres postgresql].include?(database.scheme) && database.host == "db" &&
        database.port == 5432 && database.user == "supabase_admin" && database.path == "/postgres" &&
        database.query.nil? && database.fragment.nil?, "isolated_database_required")
      check(ENV.fetch("ELEVATEO_MODE") == "local" && ENV.fetch("ELEVATEO_OUTBOUND_HOLD") == "true" &&
        ENV.fetch("ELEVATEO_SEND_API_ENABLED") == "true" &&
        ENV.fetch("ELEVATEO_BROWSER_ORIGIN") == "http://api:3000", "isolated_api_required")
      @client = Be02Http.new
      @seed = Be02Fixture.new
    end

    def check(condition, code)
      @assertions += 1
      raise Failure, code unless condition
    end

    def expect(response, code)
      check(response.code == code.to_s, "http_#{code}_required")
      client.json(response)
    end

    def authenticate
      link = seed.invite
      response = client.request("get", link)
      check(response.code == "303", "invitation_redirect_required")
      expect(client.request("post", "/v1/auth/accept", body: { password: seed.password },
        headers: client.challenge), 200)
      # Membership triggers use the established generation lock ordering before any API snapshot is issued.
      database do |db|
        db.transaction do
          db.exec_params("SELECT app_auth.lock_authorization_generations($1,$2)", [seed.organization, seed.user])
          db.exec_params(<<~SQL, [seed.organization, seed.mailbox, seed.user])
            INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id,compose,approve_send)
            VALUES ($1,$2,$3,true,true)
          SQL
          db.exec_params("INSERT INTO app_send_private.organization_policy VALUES ($1,1,clock_timestamp())", [seed.organization])
          db.exec_params("INSERT INTO app_send_private.mailbox_policy VALUES ($1,$2,true)", [seed.organization, seed.mailbox])
        end
      end
      current = expect(client.request("get", "/v1/session"), 200)
      @headers = { "X-Session-Context" => text(current.fetch("context_id")),
        "X-Authorization-Version" => text(current.fetch("authorization_version")),
        "Origin" => "http://api:3000", "X-CSRF-Token" => text(current.fetch("csrf_token")) }
    end

    def request(method, path, body: nil, headers: {})
      client.request(method, path, body: body, headers: @headers.merge(headers))
    end

    def save(draft, version: 0)
      expect(request("put", "/v1/drafts/#{draft}", body: {
        mailbox_id: seed.mailbox, operation_id: SecureRandom.uuid, expected_version: version,
        subject: "Synthetic correspondence", to: [{ "display_name" => nil, "address" => "Recipient@EXAMPLE.invalid" }],
        body_text: "Synthetic local fixture", reply_to_thread_id: nil }), 200)
    end

    def review(draft)
      expect(request("get", "/v1/drafts/#{draft}/send-review?mailbox_id=#{seed.mailbox}"), 200)
    end

    def approval(draft, body, headers: {})
      request("post", "/v1/drafts/#{draft}/send-approvals", body: body, headers: headers)
    end

    def binding(review)
      { mailbox_id: seed.mailbox, operation_id: SecureRandom.uuid,
        expected_version: review.fetch("draft_version"), review_digest: review.fetch("review_digest"),
        correspondence_confirmed: true }
    end

    # AIDEV-NOTE: Open a fresh committed snapshot; scope counts to this fixture, never compare global fleet totals.
    def counts
      database do |db|
        row = db.exec_params(<<~SQL, [seed.organization]).first
          SELECT (SELECT count(*) FROM app_send_private.intents WHERE organization_id=$1) AS intents,
            (SELECT count(*) FROM app_send_private.jobs j JOIN app_send_private.intents i USING(send_id)
              WHERE i.organization_id=$1) AS jobs,
            (SELECT count(*) FROM app_send_private.audit_events a JOIN app_send_private.intents i USING(send_id)
              WHERE i.organization_id=$1 AND a.kind='approved') AS approved
        SQL
        raise Failure, "count_row_required" unless row
        row.values.map { |value| Integer(value, 10) }
      end
    end

    def text(value)
      raise Failure, "string_field_required" unless value.is_a?(String)
      value
    end

    def draft_state(draft)
      database { |db| db.exec_params("SELECT state,version FROM app.drafts WHERE id=$1 AND organization_id=$2",
        [draft, seed.organization]).first }
    end

    def database
      PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL")) do |db|
        db.set_notice_processor { |_notice| nil }
        check(db.exec("SELECT session_user").getvalue(0, 0) == "supabase_admin", "admin_identity_required")
        yield db
      end
    end
  end
end
