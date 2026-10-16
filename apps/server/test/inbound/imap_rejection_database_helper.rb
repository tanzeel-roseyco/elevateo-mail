# frozen_string_literal: true

require_relative "imap_polling_database_helper"

# AIDEV-NOTE: Restricted worker functions are the only runtime path; admin fixture cleanup preserves FK ordering.
class ImapRejectionDatabaseTestCase < ImapPollingDatabaseTestCase
  def teardown
    @accounts&.each { |id| @admin.exec_params("DELETE FROM app.inbound_imap_rejections WHERE account_id=$1", [id]) }
    super
  end

  def reject_mail(token, uid: 1, validity: 42, version: 1, digest: "a" * 64, reason: "unsupported_mime", connection: @worker)
    JSON.parse(connection.exec_params(<<~SQL, [@account, version, validity, uid, digest, reason, token]).getvalue(0, 0))
      SELECT app.leased_reject_imap_mail($1::uuid,$2::integer,$3::bigint,$4::bigint,$5::text,$6::text,$7::uuid)
    SQL
  end

  def rejections
    @admin.exec_params("SELECT * FROM app.inbound_imap_rejections WHERE account_id=$1 ORDER BY uid", [@account]).to_a
  end
end
