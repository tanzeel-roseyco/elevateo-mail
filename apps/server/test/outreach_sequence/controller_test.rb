# frozen_string_literal: true

require_relative "../be_02/collaboration_controller_helper"
require_relative "../../app/controllers/v2/outreach/sequences_controller"

class OutreachSequenceControllerTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  CAMPAIGN = THREAD
  STEP = NOTE
  DRAFT = { "id" => CAMPAIGN, "campaign_id" => CAMPAIGN, "status" => "draft", "timezone" => "UTC",
    "version" => 1, "steps" => [{ "id" => STEP, "position" => 1, "delay_seconds" => 0,
      "local_time" => "09:00:00", "label" => "First" }] }.freeze

  class DraftRepository
    attr_accessor :found
    attr_reader :saved
    def initialize(found)
      @found = found
    end
    def fetch(**) = @found
    def save(input, **)
      @saved = input
      DRAFT
    end
  end

  class CampaignRepository
    attr_accessor :visible
    attr_reader :lookups
    def initialize
      @lookups = 0
      @visible = true
    end
    def detail(**)
      @lookups += 1
      raise Elevateo::CollaborationError.new("not_available") unless @visible
      { "id" => CAMPAIGN }
    end
  end

  class Sequences < V2::Outreach::SequencesController
    include CollaborationControllerHarness::Sessions
    class << self
      attr_accessor :draft_repository, :campaigns
    end
    private
    def repository(_connection) = self.class.draft_repository
    def campaign_repository(_connection, identity:, write:)
      raise "write proof missing" unless identity && write
      self.class.campaigns
    end
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = CollaborationControllerHarness::Connection.new(metadata)
    Sequences.draft_repository = DraftRepository.new(DRAFT)
    Sequences.campaigns = CampaignRepository.new
  end

  def teardown
    refute @connection.transaction_open?
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
  end

  def dispatch(action, method:, input: nil)
    env = Rack::MockRequest.env_for("https://app.test/v2/outreach/campaigns/#{CAMPAIGN}/sequence",
      method: method, input: input.nil? ? "" : JSON.generate(input))
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"), "action_dispatch.request_id" => "sequence-test",
      "action_dispatch.request.path_parameters" => { campaign_id: CAMPAIGN },
      "be02.sessions" => @service, "be02.config" => config)
    pool = CollaborationControllerHarness::Pool.new(@connection)
    status, _headers, body = ActiveRecord::Base.stub(:connection_pool, pool) { Sequences.action(action).call(env) }
    serialized = +""
    body.each { |part| serialized << part }
    [status, JSON.parse(serialized)]
  ensure
    body.close if body.respond_to?(:close)
  end

  def input
    DRAFT.except("version").merge("operation_id" => STEP, "expected_version" => nil)
  end

  def test_reads_inert_draft_and_creates_with_current_campaign_proof
    assert_equal [200, DRAFT], dispatch("show", method: "GET")
    status, result = dispatch("update", method: "PUT", input: input)
    assert_equal [201, DRAFT], [status, result]
    assert_equal 1, Sequences.campaigns.lookups
    assert_equal CAMPAIGN, Sequences.draft_repository.saved.campaign_id
  end

  def test_absent_or_inaccessible_draft_has_one_404_shape
    Sequences.draft_repository.found = nil
    status, result = dispatch("show", method: "GET")
    assert_equal [404, "not_available"], [status, result.fetch("code")]
  end

  def test_mismatched_campaign_and_active_status_cannot_write
    [input.merge("campaign_id" => STEP), input.merge("status" => "active")].each do |invalid|
      status, result = dispatch("update", method: "PUT", input: invalid)
      assert_equal [400, "request_invalid"], [status, result.fetch("code")]
    end
    assert_nil Sequences.draft_repository.saved
    assert_equal 0, Sequences.campaigns.lookups
  end

  def test_absent_parent_campaign_returns_404_before_sequence_save
    Sequences.campaigns.visible = false
    status, result = dispatch("update", method: "PUT", input: input)
    assert_equal [404, "not_available"], [status, result.fetch("code")]
    assert_nil Sequences.draft_repository.saved
    assert_equal 1, Sequences.campaigns.lookups
  end
end
