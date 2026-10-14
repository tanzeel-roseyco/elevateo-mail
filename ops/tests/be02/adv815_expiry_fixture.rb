# frozen_string_literal: true

require "digest"
require_relative "http_support"

# AIDEV-NOTE: Scheduler attests a fresh disposable stack; this fixture cannot inspect Docker or attest itself.
class Adv815ExpiryFixture
  class Failure < StandardError; end
  IMAGE = "supabase/gotrue:v2.196.0@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232"
  SOURCE = "0204331ca41a5b49f076b6fa3dc6c0d20b996590"
  COLUMNS = { "invite" => ["confirmation_sent_at", "confirmation_token"],
              "recovery" => ["recovery_sent_at", "recovery_token"] }.freeze

  def initialize
    raw = ENV.fetch("ADV815_AUTH_RECEIPT", "")
    check(raw.bytesize.between?(1, 2048), "fixture_authority_unsupported")
    receipt = JSON.parse(raw)
    check(receipt.is_a?(Hash) && receipt.keys.sort ==
      %w[auth_image auth_source disposable nonce otp_seconds project ttl_source], "fixture_receipt_invalid")
    check(receipt["auth_image"] == IMAGE && receipt["auth_source"] == SOURCE, "fixture_auth_identity_invalid")
    check(receipt["disposable"] == true && receipt["project"] == ENV.fetch("ADV815_PROJECT", "") &&
      /\Abe02-[a-z0-9-]{1,60}\z/.match?(receipt["project"].to_s), "fixture_dataset_invalid")
    check(receipt["nonce"] == ENV.fetch("ADV815_NONCE", "") &&
      /\A[0-9a-f]{32}\z/.match?(receipt["nonce"].to_s), "fixture_nonce_invalid")
    @ttl = receipt["otp_seconds"]
    check(@ttl.is_a?(Integer) && @ttl.between?(1, 604800) &&
      %w[running_env pinned_default].include?(receipt["ttl_source"]), "fixture_ttl_invalid")
    check(receipt["ttl_source"] != "pinned_default" || @ttl == 86400, "fixture_default_invalid")
  rescue JSON::ParserError
    raise Failure, "fixture_receipt_invalid", cause: nil
  end

  def check(condition, code)
    raise Failure, code unless condition
  end

  def database
    PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL")) do |db|
      check(db.exec("SELECT session_user, current_database()").values == [["supabase_admin", "postgres"]],
            "fixture_database_authority_invalid")
      yield db
    end
  rescue PG::Error, KeyError, JSON::ParserError
    raise Failure, "fixture_database_unsupported", cause: nil
  end

  def schema(db, namespace, table, expected)
    rows = db.exec_params(<<~SQL, [namespace, table])
      SELECT column_name, udt_name FROM information_schema.columns
      WHERE table_schema=$1 AND table_name=$2
    SQL
    found = rows.values.to_h
    check(expected.all? { |name, type| found[name] == type }, "fixture_schema_unsupported")
  end

  def age_auth(fixture, kind, link)
    check(COLUMNS.key?(kind), "fixture_kind_invalid")
    check(fixture.user.is_a?(String) && fixture.email.is_a?(String) &&
      /\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/.match?(fixture.user) &&
      /\Abe02-http-[0-9a-f]{16}@example\.invalid\z/.match?(fixture.email), "fixture_actor_invalid")
    issued, token = COLUMNS.fetch(kind)
    check(link.is_a?(String) && link.bytesize.between?(1, 4096), "fixture_link_invalid")
    uri = URI(link)
    check(uri.host.nil? && uri.path == "/auth/accept", "fixture_link_invalid")
    query = URI.decode_www_form(uri.query.to_s).to_h
    check(query["type"] == kind && query["token"].is_a?(String) && !query["token"].empty?, "fixture_link_invalid")
    database do |db|
      schema(db, "auth", "users", { "id" => "uuid", "email" => "varchar", issued => "timestamptz", token => "varchar" })
      db.transaction do
        before = db.exec_params(<<~SQL, [fixture.user, fixture.email, @ttl])
          SELECT to_jsonb(u)::text, isfinite(#{issued}) AND #{issued} <= clock_timestamp()
            AND #{issued} > clock_timestamp()-($3::integer * interval '1 second') AS fresh
          FROM auth.users u WHERE id=$1 AND email=$2 FOR UPDATE
        SQL
        check(before.ntuples == 1, "fixture_auth_row_count_invalid")
        original = JSON.parse(before.getvalue(0, 0))
        check(original[token] == query["token"] && original[issued].is_a?(String) && before.getvalue(0, 1) == "t",
              "fixture_auth_issuance_invalid")
        # AIDEV-NOTE: SQL identifiers come only from the literal kind allowlist; all external values are parameters.
        aged = db.exec_params(<<~SQL, [fixture.user, fixture.email, @ttl + 120])
          UPDATE auth.users SET #{issued}=clock_timestamp()-($3::integer * interval '1 second')
          WHERE id=$1 AND email=$2 RETURNING to_jsonb(users)::text
        SQL
        check(aged.ntuples == 1, "fixture_auth_update_count_invalid")
        changed = JSON.parse(aged.getvalue(0, 0))
        check(changed.reject { |key, _| key == issued } == original.reject { |key, _| key == issued } &&
          changed[issued] != original[issued], "fixture_auth_token_or_authority_changed")
      end
    end
  rescue URI::InvalidURIError, ArgumentError
    raise Failure, "fixture_link_invalid", cause: nil
  end

  def digest(client)
    cookie = client.cookies["elevateo_pending"]
    check(cookie.is_a?(String) && /\A[A-Za-z0-9_-]{43}\z/.match?(cookie), "fixture_cookie_invalid")
    Digest::SHA256.hexdigest(cookie)
  end

  def age_pending(client)
    owned = digest(client)
    database do |db|
      schema(db, "app_auth", "pending_entries", { "digest" => "text", "expires_at" => "timestamptz",
        "state" => "text", "token_ciphertext" => "text" })
      db.transaction do
        before = db.exec_params("SELECT to_jsonb(e)::text FROM app_auth.pending_entries e WHERE digest=$1 FOR UPDATE", [owned])
        check(before.ntuples == 1, "fixture_pending_row_count_invalid")
        original = JSON.parse(before.getvalue(0, 0))
        check(original["state"] == "staged" && original["claim_id"].nil? && original["user_id"].nil? &&
          original["auth_session_id"].nil? && COLUMNS.key?(original["kind"]) &&
          original["token_ciphertext"].is_a?(String) && !original["token_ciphertext"].empty?, "fixture_pending_state_invalid")
        aged = db.exec_params(<<~SQL, [owned])
          UPDATE app_auth.pending_entries SET expires_at=clock_timestamp()-interval '120 seconds'
          WHERE digest=$1 RETURNING to_jsonb(pending_entries)::text
        SQL
        check(aged.ntuples == 1, "fixture_pending_update_count_invalid")
        changed = JSON.parse(aged.getvalue(0, 0))
        check(changed.reject { |key, _| key == "expires_at" } == original.reject { |key, _| key == "expires_at" } &&
          changed["expires_at"] != original["expires_at"], "fixture_pending_token_or_authority_changed")
      end
    end
  end

  def pending_state(owned, expected)
    database do |db|
      rows = db.exec_params(<<~SQL, [owned, expected])
        SELECT state=$2 AND user_id IS NULL AND auth_session_id IS NULL AND access_token_ciphertext IS NULL
          AND refresh_token_ciphertext IS NULL AS denied FROM app_auth.pending_entries WHERE digest=$1
      SQL
      check(rows.ntuples == 1 && rows.getvalue(0, 0) == "t", "fixture_denial_source_invalid")
    end
  end

  def session_count(fixture)
    database do |db|
      db.exec_params("SELECT count(*) FROM app_auth.sessions WHERE user_id=$1", [fixture.user]).getvalue(0, 0).to_i
    end
  end
end
