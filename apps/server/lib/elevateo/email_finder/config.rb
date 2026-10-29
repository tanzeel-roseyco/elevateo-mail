# frozen_string_literal: true

require "ipaddr"

module Elevateo
  module EmailFinder
    # AIDEV-NOTE: Public address is explicit; finding it never depends on a third-party IP lookup API.
    class Config
      attr_reader :public_ip

      def initialize(environment = ENV)
        value = environment.fetch("ELEVATEO_FINDER_PUBLIC_IP", "")
        @public_ip = value.empty? ? "" : IPAddr.new(value).to_s
      rescue IPAddr::InvalidAddressError
        raise ArgumentError, "ELEVATEO_FINDER_PUBLIC_IP must be an IP address"
      end
    end
  end
end
