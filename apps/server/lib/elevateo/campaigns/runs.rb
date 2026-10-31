# frozen_string_literal: true

require "securerandom"
require_relative "repository"
require_relative "run_input"
require_relative "../draft_operations"
require_relative "../send_api/service"

module Elevateo
  module Campaigns
    # AIDEV-NOTE: The protected controller transaction commits the entire <=25-recipient queue atomically.
    class Runs
      def initialize(connection:, session:, identity:, outbound_mode:, epoch:)
        @repository = Repository.new(connection: connection)
        @database = SendAPI::Database.new(connection: connection, session: session)
        @drafts = DraftOperations.new(connection: connection, session: session)
        @sends = SendAPI::Service.new(connection: connection, session: session, outbound_mode: outbound_mode)
        @identity, @outbound_mode, @epoch = identity, outbound_mode, epoch
      end

      def create(campaign_id, input, request_id:)
        @repository.rows("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          ["marketing-run:#{@identity.org_id}:#{@identity.user_id}:#{input.operation_id}"])
        existing = @repository.rows("SELECT id,campaign_id,request_digest FROM app.marketing_runs " \
          "WHERE organization_id=$1::uuid AND actor_id=$2::uuid AND operation_id=$3::uuid",
          [@identity.org_id, @identity.user_id, input.operation_id]).first
        if existing
          raise CollaborationError.new("operation_mismatch") unless existing["request_digest"] == input.digest && existing["campaign_id"] == campaign_id
          return detail(campaign_id, existing.fetch("id"))
        end
        campaign = @repository.rows("SELECT version,status FROM app.campaigns WHERE organization_id=$1::uuid AND id=$2::uuid FOR UPDATE",
          [@identity.org_id, campaign_id]).first
        raise CollaborationError.new("not_available") unless campaign
        raise CollaborationError.new("draft_conflict") unless campaign["version"].to_i == input.expected_version
        raise CollaborationError.new("not_available") unless campaign["status"] == "draft"
        leads = eligible(campaign_id, input.lead_ids)
        id = SecureRandom.uuid
        @repository.rows("INSERT INTO app.marketing_runs(id,organization_id,campaign_id,mailbox_id,actor_id,operation_id," \
          "request_digest,subject,body_text,simulated) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7,$8,$9,$10::boolean)",
          [id, @identity.org_id, campaign_id, input.mailbox_id, @identity.user_id, input.operation_id, input.digest,
            input.subject, input.body_text, !%w[resend mox].include?(@outbound_mode)])
        leads.each { |lead| queue_recipient(id, input, lead, request_id) }
        detail(campaign_id, id)
      end

      def list(campaign_id, cursor: nil)
        @repository.detail(kind: "campaign", organization_id: @identity.org_id, id: campaign_id)
        rows = @repository.rows("SELECT id FROM app.marketing_runs WHERE organization_id=$1::uuid AND campaign_id=$2::uuid " \
          "AND ($3::uuid IS NULL OR id>$3::uuid) ORDER BY id LIMIT 11", [@identity.org_id, campaign_id, cursor])
        items = rows.first(10).map { |row| detail(campaign_id, row.fetch("id")) }
        { "items" => items, "next_cursor" => rows.length > 10 ? rows[9].fetch("id") : nil }
      end

      def detail(campaign_id, id)
        run = @repository.rows("SELECT id,campaign_id,mailbox_id,operation_id,state,subject,body_text,created_at,simulated " \
          "FROM app.marketing_runs WHERE organization_id=$1::uuid AND campaign_id=$2::uuid AND id=$3::uuid",
          [@identity.org_id, campaign_id, id]).first
        raise CollaborationError.new("not_available") unless run
        run["created_at"] = @repository.timestamp(run["created_at"])
        run["recipients"] = @repository.rows("SELECT e.lead_id,e.email,e.draft_id,e.send_id," \
          "app.send_status($3::uuid,e.send_id,$4::uuid)::text AS send_status FROM app.marketing_enrollments e " \
          "WHERE e.organization_id=$1::uuid AND e.run_id=$2::uuid ORDER BY e.lead_id LIMIT 25",
          [@identity.org_id, id, run.fetch("mailbox_id"), @epoch]).map do |item|
          status = ThreadProjection.source_json(item.delete("send_status"), 16_384)
          raise ReadResponse::Invalid unless status.is_a?(Hash) && !status.key?("code")
          SendAPI::Status.validate(status, mailbox: run.fetch("mailbox_id"), send_id: item.fetch("send_id"))
          item.merge("state" => status.fetch("state"), "delivery_state" => status.fetch("delivery_status"))
        end
        run
      end

      def cancel(campaign_id, id)
        run = detail(campaign_id, id)
        @repository.rows("UPDATE app.marketing_runs SET state='cancelled' WHERE organization_id=$1::uuid AND id=$2::uuid",
          [@identity.org_id, id])
        run.fetch("recipients").each do |recipient|
          next if %w[accepted rejected cancelled].include?(recipient.fetch("state"))
          # AIDEV-NOTE: cancel_send locks the current intent and may return a newly terminal recipient unchanged.
          value = @database.outcome(@database.object(SendAPI::Service::CANCEL_SQL,
            [@identity.digest, run.fetch("mailbox_id"), recipient.fetch("send_id"), @epoch], budget: 16_384))
          SendAPI::Status.validate(value, mailbox: run.fetch("mailbox_id"), send_id: recipient.fetch("send_id"))
          unless value["cancel_requested"] == true || %w[accepted rejected cancelled].include?(value["state"])
            raise ReadResponse::Invalid
          end
        end
        detail(campaign_id, id)
      end

      private

      def eligible(campaign_id, ids)
        leads = @repository.rows("SELECT l.id,l.email FROM app.campaign_leads l WHERE l.organization_id=$1::uuid " \
          "AND l.campaign_id=$2::uuid AND l.id=ANY($3::uuid[]) AND l.consent_status='granted' AND l.suppressed_at IS NULL " \
          "AND l.consent_recorded_at IS NOT NULL AND l.consent_source IS NOT NULL AND l.consent_recorded_by IS NOT NULL " \
          "AND NOT EXISTS(SELECT 1 FROM app.campaign_suppressions s WHERE s.organization_id=l.organization_id AND s.email=lower(l.email)) " \
          "ORDER BY l.id FOR SHARE OF l", [@identity.org_id, campaign_id, "{#{ids.join(',')}}"])
        raise CollaborationError.new("not_available") unless leads.map { |lead| lead.fetch("id") } == ids
        leads
      end

      def queue_recipient(run_id, input, lead, request_id)
        draft_id = SecureRandom.uuid
        payload = Drafts::Payload.new(draft_id: draft_id, input: {
          "mailbox_id" => input.mailbox_id, "operation_id" => SecureRandom.uuid, "expected_version" => 0,
          "subject" => input.subject, "body_text" => input.body_text, "reply_to_thread_id" => nil,
          "to" => [{ "display_name" => nil, "address" => lead.fetch("email") }]
        })
        saved = @drafts.save(payload, session_digest: @identity.digest, request_id: request_id)
        raise CollaborationError.new("temporarily_unavailable") unless saved.status == 200
        @repository.rows("INSERT INTO app.marketing_enrollments(organization_id,run_id,lead_id,draft_id,email) " \
          "VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5)", [@identity.org_id, run_id, lead.fetch("id"), draft_id, lead.fetch("email")])
        review = SendAPI::Review.new(@database.outcome(@database.object(SendAPI::Service::REVIEW_SQL, [input.mailbox_id, draft_id])),
          outbound_mode: @outbound_mode)
        raise CollaborationError.new("not_available") unless review.result["ready"] == true && review.result["purpose"] == "marketing"
        approval = SendAPI::Input.new(draft_id: draft_id, input: { "mailbox_id" => input.mailbox_id,
          "operation_id" => SecureRandom.uuid, "expected_version" => 1, "review_digest" => review.result.fetch("review_digest"),
          "correspondence_confirmed" => true })
        # AIDEV-NOTE: Legacy field name is internal only; the immutable snapshot explicitly records marketing consent.
        response = @sends.approve(approval, session_digest: @identity.digest, epoch: @epoch, request_id: request_id)
        raise CollaborationError.new("temporarily_unavailable") unless response.status == 202
        result = JSON.parse(response.json)
        @repository.rows("UPDATE app.marketing_enrollments SET send_id=$3::uuid WHERE organization_id=$1::uuid AND draft_id=$2::uuid",
          [@identity.org_id, draft_id, WriteInput.uuid(result["send_id"])])
      end
    end
  end
end
