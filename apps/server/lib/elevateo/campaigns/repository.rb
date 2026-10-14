# frozen_string_literal: true

require_relative "input"

module Elevateo
  module Campaigns
    # AIDEV-NOTE: Caller owns SessionWrites tenant frame and CSRF guard; all writes remain inert.
    class Repository
      def initialize(connection:)
        @connection = connection
      end

      def save(input, organization_id:)
        WriteInput.invalid! unless input.is_a?(Input)
        org = WriteInput.uuid(organization_id)
        values = case input.kind
        when "campaign"
          [input.id, org, input.operation_id, input.attributes.fetch("name"), input.attributes.fetch("status")]
        when "lead"
          [input.id, org, input.attributes.fetch("campaign_id"), input.operation_id,
            input.attributes.fetch("email"), input.attributes.fetch("consent_status"),
            input.attributes.fetch("consent_recorded_at"), input.attributes.fetch("suppressed")]
        when "account"
          [input.id, org, input.attributes.fetch("campaign_id"), input.operation_id,
            input.attributes.fetch("mailbox_id"), input.attributes.fetch("label")]
        end
        sql = case input.kind
        when "campaign"
          <<~SQL
            INSERT INTO app.campaigns(id, organization_id, operation_id, name, status)
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5)
            ON CONFLICT DO NOTHING
            RETURNING id
          SQL
        when "lead"
          <<~SQL
            INSERT INTO app.campaign_leads(id, organization_id, campaign_id, operation_id, email,
              consent_status, consent_recorded_at, suppressed_at)
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7::timestamptz,
              CASE WHEN $8::boolean THEN now() ELSE NULL END)
            ON CONFLICT DO NOTHING
            RETURNING id
          SQL
        when "account"
          <<~SQL
            INSERT INTO app.campaign_accounts(id, organization_id, campaign_id, operation_id, mailbox_id, label)
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6)
            ON CONFLICT DO NOTHING
            RETURNING id
          SQL
        end
        inserted = rows(sql, values)
        return inserted.first.fetch("id") if inserted.length == 1
        existing = rows(case input.kind
          when "campaign" then "SELECT id,name,status FROM app.campaigns WHERE organization_id=$1::uuid AND operation_id=$2::uuid"
          when "lead" then "SELECT id,email,consent_status,consent_recorded_at,suppressed_at FROM app.campaign_leads WHERE organization_id=$1::uuid AND campaign_id=$3::uuid AND operation_id=$2::uuid"
          when "account" then "SELECT id,mailbox_id,label FROM app.campaign_accounts WHERE organization_id=$1::uuid AND campaign_id=$3::uuid AND operation_id=$2::uuid"
          end, [org, input.operation_id, input.attributes["campaign_id"]].compact).first
        raise CollaborationError.new("not_available") unless existing && existing.fetch("id") == input.id
        raise CollaborationError.new("operation_mismatch") unless replay_same?(input, existing)
        input.id
      end

      def replay_same?(input, row)
        case input.kind
        when "campaign"
          row["name"] == input.attributes["name"] && row["status"] == input.attributes["status"]
        when "lead"
          row["email"] == input.attributes["email"] && row["consent_status"] == input.attributes["consent_status"] &&
            row["consent_recorded_at"]&.utc&.iso8601 == input.attributes["consent_recorded_at"] &&
            (!row["suppressed_at"].nil?) == input.attributes["suppressed"]
        when "account"
          row["mailbox_id"] == input.attributes["mailbox_id"] && row["label"] == input.attributes["label"]
        end
      end

      def suppress(organization_id:, email:, reason:)
        org = WriteInput.uuid(organization_id)
        address = Input.email(email)
        WriteInput.invalid! unless %w[unsubscribe bounce manual].include?(reason)
        rows(<<~SQL, [org, address, reason])
          INSERT INTO app.campaign_suppressions(organization_id,email,reason)
          VALUES ($1::uuid,$2,$3)
          ON CONFLICT (organization_id,email) DO NOTHING
          RETURNING email
        SQL
        address
      end

      def analytics(organization_id:, campaign_id:)
        org = WriteInput.uuid(organization_id)
        campaign = WriteInput.uuid(campaign_id)
        row = rows(<<~SQL, [org, campaign]).first
          SELECT c.id,
            count(l.id)::integer AS lead_count,
            count(l.id) FILTER (WHERE l.consent_status='granted' AND l.suppressed_at IS NULL
              AND s.email IS NULL)::integer AS consented_count
          FROM app.campaigns c
          LEFT JOIN app.campaign_leads l ON l.organization_id=c.organization_id AND l.campaign_id=c.id
          LEFT JOIN app.campaign_suppressions s ON s.organization_id=c.organization_id AND s.email=l.email
          WHERE c.organization_id=$1::uuid AND c.id=$2::uuid
          GROUP BY c.id
        SQL
        raise CollaborationError.new("not_available") unless row
        row
      end

      def list(kind:, organization_id:, campaign_id: nil)
        org = WriteInput.uuid(organization_id)
        sql, values = case kind
        when "campaign"
          ["SELECT id,name,status,created_at FROM app.campaigns WHERE organization_id=$1::uuid ORDER BY created_at DESC,id LIMIT 100", [org]]
        when "lead"
          campaign = WriteInput.uuid(campaign_id)
          ["SELECT id,email,consent_status,suppressed_at FROM app.campaign_leads WHERE organization_id=$1::uuid AND campaign_id=$2::uuid ORDER BY created_at DESC,id LIMIT 100", [org, campaign]]
        when "account"
          campaign = WriteInput.uuid(campaign_id)
          ["SELECT id,mailbox_id,label,status FROM app.campaign_accounts WHERE organization_id=$1::uuid AND campaign_id=$2::uuid ORDER BY created_at DESC,id LIMIT 100", [org, campaign]]
        else
          WriteInput.invalid!
        end
        rows(sql, values)
      end

      def rows(sql, values)
        binds = values.map do |value|
          ActiveRecord::Relation::QueryAttribute.new("campaign", value, ActiveRecord::Type::Value.new)
        end
        @connection.exec_query(sql, "Campaign foundation", binds).to_a
      end
    end
  end
end
