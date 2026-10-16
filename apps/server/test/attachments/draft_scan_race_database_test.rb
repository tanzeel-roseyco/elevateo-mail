# frozen_string_literal: true

require_relative "draft_staging_database_helper"

# AIDEV-NOTE: Real worker connections race the atomic claim; neither contender can acquire the other's scan token.
class DraftScanRaceDatabaseTest < DraftStagingDatabaseTestCase
  def test_only_one_concurrent_worker_can_claim_the_same_attachment
    reserve
    finalize
    second = connect("BE02_WORKER_DATABASE_URL", "elevateo_worker")
    connections = [@worker, second]
    tokens = Array.new(2) { SecureRandom.uuid }
    start = Queue.new
    threads = connections.each_with_index.map do |connection, index|
      Thread.new do
        start.pop
        connection.exec_params("SELECT * FROM app.claim_draft_attachment_scan($1::uuid,$2::uuid)",
          [@attachment, tokens.fetch(index)]).to_a
      end.tap { |thread| thread.report_on_exception = false }
    end
    2.times { start << true }
    threads.each { |thread| raise "scan claim race exceeded bound" unless thread.join(5) }
    rows = threads.map(&:value)
    assert_equal [0, 1], rows.map(&:length).sort
    winner = rows.index { |items| !items.empty? }
    assert_equal tokens.fetch(winner), scan_row.fetch("scan_token")
    assert_equal "1", scan_row.fetch("scan_attempt")
    assert_equal "f", verdict(tokens.fetch(1 - winner), 1, "clean")
    assert_equal "t", verdict(tokens.fetch(winner), 1, "clean")
  ensure
    # AIDEV-NOTE: Unblock every worker before closing connections, including assertion and startup failures.
    (threads || []).length.times { start << true }
    (threads || []).each do |thread|
      unless thread.join(5)
        thread.kill
        thread.join(1)
      end
    end
    close_connections([second])
  end
end
