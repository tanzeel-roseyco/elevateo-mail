# frozen_string_literal: true

require "rbconfig"
require "timeout"
require_relative "database_test_helper"

# AIDEV-NOTE: Shared fixture lock isolates actors/datasets; only child processes exercise lifecycle transitions.
class Adv807RefreshProcessTest < SessionDatabaseTestCase
  def setup
    @children = []
    super
  end

  def teardown
    cleanup_children
  ensure
    super
  end

  def test_distinct_processes_publish_one_claim_and_reject_contender
    create
    claim = SecureRandom.uuid
    owner, acknowledged = start_child("claim_refresh", [@digest, claim], hold: true)
    assert_equal ["ok", "accepted"], acknowledged.values_at("status", "boundary")
    assert_durable_claim(claim, acknowledged)
    contender = one_call("claim_refresh", [@digest, SecureRandom.uuid])
    assert_distinct(owner, acknowledged, contender)
    assert_equal ["temporarily_unavailable", "temporarily_unavailable"], contender.values_at("status", "boundary")
    published = continue_child(owner, "publish_refresh", publication(claim, acknowledged.fetch("generation")))
    assert_equal ["ok", "accepted"], published.values_at("status", "boundary")
    finish_child(owner)
    assert_equal ["active", acknowledged.fetch("generation").to_s, "t"], state
    assert_equal "ok", one_call("resolve_session", [@digest]).fetch("status")
  end

  def test_killed_durable_claimant_restart_requires_reauth_without_replay_or_resurrection
    create
    claim = SecureRandom.uuid
    owner, acknowledged = start_child("claim_refresh", [@digest, claim], hold: true)
    assert_durable_claim(claim, acknowledged)
    Process.kill("KILL", owner.fetch(:pid))
    status = finish_child(owner, success: false)
    assert status.signaled?
    assert_equal Signal.list.fetch("KILL"), status.termsig
    blocked = one_call("claim_refresh", [@digest, SecureRandom.uuid])
    assert_distinct(owner, acknowledged, blocked)
    assert_equal "temporarily_unavailable", blocked.fetch("status")
    # AIDEV-NOTE: Advance only the owned persisted deadline; never use elapsed sleep to establish a race.
    expire_claim
    restarted = one_call("claim_refresh", [@digest, SecureRandom.uuid])
    assert_equal ["refresh_uncertain", "unauthenticated"], restarted.values_at("status", "boundary")
    replay = one_call("claim_refresh", [@digest, claim])
    assert_equal ["unauthorized", "unauthenticated"], replay.values_at("status", "boundary")
    late = one_call("publish_refresh", publication(claim, acknowledged.fetch("generation")))
    assert_equal ["unauthorized", "unauthenticated"], late.values_at("status", "boundary")
    assert_equal ["refresh_uncertain", acknowledged.fetch("generation").to_s, "f"], state
    assert_equal ["unauthorized", "unauthenticated"], one_call("resolve_session", [@digest]).values_at("status", "boundary")
    assert_disposal(acknowledged.fetch("generation"), "local")
  end

  def test_separate_logout_process_fences_held_claimants_late_publication
    create
    claim = SecureRandom.uuid
    owner, acknowledged = start_child("claim_refresh", [@digest, claim], hold: true)
    assert_durable_claim(claim, acknowledged)
    logout = one_call("revoke_session", [@digest, "local"])
    assert_distinct(owner, acknowledged, logout)
    assert_equal "ok", logout.fetch("status")
    assert_equal "revoked", state.first
    late = continue_child(owner, "publish_refresh", publication(claim, acknowledged.fetch("generation")))
    assert_equal ["unauthorized", "unauthenticated"], late.values_at("status", "boundary")
    finish_child(owner)
    assert_equal ["revoked", acknowledged.fetch("generation").to_s, "f"], state
    assert_equal "unauthenticated", one_call("claim_refresh", [@digest, SecureRandom.uuid]).fetch("boundary")
    assert_equal "unauthenticated", one_call("resolve_session", [@digest]).fetch("boundary")
    assert_disposal(acknowledged.fetch("generation"), "local")
  end

  private

  def publication(claim, generation)
    [@digest, claim, generation, @user, @auth, "adv807-late-access", "adv807-late-refresh",
      (Time.now.utc + 3600).iso8601]
  end

  def state
    @admin.exec_params(<<~SQL, [@digest]).first.values
      SELECT state, refresh_generation::text,
        (access_token_ciphertext = 'adv807-late-access' AND refresh_token_ciphertext = 'adv807-late-refresh')
        FROM app_auth.sessions WHERE cookie_digest = $1
    SQL
  end

  def assert_durable_claim(claim, acknowledgement)
    assert_equal "ok", acknowledgement.fetch("status")
    row = @admin.exec_params(<<~SQL, [@digest, claim, acknowledgement.fetch("generation")]).first
      SELECT state, (refresh_claim_id = $2::uuid AND refresh_generation = $3::bigint
        AND refresh_claim_deadline > clock_timestamp()) AS owned
        FROM app_auth.sessions WHERE cookie_digest = $1
    SQL
    assert_equal({ "state" => "refreshing", "owned" => "t" }, row)
  end

  def assert_disposal(generation, scope)
    count = @admin.exec_params(<<~SQL, [@digest, generation, scope]).getvalue(0, 0)
      SELECT count(*) FROM app_auth.revocation_intents WHERE cookie_digest = $1
        AND credential_generation = $2 AND scope = $3 AND access_token_ciphertext = 'adv807-late-access'
    SQL
    assert_equal "1", count
  end

  def assert_distinct(owner, acknowledgement, other)
    assert_equal owner.fetch(:pid), acknowledgement.fetch("pid")
    refute_equal Process.pid, acknowledgement.fetch("pid")
    refute_equal acknowledgement.fetch("pid"), other.fetch("pid")
    refute_equal acknowledgement.fetch("backend_pid"), other.fetch("backend_pid")
  end

  def start_child(name, values, hold: false)
    input_read, input_write = IO.pipe
    output_read, output_write = IO.pipe
    child = { input: input_write, output: output_read }
    @children << child
    child[:pid] = Process.spawn(RbConfig.ruby, File.expand_path("adv807_refresh_process_child.rb", __dir__),
      in: input_read, out: output_write, err: File::NULL, pgroup: true, close_others: true)
    input_read.close
    output_write.close
    input_write.puts(JSON.generate({ name: name, values: values, hold: hold }))
    [child, read_ack(child)]
  ensure
    input_read&.close unless input_read&.closed?
    output_write&.close unless output_write&.closed?
  end

  def continue_child(child, name, values)
    child.fetch(:input).puts(JSON.generate({ name: name, values: values }))
    read_ack(child)
  end

  def read_ack(child)
    line = Timeout.timeout(5) { child.fetch(:output).gets(1024) }
    raise "ADV807 missing child acknowledgement" unless line&.end_with?("\n")
    result = JSON.parse(line)
    assert_equal %w[backend_pid boundary generation pid status], result.keys.sort
    result
  end

  def one_call(name, values)
    child, result = start_child(name, values)
    finish_child(child)
    result
  end

  def finish_child(child, success: true)
    _, status = Timeout.timeout(5) { Process.waitpid2(child.fetch(:pid)) }
    child[:reaped] = true
    assert status.success?, "ADV807 child exit failed" if success
    status
  end

  def cleanup_children
    failure = nil
    @children.each do |child|
      if child[:pid] && !child[:reaped]
        begin
          Process.kill("KILL", -child.fetch(:pid))
        rescue Errno::ESRCH
          # Already exited; wait still collects its status.
        end
        Timeout.timeout(5) { Process.waitpid(child.fetch(:pid)) }
        child[:reaped] = true
      end
    rescue StandardError => error
      failure ||= error
    ensure
      child.values_at(:input, :output).compact.each { |io| io.close unless io.closed? }
    end
    raise failure if failure
  end
end
