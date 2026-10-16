# frozen_string_literal: true

require "base64"
require "tmpdir"
require "net/smtp"
require "/workspace/ops/tests/be02/attachment_support"
require_relative "inbound_process"

# AIDEV-NOTE: Real SMTP/IMAP plus the actual worker process must reach private Storage, scans and authenticated downloads.
class MoxAttachmentIngressTest < AttachmentFixture
  include MoxInboundProcess
  CA = "/evidence/fixture-ca.pem"
  FROM = "outreach000@send.test"
  RECIPIENT = "seed000@seed.test"

  def provision
    @account = SecureRandom.uuid
    @subject = "MAIL1028 attachment #{@account}"
    @passwords = JSON.parse(File.read("/evidence/fixture-credentials.json"))
    @admin.exec_params("INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification) VALUES($1,$2,'team')",
      [@fixture.organization, @fixture.mailbox])
    @admin.exec_params(<<~SQL, [@account, @fixture.organization, @fixture.mailbox])
      INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version,active,poll_enabled)
        VALUES($1,$2,$3,'test:attachment-mox',1,true,true)
    SQL
  end

  def with_credentials
    Dir.mktmpdir("attachment-mox-") do |directory|
      path, token = File.join(directory, "credentials.json"), File.join(directory, "storage-token")
      entry = { account_id: @account, organization_id: @fixture.organization, mailbox_id: @fixture.mailbox,
        credential_version: 1, credential_ref: "test:attachment-mox", protocol: "imap",
        username: RECIPIENT, password: @passwords.fetch(RECIPIENT) }
      File.write(path, JSON.generate(format_version: 1, entries: [entry]), perm: 0o600)
      File.write(token, ENV.fetch("BE02_STORAGE_SERVICE"), perm: 0o600)
      yield process_environment(path).merge("ELEVATEO_INBOUND_STORAGE_TOKEN_PATH" => token,
        "ELEVATEO_INBOUND_STORAGE_BUCKET" => "be02-attachments")
    end
  end

  def submit_mail
    boundary = "fixture-#{@account}"
    parts = [["clean.txt", CLEAN], ["malware.txt", EICAR]].map do |name, bytes|
      "--#{boundary}\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=\"#{name}\"\r\n" \
        "Content-Transfer-Encoding: base64\r\n\r\n#{Base64.strict_encode64(bytes)}\r\n"
    end.join
    mime = "From: #{FROM}\r\nTo: #{RECIPIENT}\r\nSubject: #{@subject}\r\nMIME-Version: 1.0\r\n" \
      "Content-Type: multipart/mixed; boundary=\"#{boundary}\"\r\n\r\n" \
      "--#{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nConsenting attachment fixture\r\n" \
      "#{parts}--#{boundary}--\r\n"
    context = OpenSSL::SSL::SSLContext.new
    context.set_params(verify_mode: OpenSSL::SSL::VERIFY_PEER, ca_file: CA)
    smtp = Net::SMTP.new("localhost", 1587)
    smtp.open_timeout, smtp.read_timeout = 3, 5
    smtp.enable_starttls(context)
    Timeout.timeout(10) do
      smtp.start("localhost", FROM, @passwords.fetch(FROM), :plain) { |client| client.send_message(mime, FROM, RECIPIENT) }
    end
  end

  def imported
    @admin.exec_params(<<~SQL, [@account, @subject]).to_a
      SELECT a.*,m.attachment_count FROM app.inbound_imap_receipts r
        JOIN app.messages m ON m.id=r.message_id JOIN app.threads t ON t.id=m.thread_id
        JOIN app.inbox_attachments a ON a.message_id=m.id WHERE r.account_id=$1 AND t.subject=$2 ORDER BY a.filename
    SQL
  end

  def attachment_item(row)
    { id: row.fetch("id"), key: row.fetch("storage_key"),
      path: "/v2/mailboxes/#{row.fetch('mailbox_id')}/threads/#{row.fetch('thread_id')}/messages/#{row.fetch('message_id')}/attachments/#{row.fetch('id')}/content" }
  end

  def test_process_ingests_scans_and_downloads_exact_bytes_once
    provision
    submit_mail
    with_credentials do |env|
      status, events, signalled = worker_process(env, ["--run"], signal: "TERM") { imported.length == 2 }
      assert_equal 0, status
      assert signalled
      refute(events.any? { |row| row["event"].to_s.include?("failed") })
      rows = imported
      assert_equal 2, rows.length
      assert_equal ["clean.txt", "malware.txt"], (rows.map { |row| row.fetch("filename") })
      assert_equal ["pending_scan"], rows.map { |row| row.fetch("scan_status") }.uniq
      assert_equal ["2"], rows.map { |row| row.fetch("attachment_count") }.uniq
      assert_equal 1, rows.map { |row| row.fetch("message_id") }.uniq.length
      clean, malware = rows.map { |row| attachment_item(row) }
      rows.zip([CLEAN, EICAR]).each do |row, bytes|
        assert_equal bytes.bytesize.to_s, row.fetch("byte_size")
        assert_equal Digest::SHA256.hexdigest(bytes), row.fetch("sha256")
        assert_equal bytes, @storage.get(row.fetch("storage_key"))
        expect(download(attachment_item(row)), 423)
      end
      scan(clean, "clean")
      scan(malware, "malware")
      assert_equal CLEAN, expect(download(clean), 200).body.b
      expect(download(malware), 423)
      expect(download(clean, client: Be02Http.new), 401)
      before = imported
      # AIDEV-NOTE: Rewind the cursor to force UID replay; a next scheduled poll alone cannot prove duplicate safety.
      @admin.exec_params("UPDATE app.inbound_imap_accounts SET last_uid=0,poll_next_at=clock_timestamp() WHERE id=$1", [@account])
      state = @admin.exec_params("SELECT poll_lease_token,poll_failures FROM app.inbound_imap_accounts WHERE id=$1", [@account]).first
      assert_nil state.fetch("poll_lease_token")
      assert_equal "0", state.fetch("poll_failures")
      assert_equal [@account], @admin.exec("SELECT id FROM app.inbound_imap_accounts WHERE active AND poll_enabled").column_values(0)
      replay, replay_events, = worker_process(env, ["--once"])
      assert_equal 0, replay, "replay results: #{replay_events.map { |event| event['result'] }.inspect}"
      assert_equal "polled", replay_events.last.fetch("result")
      assert_equal before, imported
      cookie = @client.cookies.fetch("elevateo_session")
      expect(@client.request("post", "/v1/auth/logout", body: { scope: "local" }, headers: @client.challenge), 200)
      @client.cookies["elevateo_session"] = cookie
      expect(download(clean), 401)
    end
  end
end
