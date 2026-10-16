# frozen_string_literal: true

require "socket"

# AIDEV-NOTE: Real TCP drip responses expose total-deadline failures that mocked HTTP clients cannot detect.
module StorageDeadlineServer
  def with_storage_server(scenarios)
    listener = TCPServer.new("127.0.0.1", 0)
    state = { paths: [], closed: 0 }
    thread = Thread.new do
      scenarios.each do |scenario|
        socket = listener.accept
        begin
          request = socket.gets
          raise "missing fixture request" unless request
          state[:paths] << request.split.fetch(1)
          loop do
            line = socket.gets
            raise "incomplete fixture headers" unless line
            break if line == "\r\n"
          end
          send_storage_response(socket, scenario, state)
        ensure
          socket.close
        end
      end
    end
    factory = Net::HTTP.method(:new)
    Net::HTTP.stub(:new, ->(host, port, proxy) {
      assert_equal ["storage", 5000, nil], [host, port, proxy]
      factory.call("127.0.0.1", listener.addr[1], nil)
    }) { yield state }
    assert thread.join(2), "fixture connection did not close before deadline"
    thread.value
    assert_equal scenarios.length, state[:closed]
  ensure
    listener&.close
    thread&.kill if thread&.alive?
    thread&.join
  end

  def send_storage_response(socket, scenario, state)
    kind, body = scenario
    if kind == :headers
      socket.write("HTTP/1.1 200 OK\r\nX-Slow: ")
    else
      length = body.bytesize + (kind == :truncated ? 8 : 0)
      socket.write("HTTP/1.1 200 OK\r\nContent-Length: #{length}\r\n\r\n")
      socket.write(body) if [:normal, :truncated].include?(kind)
    end
    if kind == :truncated
      socket.close_write
      raise "client ignored truncated response" unless IO.select([socket], nil, nil, 1) && socket.read(1).nil?
      state[:closed] += 1
      return
    end
    if kind == :normal
      raise "client kept fixture connection open" unless IO.select([socket], nil, nil, 1) && socket.read(1).nil?
      state[:closed] += 1
      return
    end
    100.times do
      socket.write("x")
      if IO.select([socket], nil, nil, 0.03) && socket.read(1).nil?
        state[:closed] += 1
        return
      end
    end
    raise "client outlived total exchange deadline"
  rescue Errno::EPIPE, Errno::ECONNRESET
    state[:closed] += 1
  end

  def with_short_storage_deadlines
    original = Timeout.method(:timeout)
    budgets = []
    Timeout.stub(:timeout, ->(seconds, *arguments, &block) {
      if [5.0, 20.0].include?(seconds)
        budgets << seconds
        original.call(0.2, *arguments, &block)
      else
        original.call(seconds, *arguments, &block)
      end
    }) { yield budgets }
  end
end
