# frozen_string_literal: true

require "digest"
require "json"
require "net/http"
require "pg"
require "securerandom"
require "uri"
require_relative "../../apps/server/lib/elevateo/attachments_storage"
require_relative "../../apps/server/lib/elevateo/attachments_scan"

# AIDEV-NOTE: Privileged fixture may run only after BE02 seed in Soren's disposable private fleet stack.
module Qa816AttachmentsSeed
  OUT = "/acceptance/qa816-attachments.json"
  SEED = "/acceptance/seed.json"
  BYTES = "QA816 private attachment fixture\n".b.freeze
  SHA = Digest::SHA256.hexdigest(BYTES)
  UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/

  def self.check(value, code)
    raise code unless value
  end

  def self.database(name, role)
    uri = URI.parse(ENV.fetch(name))
    check(%w[postgres postgresql].include?(uri.scheme) && uri.host == "db" && uri.port == 5432 &&
      uri.user == role && uri.path == "/postgres" && uri.password && !uri.password.empty? &&
      uri.query.nil? && uri.fragment.nil?, "private_database_required")
    connection = PG.connect(host: "db", port: 5432, dbname: "postgres", user: role,
      password: URI::DEFAULT_PARSER.unescape(uri.password), connect_timeout: 3,
      options: "-c statement_timeout=10000 -c lock_timeout=5000 -c application_name=qa816_attachment_seed")
    check(connection.exec("SELECT session_user,current_database()").first ==
      { "session_user" => role, "current_database" => "postgres" }, "database_identity_invalid")
    connection
  end

  def self.seed
    directory = File.lstat("/acceptance")
    check(ENV.fetch("QA816_DISPOSABLE_ATTACHMENT_SEED") == "true" &&
      ENV.fetch("ELEVATEO_MODE") == "local" && ENV.fetch("ELEVATEO_OUTBOUND_HOLD") == "true" &&
      ENV.fetch("ELEVATEO_BROWSER_ORIGIN") == "http://app.test" && directory.directory? &&
      File.realpath("/acceptance") == "/acceptance" && directory.uid == Process.euid &&
      (directory.mode & 0o777) == 0o700 && !File.exist?(OUT), "disposable_private_fixture_required")
    base = File.open(SEED, File::RDONLY | File::NOFOLLOW) do |file|
      check(file.stat.file? && file.stat.size <= 65_536 && (file.stat.mode & 0o077).zero?, "seed_file_invalid")
      JSON.parse(file.read(65_537))
    end
    check(base.fetch("schema_version") == 2 && base.fetch("kind") == "runtime" &&
      base.fetch("fixture_variant") == "base", "base_seed_required")
    primary = tuple(base, "primary")
    foreign = tuple(base, "other")
    storage = Elevateo::Attachments::PrivateStorage.new(base_url: ENV.fetch("ELEVATEO_STORAGE_URL"),
      bucket: ENV.fetch("ELEVATEO_ATTACHMENT_BUCKET"),
      service_token: ENV.fetch("ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN"), process: "worker")
    scanner = Elevateo::Attachments::ClamdScanner.new
    admin = database("BE02_ADMIN_DATABASE_URL", "supabase_admin")
    worker = database("BE02_WORKER_DATABASE_URL", "elevateo_worker")
    begin
      [primary, foreign].each do |scope|
        rows = admin.exec_params(<<~SQL, scope.values_at(:organization_id, :mailbox_id, :thread_id))
          SELECT id::text,attachment_count FROM app.messages
          WHERE organization_id=$1::uuid AND mailbox_id=$2::uuid AND thread_id=$3::uuid
        SQL
        check(rows.ntuples == 1 && rows.first.fetch("attachment_count") == "0", "fresh_message_required")
        scope[:message_id] = rows.first.fetch("id")
        check(UUID.match?(scope.fetch(:message_id)), "message_id_invalid")
      end
      check(primary.fetch(:message_id) != foreign.fetch(:message_id), "foreign_message_required")
      clean = insert_stored(admin, storage, primary, "qa816-clean.txt")
      held = insert_stored(admin, storage, primary, "qa816-held.txt")
      rejected = insert_rejected(admin, primary)
      other = insert_stored(admin, storage, foreign, "qa816-foreign.txt")
      [[clean, "clean"], [other, "clean"]].each do |item, expected|
        token = SecureRandom.uuid
        row = worker.exec_params("SELECT * FROM app.claim_inbox_attachment_scan($1::uuid,$2::uuid)",
          [item.fetch(:id), token]).first
        check(row && row.fetch("scan_attempt") == "1" && row.fetch("sha256") == SHA &&
          row.fetch("storage_key") == item.fetch(:key) && row.fetch("byte_size") == BYTES.bytesize.to_s,
          "scan_claim_invalid")
        check(storage.get(item.fetch(:key)) == BYTES && scanner.scan(BYTES) == expected, "real_scan_required")
        recorded = worker.exec_params("SELECT app.record_inbox_attachment_scan($1::uuid,$2,$3::uuid,$4::integer,$5)",
          [item.fetch(:id), SHA, token, 1, expected]).getvalue(0, 0)
        check(recorded == "t", "scan_verdict_not_committed")
      end
      admin.exec_params("UPDATE app.messages SET attachment_count=3 WHERE id=$1::uuid", [primary.fetch(:message_id)])
      admin.exec_params("UPDATE app.messages SET attachment_count=1 WHERE id=$1::uuid", [foreign.fetch(:message_id)])
      admin.close
      admin = database("BE02_ADMIN_DATABASE_URL", "supabase_admin")
      verify_committed(admin, primary, foreign, clean, held, rejected, other, storage)
      verify_authorized_bytes(base, primary, clean)
      publish(primary, foreign, clean, held, rejected, other)
    ensure
      admin.close unless admin.finished?
      worker.close unless worker.finished?
    end
  end

  def self.tuple(base, name)
    scope = { organization_id: base.fetch("organizations").fetch(name),
      mailbox_id: base.fetch("mailboxes").fetch(name), thread_id: base.fetch("data").fetch("thread_#{name}") }
    check(scope.values.all? { |id| id.is_a?(String) && UUID.match?(id) }, "scope_invalid")
    scope
  end

  def self.insert_stored(admin, storage, scope, filename)
    id = SecureRandom.uuid
    key = "quarantine/#{scope.fetch(:organization_id)}/#{id}"
    storage.put(key, BYTES, content_type: "application/octet-stream")
    admin.exec_params(<<~SQL, scope.values_at(:organization_id, :mailbox_id, :thread_id, :message_id) +
      [id, key, filename, BYTES.bytesize, SHA])
      INSERT INTO app.inbox_attachments(organization_id,mailbox_id,thread_id,message_id,id,storage_key,
        filename,content_type,byte_size,sha256,scan_status)
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,'text/plain',$8::integer,$9,'pending_scan')
    SQL
    { id: id, key: key, filename: filename }
  end

  def self.insert_rejected(admin, scope)
    id = SecureRandom.uuid
    admin.exec_params(<<~SQL, scope.values_at(:organization_id, :mailbox_id, :thread_id, :message_id) + [id])
      INSERT INTO app.inbox_attachments(organization_id,mailbox_id,thread_id,message_id,id,
        filename,content_type,byte_size,scan_status,rejection_reason)
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'qa816-rejected.txt',
        'text/plain',0,'rejected','invalid_signature')
    SQL
    { id: id }
  end

  def self.verify_committed(admin, primary, foreign, clean, held, rejected, other, storage)
    [[primary, 3], [foreign, 1]].each do |scope, expected|
      count = admin.exec_params(<<~SQL, scope.values_at(:organization_id, :mailbox_id, :thread_id, :message_id)).getvalue(0, 0)
        SELECT count(*) FROM app.inbox_attachments WHERE organization_id=$1::uuid AND mailbox_id=$2::uuid
          AND thread_id=$3::uuid AND message_id=$4::uuid
      SQL
      check(count == expected.to_s, "attachment_count_mismatch")
    end
    [[primary, clean, "clean", 3], [primary, held, "pending_scan", 3],
      [primary, rejected, "rejected", 3], [foreign, other, "clean", 1]].each do |scope, item, status, count|
      rows = admin.exec_params(<<~SQL, [item.fetch(:id)] + scope.values_at(:organization_id, :mailbox_id, :thread_id, :message_id))
        SELECT a.scan_status,a.storage_key,a.sha256,a.byte_size,m.attachment_count FROM app.inbox_attachments a
        JOIN app.messages m ON m.id=a.message_id AND m.organization_id=a.organization_id
          AND m.mailbox_id=a.mailbox_id AND m.thread_id=a.thread_id
        WHERE a.id=$1::uuid AND a.organization_id=$2::uuid AND a.mailbox_id=$3::uuid
          AND a.thread_id=$4::uuid AND a.message_id=$5::uuid
      SQL
      check(rows.ntuples == 1, "attachment_tuple_uncommitted")
      row = rows.first
      check(row.fetch("scan_status") == status && row.fetch("attachment_count") == count.to_s,
        "attachment_verdict_or_count_invalid")
      if status == "rejected"
        check(row["storage_key"].nil? && row["sha256"].nil? && row.fetch("byte_size") == "0",
          "rejected_object_invalid")
      else
        check(row.fetch("storage_key") == item.fetch(:key) && row.fetch("sha256") == SHA &&
          row.fetch("byte_size") == BYTES.bytesize.to_s && storage.get(item.fetch(:key)) == BYTES,
          "private_object_mismatch")
      end
    end
  end

  def self.verify_authorized_bytes(base, scope, clean, fetch: method(:private_get))
    cookie = ENV.fetch("QA816_READER_COOKIE")
    check(cookie.is_a?(String) && cookie.bytesize.between?(16, 4096) &&
      /\A[\x20-\x7e]+\z/.match?(cookie), "reader_cookie_required")
    session_status, _session_headers, session_body = fetch.call("/v1/session", cookie)
    check(session_status == "200", "reader_session_required")
    context = JSON.parse(session_body)
    check(context.fetch("actor").fetch("id") == base.fetch("actors").fetch("reader").fetch("user_id"),
      "reader_identity_invalid")
    headers = { "X-Session-Context" => context.fetch("context_id"),
      "X-Authorization-Version" => context.fetch("authorization_version") }
    check(headers.values.all? { |value| value.is_a?(String) && /\A[A-Za-z0-9_-]{16,256}\z/.match?(value) },
      "reader_context_invalid")
    path = "/v2/mailboxes/#{scope.fetch(:mailbox_id)}/threads/#{scope.fetch(:thread_id)}/messages/" \
      "#{scope.fetch(:message_id)}/attachments/#{clean.fetch(:id)}/content"
    status, returned_headers, body = fetch.call(path, cookie, headers)
    check(status == "200" && returned_headers["cache-control"] == "no-store" &&
      returned_headers["x-content-type-options"] == "nosniff" &&
      returned_headers["content-type"] == "application/octet-stream" &&
      returned_headers["content-disposition"] == 'attachment; filename="attachment"' &&
      returned_headers["content-length"] == BYTES.bytesize.to_s && body == BYTES,
      "authorized_bytes_unavailable")
  end

  def self.private_get(path, cookie, headers = {})
    request = Net::HTTP::Get.new(path)
    request["Cookie"] = cookie
    request["Origin"] = "http://app.test"
    headers.each { |name, value| request[name] = value }
    Net::HTTP.start("api", 3000, nil, open_timeout: 3, read_timeout: 10, max_retries: 0) do |http|
      http.request(request) do |response|
        body = +"".b
        response.read_body do |chunk|
          body << chunk
          check(body.bytesize <= 4096, "authorized_response_too_large")
        end
        [response.code, response.each_header.to_h, body]
      end
    end
  end

  def self.publish(primary, foreign, clean, held, rejected, other)
    value = { schema_version: 1, kind: "qa816_attachment_bytes",
      mailbox_id: primary.fetch(:mailbox_id), thread_id: primary.fetch(:thread_id),
      message_id: primary.fetch(:message_id),
      clean: { id: clean.fetch(:id), filename: clean.fetch(:filename), byte_size: BYTES.bytesize, sha256: SHA },
      held_id: held.fetch(:id), rejected_id: rejected.fetch(:id),
      foreign: { mailbox_id: foreign.fetch(:mailbox_id), thread_id: foreign.fetch(:thread_id),
        message_id: foreign.fetch(:message_id), attachment_id: other.fetch(:id) } }
    bytes = JSON.generate(value) + "\n"
    check(bytes.bytesize <= 4096, "sidecar_too_large")
    temporary = "/acceptance/.qa816-attachments-#{SecureRandom.hex(8)}"
    File.open(temporary, File::WRONLY | File::CREAT | File::EXCL | File::NOFOLLOW, 0o600) do |file|
      check(file.stat.uid == Process.euid && (file.stat.mode & 0o777) == 0o600, "sidecar_mode_invalid")
      file.write(bytes)
      file.flush
      file.fsync
    end
    check(!File.exist?(OUT), "sidecar_already_exists")
    File.link(temporary, OUT)
    File.delete(temporary)
    File.open("/acceptance", File::RDONLY) { |directory| directory.fsync }
  ensure
    File.delete(temporary) if temporary && File.exist?(temporary)
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    File.umask(0o077)
    Qa816AttachmentsSeed.seed
    puts "qa816_attachments=ready primary=3 foreign=1"
  rescue StandardError
    warn "qa816_attachments=failed; discard the entire disposable fixture"
    exit 1
  end
end
