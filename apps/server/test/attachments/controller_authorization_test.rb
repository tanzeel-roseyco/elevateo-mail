# frozen_string_literal: true

require_relative "../be_02/collaboration_controller_helper"
require_relative "../../app/controllers/v2/inbox_attachments_controller"

class AttachmentControllerAuthorizationTest < Minitest::Test
  ORG = "11111111-1111-4111-8111-111111111111"
  BOX = "22222222-2222-4222-8222-222222222222"
  THREAD = "33333333-3333-4333-8333-333333333333"
  MESSAGE = "44444444-4444-4444-8444-444444444444"

  class Reader
    attr_reader :calls
    attr_accessor :deny
    def initialize = @calls = []
    def direct_message(thread_id:, message_id:, query:)
      @calls << [thread_id, message_id, query]
      raise Elevateo::ThreadReads::NotAvailable if @deny
      "authorized"
    end
  end

  def setup
    @reader = Reader.new
    @authorize = V2::InboxAttachmentsController::ReadAuthorization.new(reader: @reader,
      organization_id: ORG, mailbox_id: BOX, thread_id: THREAD, message_id: MESSAGE)
  end

  def scope
    { organization_id: ORG, mailbox_id: BOX, thread_id: THREAD, message_id: MESSAGE, capability: :read }
  end

  def test_matching_read_rechecks_exact_message
    2.times { assert_nil @authorize.call(**scope) }
    assert_equal 2, @reader.calls.length
    assert(@reader.calls.all? { |call| call == [THREAD, MESSAGE, { "mailbox_id" => BOX }] })
  end

  def test_changed_scope_or_capability_denies_before_reader
    { organization_id: BOX, mailbox_id: ORG, thread_id: MESSAGE,
      message_id: THREAD, capability: :write }.each do |field, wrong|
      error = assert_raises(Elevateo::CollaborationError) { @authorize.call(**scope.merge(field => wrong)) }
      assert_equal "not_available", error.code
    end
    assert_empty @reader.calls
  end

  def test_current_message_denial_propagates
    @reader.deny = true
    assert_raises(Elevateo::ThreadReads::NotAvailable) { @authorize.call(**scope) }
    assert_equal 1, @reader.calls.length
  end
end
