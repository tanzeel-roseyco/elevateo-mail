# frozen_string_literal: true

# AIDEV-NOTE: Existing named fixtures keep their signatures; scheduled accounts require fenced worker functions.
class LeaseImapPolling < ActiveRecord::Migration[8.1]
  FUNCTIONS = {
    "claim_imap_account" => ["p_account uuid,p_version integer", "jsonb"],
    "reset_imap_uidvalidity" => ["p_account uuid,p_version integer,p_expected bigint,p_new bigint", "boolean"],
    "ingest_imap_mail" => ["p_account uuid,p_version integer,p_validity bigint,p_uid bigint,p_digest text," \
      "p_sender jsonb,p_recipients jsonb,p_subject text,p_body text", "jsonb"],
    "ingest_imap_mail_with_attachments" => ["p_account uuid,p_version integer,p_validity bigint,p_uid bigint," \
      "p_digest text,p_sender jsonb,p_recipients jsonb,p_subject text,p_body text,p_attachments jsonb", "jsonb"]
  }.freeze

  def up
    execute File.read(File.expand_path("imap_polling/schema.sql", __dir__))
    FUNCTIONS.each do |name, (arguments, result)|
      types = arguments.split(",").map { |argument| argument.split.last }.join(",")
      execute "ALTER FUNCTION app.#{name}(#{types}) RENAME TO #{name}_unleased_core"
      # AIDEV-NOTE: Rename preserves ACLs; revoke the old worker entry point before exposing either guarded wrapper.
      execute "REVOKE ALL ON FUNCTION app.#{name}_unleased_core(#{types}) " \
        "FROM PUBLIC,elevateo_worker,elevateo_api,elevateo_app_read"
      install_wrapper(name, arguments, result, leased: false)
      install_wrapper(name, arguments, result, leased: true)
    end
  end

  def down
    # AIDEV-NOTE: Refuse rollback with owned leases; operators must quiesce pollers and explicitly invalidate them.
    execute <<~SQL
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM app.inbound_imap_accounts WHERE poll_lease_token IS NOT NULL) THEN
          RAISE EXCEPTION 'quiesce IMAP pollers before rollback' USING ERRCODE='55000';
        END IF;
      END $$;
    SQL
    FUNCTIONS.each do |name, (arguments, _result)|
      types = arguments.split(",").map { |argument| argument.split.last }.join(",")
      execute "DROP FUNCTION app.leased_#{name}(#{types},uuid)"
      execute "DROP FUNCTION app.#{name}(#{types})"
      execute "ALTER FUNCTION app.#{name}_unleased_core(#{types}) RENAME TO #{name}"
      execute "GRANT EXECUTE ON FUNCTION app.#{name}(#{types}) TO elevateo_worker"
    end
    execute File.read(File.expand_path("imap_polling/down.sql", __dir__))
  end

  private

  def install_wrapper(name, arguments, result, leased:)
    public_name = leased ? "leased_#{name}" : name
    signature = leased ? "#{arguments},p_lease uuid" : arguments
    token = leased ? "p_lease" : "NULL::uuid"
    parameters = arguments.split(",").map { |argument| argument.split.first }.join(",")
    types = signature.split(",").map { |argument| argument.split.last }.join(",")
    execute <<~SQL
      CREATE FUNCTION app.#{public_name}(#{signature}) RETURNS #{result}
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
      BEGIN
        PERFORM app.require_imap_poll_lease(p_account,p_version,#{token});
        RETURN app.#{name}_unleased_core(#{parameters});
      END $$;
      REVOKE ALL ON FUNCTION app.#{public_name}(#{types}) FROM PUBLIC,elevateo_api,elevateo_app_read;
      GRANT EXECUTE ON FUNCTION app.#{public_name}(#{types}) TO elevateo_worker;
    SQL
  end
end
