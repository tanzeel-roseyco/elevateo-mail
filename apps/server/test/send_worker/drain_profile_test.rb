# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require_relative "../../lib/elevateo/send_worker/drain"
require_relative "../../lib/elevateo/send_worker/durable_local_driver"
require_relative "../../lib/elevateo/send_worker/mox_smtp_transport"

# AIDEV-NOTE: Assert the profile at the store boundary; adapter receipt parsing is covered by real Mox composition.
class SendWorkerDrainProfileTest < Minitest::Test
  Worker = Elevateo::SendWorker
  IDS = %w[a1111111-1111-4111-8111-111111111111 a2222222-2222-4222-8222-222222222222].freeze

  def test_synthetic_adapter_binds_every_discovered_job
    driver = Worker::DurableLocalDriver.new(path: "/unused/drain-profile.jsonl", outcome: "accept")
    assert_profiles(driver, "synthetic-v1")
  end

  def test_mailpit_adapter_binds_every_discovered_job
    driver = Worker::SmtpTransport.new(profile: Worker::SmtpProfile.local_mailpit(verified_sender: "sender@example.invalid"))
    assert_profiles(driver, "mailpit-smtp-test-v1")
  end

  def test_mox_adapter_binds_every_discovered_job_without_resolving_credentials
    driver = Worker::MoxSmtpTransport.new(profile: Worker::SmtpProfile.local_mox, ca_file: __FILE__,
      credential_resolver: ->(*) { flunk "resolved credentials during construction" },
      smtp_factory: ->(*) { flunk "opened SMTP during construction" })
    assert_profiles(driver, "mox-smtp-test-v1")
  end

  def test_missing_and_invalid_driver_profiles_fail_before_control_or_database_access
    [nil, Object.new].each { |driver| assert_raises(ArgumentError) { build(driver) } }
    [nil, "", "remote_held", "synthetic-v2", 1, []].each do |profile|
      driver = Struct.new(:database_profile).new(profile)
      assert_raises(ArgumentError) { build(driver) }
    end
  end

  def test_mailpit_driver_rejects_mox_profile_before_claiming
    driver = Worker::SmtpTransport.new(profile: Worker::SmtpProfile.local_mox)
    assert_raises(Worker::SmtpTransport::Held) { build(driver) }
  end

  def test_remote_held_profile_cannot_enter_the_queue
    profile = Worker::SmtpProfile.remote_held(host: "mail.example.invalid", port: 587,
      verified_sender: "sender@example.invalid", tls_mode: "starttls_required", credential_ref: "secret://held")
    driver = Worker::SmtpTransport.new(profile: profile)
    assert_raises(Worker::SmtpTransport::Held) { build(driver) }
  end

  def test_profile_is_copied_once_and_cannot_change_between_jobs
    profile = +"synthetic-v1"
    driver = Struct.new(:database_profile).new(profile)
    assert_profiles(driver, "synthetic-v1") { profile.replace("mox-smtp-test-v1") }
  end

  private

  def build(driver, control: Object.new, connection: Object.new)
    Worker::Drain.new(connection: connection, control: control, driver: driver,
      max_steps: 2, clock: -> { 0.0 }, sleeper: ->(*) { flunk "unexpected idle wait" })
  end

  def assert_profiles(driver, expected)
    state = Struct.new(:epoch) { def submission_allowed? = true }.new(IDS.first)
    control = Struct.new(:state) { def read = state }.new(state)
    connection = Object.new
    drain = build(driver, control: control, connection: connection)
    yield if block_given?
    pending = [*IDS, "a3333333-3333-4333-8333-333333333333"]
    stores = []
    built_stores = []
    executor = Struct.new(:result) { def run_once = result }.new(:accepted)
    factory = ->(**arguments) { stores << arguments; built_stores << Object.new; built_stores.last }
    execution = ->(**arguments) do
      assert_same driver, arguments.fetch(:driver)
      assert_same control, arguments.fetch(:control)
      assert_same built_stores.last, arguments.fetch(:store)
      executor
    end
    Worker::DatabaseStore.stub(:next_due_send, ->(**_) { pending.shift }) do
      Worker::DatabaseStore.stub(:new, factory) do
        Worker::Executor.stub(:new, execution) { assert_equal 2, drain.run }
      end
    end
    assert_equal ["a3333333-3333-4333-8333-333333333333"], pending
    assert_equal IDS, (stores.map { |arguments| arguments.fetch(:send_id) })
    assert_equal [expected, expected], (stores.map { |arguments| arguments.fetch(:profile) })
    assert(stores.all? { |arguments| arguments.fetch(:connection).equal?(connection) })
    assert(stores.all? { |arguments| arguments.fetch(:profile).frozen? })
  end
end
