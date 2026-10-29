# frozen_string_literal: true

require "minitest/autorun"
require_relative "cleanup"

class LaunchMailflowCleanupTest < Minitest::Test
  def test_all_cleanup_steps_run
    seen = []
    LaunchMailflowCleanup.run([-> { seen << :sql }, -> { seen << :credentials }, -> { seen << :parent }])
    assert_equal %i[sql credentials parent], seen
  end

  def test_sql_and_filesystem_failures_do_not_skip_parent
    seen = []
    sql = RuntimeError.new("injected SQL failure")
    filesystem = IOError.new("injected file failure")
    error = assert_raises(RuntimeError) do
      LaunchMailflowCleanup.run([-> { raise sql }, -> { raise filesystem }, -> { seen << :parent }])
    end
    assert_same sql, error
    assert_same filesystem, error.cause
    assert_equal [:parent], seen
  end
end
