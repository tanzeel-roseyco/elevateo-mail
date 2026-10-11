# frozen_string_literal: true

require "socket"
require "ipaddr"
require "json"

# AIDEV-NOTE: Only kernel no-route errors prove denial; timeout/refusal/tool failures invalidate the evidence.
module EgressProbe
  def self.call(address, port)
    ip = IPAddr.new(address)
    raise ArgumentError, "literal IPv4 required" unless ip.ipv4? && ip.to_s == address
    raise ArgumentError, "invalid port" unless /\A[0-9]{1,5}\z/.match?(port) && Integer(port).between?(1, 65_535)

    routes = File.readlines("/proc/net/route").drop(1).map(&:split)
    default_route = routes.any? { |route| route.fetch(1) == "00000000" && (route.fetch(3).to_i(16) & 1) == 1 }
    begin
      Socket.tcp(address, Integer(port), connect_timeout: 3) { |socket| socket.close }
      { outcome: "connected", default_route: default_route }
    rescue Errno::ENETUNREACH, Errno::EHOSTUNREACH => error
      { outcome: "denied", default_route: default_route, reason: error.class.name }
    rescue SystemCallError, IOError => error
      { outcome: "invalid", default_route: default_route, reason: error.class.name }
    end
  rescue ArgumentError, IPAddr::InvalidAddressError, SystemCallError, IOError, IndexError => error
    { outcome: "invalid", reason: error.class.name }
  end
end

puts JSON.generate(EgressProbe.call(ARGV.fetch(0, ""), ARGV.fetch(1, ""))) if $PROGRAM_NAME == __FILE__
