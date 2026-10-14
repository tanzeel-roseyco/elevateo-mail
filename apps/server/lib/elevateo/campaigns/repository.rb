# frozen_string_literal: true

require "digest"
require "json"
require "active_record"
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
            input.attributes.fetch("consent_recorded_at"), input.attributes.fetch("consent_source"), input.attributes.fetch("suppressed")]
        when "account"
          [input.id, org, input.attributes.fetch("campaign_id"), input.operation_id,
            input.attributes.fetch("mailbox_id"), input.attributes.fetch("label")]
        else WriteInput.invalid!
        end
        if input.kind == "account"
          visible = rows("SELECT id FROM app.mailboxes WHERE organization_id=$1::uuid AND id=$2::uuid",
            [org, input.attributes.fetch("mailbox_id")]).first
          raise CollaborationError.new("not_available") unless visible
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
              consent_status, consent_recorded_at, consent_source, suppressed_at)
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7::timestamptz,$8,
              CASE WHEN $9::boolean THEN now() ELSE NULL END)
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
        else WriteInput.invalid!
        end
        inserted = rows(sql, values)
        return inserted.first.fetch("id") if inserted.length == 1
        existing = rows(case input.kind
          when "campaign" then "SELECT id,name,status FROM app.campaigns WHERE organization_id=$1::uuid AND operation_id=$2::uuid"
          when "lead" then "SELECT id,email,consent_status,consent_recorded_at,consent_source,suppressed_at FROM app.campaign_leads WHERE organization_id=$1::uuid AND campaign_id=$3::uuid AND operation_id=$2::uuid"
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
            timestamp(row["consent_recorded_at"]) == input.attributes["consent_recorded_at"] &&
            row["consent_source"] == input.attributes["consent_source"] &&
            (!row["suppressed_at"].nil?) == input.attributes["suppressed"]
        when "account"
          row["mailbox_id"] == input.attributes["mailbox_id"] && row["label"] == input.attributes["label"]
        else false
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

      # AIDEV-NOTE: ID keyset stays within tenant/campaign scope; the HTTP boundary caps limit and cursor bytes.
      def page(kind:, organization_id:, campaign_id: nil, cursor: nil, limit: 50)
        WriteInput.invalid! unless limit.is_a?(Integer) && limit.between?(1, 100)
        org = WriteInput.uuid(organization_id)
        after = cursor.nil? ? nil : WriteInput.uuid(cursor)
        table = table_for(kind)
        values = [org]
        filter = "organization_id=$1::uuid"
        WriteInput.invalid! if kind == "lead" && campaign_id.nil?
        if campaign_id
          values << WriteInput.uuid(campaign_id)
          filter += " AND campaign_id=$2::uuid"
        end
        values << after
        values << (limit + 1)
        cursor_index, cap_index = values.length - 1, values.length
        data = rows("SELECT #{selection_for(kind)} FROM app.#{table} WHERE #{filter} AND ($#{cursor_index}::uuid IS NULL OR id > $#{cursor_index}::uuid) ORDER BY id ASC LIMIT $#{cap_index}::integer", values)
        items = data.first(limit).map { |row| project(kind, row) }
        { "items" => items, "next_cursor" => data.length > limit ? items.last.fetch("id") : nil }
      end

      def detail(kind:, organization_id:, id:)
        org = WriteInput.uuid(organization_id)
        resource = WriteInput.uuid(id)
        row = rows("SELECT #{selection_for(kind)} FROM app.#{table_for(kind)} WHERE organization_id=$1::uuid AND id=$2::uuid", [org, resource]).first
        raise CollaborationError.new("not_available") unless row
        project(kind, row)
      end

      # AIDEV-NOTE: Operation advisory lock serializes same-key retries before row mutation; stored response is replayed.
      def replace(input, organization_id:, expected_version:, actor_id: nil, intent: nil, preserve_consent: false)
        WriteInput.invalid! unless input.is_a?(Input) && expected_version.is_a?(Integer) &&
          expected_version.between?(1, 2_147_483_646)
        WriteInput.invalid! unless preserve_consent == true || preserve_consent == false
        WriteInput.invalid! if preserve_consent && input.kind != "lead"
        org = WriteInput.uuid(organization_id)
        actor = actor_id.nil? ? nil : WriteInput.uuid(actor_id)
        WriteInput.invalid! if input.kind == "lead" && actor.nil?
        intent_fields = intent.nil? ? input.attributes : intent
        WriteInput.invalid! unless intent_fields.is_a?(Hash) && intent_fields.keys.all? { |key| key.is_a?(String) }
        fingerprint = Digest::SHA256.hexdigest(JSON.generate([input.kind, input.id, expected_version,
          intent_fields.sort.to_h, actor]))
        rows("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [input.operation_id])
        previous = rows("SELECT fingerprint,result FROM app.campaign_mutations WHERE organization_id=$1::uuid AND operation_id=$2::uuid", [org, input.operation_id]).first
        if previous
          raise CollaborationError.new("operation_mismatch") unless previous["fingerprint"] == fingerprint
          result = previous.fetch("result")
          return result.is_a?(String) ? JSON.parse(result) : result
        end
        fields = input.attributes
        sql, values = case input.kind
        when "campaign"
          ["UPDATE app.campaigns SET name=$4,status=$5,version=version+1,updated_at=now() WHERE organization_id=$1::uuid AND id=$2::uuid AND version=$3::integer RETURNING *",
            [org, input.id, expected_version, fields.fetch("name"), fields.fetch("status")]]
        when "lead"
          if preserve_consent
            ["UPDATE app.campaign_leads SET version=version+1 WHERE organization_id=$1::uuid AND id=$2::uuid AND version=$3::integer AND email=$4 AND campaign_id=$5::uuid RETURNING *",
              [org, input.id, expected_version, fields.fetch("email"), fields.fetch("campaign_id")]]
          else
            [<<~SQL, [org, input.id, expected_version, fields.fetch("email"), fields.fetch("consent_status"), fields.fetch("consent_recorded_at"), fields.fetch("consent_source"), fields.fetch("suppressed"), fields.fetch("campaign_id"), actor]]
            UPDATE app.campaign_leads SET email=$4,consent_status=$5,consent_recorded_at=$6::timestamptz,
              consent_source=$7,consent_recorded_by=$10::uuid,
              suppressed_at=CASE WHEN $8::boolean THEN COALESCE(suppressed_at,now()) ELSE suppressed_at END,
              version=version+1
            WHERE organization_id=$1::uuid AND id=$2::uuid AND version=$3::integer AND campaign_id=$9::uuid
            RETURNING *
          SQL
          end
        when "account"
          ["UPDATE app.campaign_accounts SET label=$4,version=version+1 WHERE organization_id=$1::uuid AND id=$2::uuid AND version=$3::integer AND campaign_id=$5::uuid AND mailbox_id=$6::uuid RETURNING *",
            [org, input.id, expected_version, fields.fetch("label"), fields.fetch("campaign_id"), fields.fetch("mailbox_id")]]
        else WriteInput.invalid!
        end
        updated = rows(sql, values).first
        unless updated
          visible = rows("SELECT id FROM app.#{table_for(input.kind)} WHERE organization_id=$1::uuid AND id=$2::uuid", [org, input.id]).first
          raise CollaborationError.new(visible ? "draft_conflict" : "not_available")
        end
        if input.kind == "lead" && !preserve_consent
          rows(<<~SQL, [org, fields.fetch("campaign_id"), input.id, input.operation_id, actor,
            fields.fetch("consent_status"), fields.fetch("consent_source"), fields.fetch("consent_recorded_at")])
            INSERT INTO app.campaign_consent_events(organization_id,campaign_id,lead_id,operation_id,
              actor_id,status,source,observed_at)
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8::timestamptz)
          SQL
        end
        result = detail(kind: input.kind, organization_id: org, id: input.id)
        rows(<<~SQL, [org, input.operation_id, input.kind, input.id, fingerprint, JSON.generate(result)])
          INSERT INTO app.campaign_mutations(organization_id,operation_id,resource_kind,resource_id,fingerprint,result)
          VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6::jsonb)
        SQL
        result
      end

      def selection_for(kind)
        return "*" unless kind == "lead"
        "*, EXISTS (SELECT 1 FROM app.campaign_suppressions s WHERE s.organization_id=campaign_leads.organization_id AND s.email=campaign_leads.email) AS globally_suppressed"
      end

      def table_for(kind)
        case kind
        when "campaign" then "campaigns"
        when "lead" then "campaign_leads"
        when "account" then "campaign_accounts"
        else WriteInput.invalid!
        end
      end

      def project(kind, row)
        case kind
        when "campaign"
          { "id" => row.fetch("id"), "name" => row.fetch("name"), "status" => row.fetch("status"), "version" => row.fetch("version").to_i }
        when "lead"
          { "id" => row.fetch("id"), "campaign_id" => row.fetch("campaign_id"), "email" => row.fetch("email"),
            "consent_status" => row.fetch("consent_status"), "suppressed" => !row["suppressed_at"].nil? || row["globally_suppressed"] == true,
            "consent_recorded_at" => timestamp(row["consent_recorded_at"]),
            "consent_source" => row["consent_source"], "consent_recorded_by" => row["consent_recorded_by"],
            "version" => row.fetch("version").to_i }
        when "account"
          { "id" => row.fetch("id"), "campaign_id" => row.fetch("campaign_id"), "mailbox_id" => row.fetch("mailbox_id"),
            "label" => row.fetch("label"), "status" => row.fetch("status"), "version" => row.fetch("version").to_i }
        else WriteInput.invalid!
        end
      end

      def timestamp(value)
        return nil if value.nil?
        parsed = value.is_a?(Time) ? value : Time.iso8601(value.to_s)
        parsed.utc.iso8601
      rescue ArgumentError
        raise CollaborationError.new("internal_error")
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
