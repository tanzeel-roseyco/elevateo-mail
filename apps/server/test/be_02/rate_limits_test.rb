# frozen_string_literal: true

require_relative "database_test_helper"

class EntryRateLimitsTest < SessionDatabaseTestCase
  # AIDEV-NOTE: Window and attempt resets must use one post-lock time decision, including a wait across expiry.
  def test_expired_exhausted_buckets_restart_together
    email, ip = owned_digests
    6.times { invoke("consume_entry_limits", email, ip) }
    @admin.exec_params("UPDATE app_auth.rate_limits SET window_start = clock_timestamp() - interval '16 minutes', attempts = CASE kind WHEN 'email' THEN 6 ELSE 31 END WHERE digest IN ($1, $2)", [email, ip])

    assert_equal "ok", invoke("consume_entry_limits", email, ip).fetch("status")
    buckets = @admin.exec_params("SELECT attempts, window_start > clock_timestamp() - interval '5 seconds' AS recent FROM app_auth.rate_limits WHERE digest IN ($1, $2)", [email, ip])
    assert_equal 2, buckets.ntuples
    buckets.each do |bucket|
      assert_equal "1", bucket.fetch("attempts")
      assert_equal "t", bucket.fetch("recent")
    end
    4.times { assert_equal "ok", invoke("consume_entry_limits", email, ip).fetch("status") }
    limited = invoke("consume_entry_limits", email, ip)
    assert_equal "rate_limited", limited.fetch("status")
    assert_operator limited.fetch("retry_after"), :<=, 900
    assert_operator limited.fetch("retry_after"), :>, 0
  end

  def test_waiting_consumer_resets_an_expired_window_after_the_lock
    email, ip = owned_digests
    6.times { invoke("consume_entry_limits", email, ip) }
    @api.exec("SET lock_timeout = '2s'")
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT digest FROM app_auth.rate_limits WHERE kind = 'email' AND digest = $1 FOR UPDATE", [email])
    @api.send_query_params("SELECT app_auth.consume_entry_limits($1, $2)", [email, ip])
    wait_for_api_lock
    # Move the boundary while the consumer is blocked, then cross it before releasing the same row.
    @admin.exec_params("UPDATE app_auth.rate_limits SET window_start = clock_timestamp() - interval '15 minutes' + interval '100 milliseconds' WHERE kind = 'email' AND digest = $1", [email])
    @admin.exec("SELECT pg_sleep(0.15)")
    @admin.exec("COMMIT")
    result = @api.get_result
    refute_nil result
    result.check
    assert_equal "ok", JSON.parse(result.getvalue(0, 0)).fetch("status")
    assert_nil @api.get_result
    bucket = @admin.exec_params("SELECT attempts, window_start > clock_timestamp() - interval '5 seconds' AS recent FROM app_auth.rate_limits WHERE kind = 'email' AND digest = $1", [email]).first
    assert_equal "1", bucket.fetch("attempts")
    assert_equal "t", bucket.fetch("recent")
  ensure
    @admin.exec("ROLLBACK") if @admin && !@admin.finished? && @admin.transaction_status != PG::PQTRANS_IDLE
    if @api && !@api.finished?
      @api.cancel if @api.is_busy
      loop { break unless @api.get_result }
    end
  end

  private

  def owned_digests
    Array.new(2) { SecureRandom.hex(32) }.tap { |digests| @owned_buckets.concat(digests) }
  end

  def wait_for_api_lock
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 1
    loop do
      @admin.exec("SELECT pg_stat_clear_snapshot()")
      wait = @admin.exec_params("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [@api.backend_pid]).first
      return if wait && wait.fetch("wait_event_type") == "Lock"
      raise "consumer did not reach the bucket lock" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline

      sleep 0.01
    end
  end
end
