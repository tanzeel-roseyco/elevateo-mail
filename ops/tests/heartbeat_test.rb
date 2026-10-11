# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require "tmpdir"
require_relative "../../apps/server/lib/elevateo/heartbeat"

class HeartbeatTest < Minitest::Test
  def test_valid_and_invalid_heartbeats
    Dir.mktmpdir("be01r1-heartbeat-") do |directory|
      path = File.join(directory, "alive")
      refute Elevateo::Heartbeat.healthy?(path, now: 100)
      ["", "99\n", "99garbage", "-1", "101", "94", "1" * 21].each do |value|
        File.write(path, value)
        refute Elevateo::Heartbeat.healthy?(path, now: 100), "accepted malformed or out-of-window timestamp"
      end
      [95, 100].each do |timestamp|
        Elevateo::Heartbeat.publish(path, now: timestamp)
        assert Elevateo::Heartbeat.healthy?(path, now: 100)
      end
      assert_equal ["alive"], Dir.children(directory)
    end
  end

  def test_failed_publication_keeps_previous_timestamp
    Dir.mktmpdir("be01r1-heartbeat-") do |directory|
      path = File.join(directory, "alive")
      Elevateo::Heartbeat.publish(path, now: 99)
      File.stub(:rename, ->(*) { raise IOError, "injected" }) do
        assert_raises(IOError) { Elevateo::Heartbeat.publish(path, now: 100) }
      end
      assert_equal "99", File.read(path)
      assert_equal ["alive"], Dir.children(directory)
    end
  end
end
