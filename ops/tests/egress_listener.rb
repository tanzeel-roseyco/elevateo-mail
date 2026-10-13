# frozen_string_literal: true

require "socket"

# AIDEV-NOTE: Local disposable listener proves TCP reachability without contacting any outside service.
server = TCPServer.new("0.0.0.0", Integer(ARGV.fetch(0)))
loop { server.accept.close }
