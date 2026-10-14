# frozen_string_literal: true

require "active_record"
require "json"
require_relative "draft_input"

module Elevateo
  module OutreachSequence
    class DraftError < StandardError
      attr_reader :code
      def initialize(code)
        @code = code
        super(code)
      end
    end

    # Caller owns the authenticated tenant transaction; this repository adds campaign-level serialization.
    class Repository
      DIGEST = /\A[0-9a-f]{64}\z/

      def initialize(connection:)
        @connection = connection
      end

      def save(input, organization_id:, session_digest:)
        raise ArgumentError, "invalid draft input" unless input.is_a?(DraftInput)
        org = uuid(organization_id)
        raise ArgumentError, "invalid session digest" unless session_digest.is_a?(String) && DIGEST.match?(session_digest)
        @connection.transaction do
          authorize!(session_digest)
          rows("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", ["#{org}:#{input.campaign_id}"])
          replay = rows(<<~SQL, [org, input.campaign_id, input.operation_id]).first
            SELECT fingerprint,result FROM app.campaign_sequence_mutations
            WHERE organization_id=$1::uuid AND campaign_id=$2::uuid AND operation_id=$3::uuid
          SQL
          if replay
            raise DraftError, "operation_mismatch" unless replay.fetch("fingerprint") == input.fingerprint
            decode(replay.fetch("result"))
          else
            result = replace_locked(input, org)
            rows(<<~SQL, [org, input.campaign_id, input.id, input.operation_id, input.fingerprint, JSON.generate(result)])
              INSERT INTO app.campaign_sequence_mutations
                (organization_id,campaign_id,sequence_id,operation_id,fingerprint,result)
              VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::jsonb)
            SQL
            result
          end
        end
      end

      # Missing and unauthorized campaign drafts share one outward result.
      def fetch(campaign_id:, organization_id:, session_digest:)
        campaign = uuid(campaign_id)
        org = uuid(organization_id)
        raise ArgumentError, "invalid session digest" unless session_digest.is_a?(String) && DIGEST.match?(session_digest)
        @connection.transaction do
          if authorize_read?(session_digest)
            rows("SELECT set_config('app.outreach_digest',$1,true)", [session_digest])
            draft = rows(<<~SQL, [org, campaign]).first
              SELECT id,campaign_id,status,timezone,version FROM app.campaign_sequences
              WHERE organization_id=$1::uuid AND campaign_id=$2::uuid
            SQL
            if draft
              step_rows = rows(<<~SQL, [org, campaign, draft.fetch("id")])
                SELECT id,position,delay_seconds,to_char(local_time,'HH24:MI:SS') AS local_time,label
                FROM app.campaign_sequence_steps
                WHERE organization_id=$1::uuid AND campaign_id=$2::uuid AND sequence_id=$3::uuid
                ORDER BY position
              SQL
              steps = step_rows.map do |step|
                { "id" => step.fetch("id"), "position" => step.fetch("position").to_i,
                  "delay_seconds" => step.fetch("delay_seconds").to_i,
                  "local_time" => step.fetch("local_time"), "label" => step.fetch("label") }
              end
              { "id" => draft.fetch("id"), "campaign_id" => draft.fetch("campaign_id"),
                "status" => draft.fetch("status"), "timezone" => draft.fetch("timezone"),
                "version" => draft.fetch("version").to_i, "steps" => steps }
            end
          end
        end
      end

      private

      def authorize!(digest)
        result = rows("SELECT app.authorize_outreach_draft_write($1::text) AS result", [digest]).first
        raise DraftError, "not_available" unless result && decode(result.fetch("result"))["status"] == "ok"
        rows("SELECT set_config('app.outreach_digest',$1,true)", [digest])
      end

      def authorize_read?(digest)
        result = rows("SELECT app.authorize_outreach_content_read($1::text) AS result", [digest]).first
        !!(result && decode(result.fetch("result"))["status"] == "ok")
      end

      def replace_locked(input, org)
        existing = rows(<<~SQL, [org, input.campaign_id]).first
          SELECT id,version,timezone FROM app.campaign_sequences
          WHERE organization_id=$1::uuid AND campaign_id=$2::uuid FOR UPDATE
        SQL
        if input.expected_version.nil?
          raise DraftError, "draft_conflict" if existing
          rows(<<~SQL, [input.id, org, input.campaign_id, input.status, input.timezone])
            INSERT INTO app.campaign_sequences(id,organization_id,campaign_id,status,timezone,version)
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,1)
          SQL
          version = 1
        else
          raise DraftError, "not_available" unless existing && existing.fetch("id") == input.id
          raise DraftError, "draft_conflict" unless existing.fetch("version").to_i == input.expected_version
          if existing.fetch("timezone") != input.timezone && occurrence_history?(org, input.campaign_id)
            raise DraftError, "reschedule_required"
          end
          version = input.expected_version + 1
          rows(<<~SQL, [org, input.campaign_id, input.id, input.status, input.timezone, version])
            UPDATE app.campaign_sequences SET status=$4,timezone=$5,version=$6::integer,updated_at=now()
            WHERE organization_id=$1::uuid AND campaign_id=$2::uuid AND id=$3::uuid
          SQL
          rows("DELETE FROM app.campaign_sequence_steps WHERE organization_id=$1::uuid AND campaign_id=$2::uuid AND sequence_id=$3::uuid",
            [org, input.campaign_id, input.id])
        end
        input.steps.each do |step|
          rows(<<~SQL, [step.fetch("id"), org, input.campaign_id, input.id,
            step.fetch("position"), step.fetch("delay_seconds"), step.fetch("local_time"), step.fetch("label")])
            INSERT INTO app.campaign_sequence_steps
              (id,organization_id,campaign_id,sequence_id,position,delay_seconds,local_time,label)
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::integer,$7::time,$8)
          SQL
        end
        { "id" => input.id, "campaign_id" => input.campaign_id, "version" => version,
          "status" => input.status, "timezone" => input.timezone, "steps" => input.steps }
      end

      def occurrence_history?(org, campaign)
        !rows("SELECT 1 FROM app.campaign_sequence_occurrences WHERE organization_id=$1::uuid AND campaign_id=$2::uuid LIMIT 1",
          [org, campaign]).empty?
      end

      def decode(value)
        parsed = value.is_a?(String) ? JSON.parse(value) : value
        raise DraftError, "internal_error" unless parsed.is_a?(Hash)
        parsed
      rescue JSON::ParserError
        raise DraftError, "internal_error"
      end

      def uuid(value)
        raise ArgumentError, "invalid UUID" unless value.is_a?(String) && value.valid_encoding? && value.ascii_only? && Schedule::UUID.match?(value)
        value
      end

      def rows(sql, values)
        binds = values.map do |value|
          ActiveRecord::Relation::QueryAttribute.new("sequence", value.nil? ? nil : value.to_s,
            ActiveRecord::Type::String.new)
        end
        @connection.exec_query(sql, "Outreach sequence draft", binds).to_a
      end
    end
  end
end
