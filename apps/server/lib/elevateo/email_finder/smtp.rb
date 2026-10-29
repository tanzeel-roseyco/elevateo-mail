# frozen_string_literal: true

require "socket"
require "openssl"
require "timeout"
require "resolv"
require "ipaddr"
require_relative "core"

module Elevateo
  module EmailFinder
    # AIDEV-NOTE: DNS addresses are pinned before socket creation to prevent private-network DNS rebinding.
    module DNS
      PRIVATE_RANGES = %w[0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12
        192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24
        224.0.0.0/4 240.0.0.0/4 ::/128 ::1/128 ::ffff:0:0/96 64:ff9b::/96 100::/64
        2001::/23 2001:db8::/32 2002::/16 fc00::/7 fe80::/10 ff00::/8].map { |range| IPAddr.new(range) }.freeze

      def self.public_ip?(address)
        ip = IPAddr.new(address)
        return false if ip.ipv6? && !IPAddr.new("2000::/3").include?(ip)
        PRIVATE_RANGES.none? { |range| range.include?(ip) }
      rescue IPAddr::InvalidAddressError
        false
      end

      def self.address(host)
        addresses = Timeout.timeout(5) { Resolv.getaddresses(host) }
        raise IOError, "DNS returned no public address" if addresses.empty? || addresses.any? { |value| !public_ip?(value) }
        addresses.first.to_s
      end

      def self.mx(domain)
        # @type var records: Array[Resolv::DNS::Resource]
        # @type var hosts: Array[mx_record]
        address(domain)
        records = []
        Timeout.timeout(5) do
          Resolv::DNS.open { |resolver| records = resolver.getresources(domain, Resolv::DNS::Resource::IN::MX) }
        end
        hosts = []
        records.each do |record|
          next unless record.is_a?(Resolv::DNS::Resource::IN::MX)
          host = record.exchange.to_s.downcase.delete_suffix(".")
          next if host.empty?
          hosts << { "host" => host, "priority" => record.preference }
        end
        hosts.sort_by { |record| record.fetch("priority") }.first(10)
      end

      def self.ptr(public_ip)
        raise ArgumentError, "ELEVATEO_FINDER_PUBLIC_IP must be a public IP address" unless public_ip?(public_ip)
        host = Timeout.timeout(5) { Resolv.getname(public_ip) }.downcase.delete_suffix(".")
        raise IOError, "PTR is not a fully qualified hostname" unless host.match?(/\A[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}\z/)
        host
      end
    end

    class Smtp
      def initialize(hostname:)
        raise ArgumentError, "Invalid EHLO hostname" unless hostname.match?(/\A[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}\z/i)
        @hostname = hostname
        @reply_blocklisted = false
        @reply_temporary = false
      end

      def self.startup(public_ip:)
        hostname = DNS.ptr(public_ip)
        host = DNS.mx("gmail.com").first&.fetch("host").to_s
        raise IOError, "Startup MX lookup returned no mail host" if host.empty?
        socket = Socket.tcp(DNS.address(host), 25, connect_timeout: 5)
        socket.close
        { "hostname" => hostname, "available" => true, "reason" => "TCP port 25 reachable" }
      rescue StandardError => error
        { "hostname" => hostname, "available" => false, "reason" => "#{error.class}: #{error.message}" }
      end

      # AIDEV-NOTE: Caller reserves a durable probe slot and checks suppression before entering this adapter.
      def probe(host:, email:)
        raise ArgumentError, "Invalid probe address" unless email.bytesize <= 254 && email.split("@", 2).first.to_s.bytesize <= 64 && email.match?(/\A[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\z/i)
        @reply_blocklisted = false
        @reply_temporary = false
        Timeout.timeout(20) do
          exchange(Socket.tcp(DNS.address(host), 25, connect_timeout: 5), host, email)
        end
      rescue IOError, SystemCallError, Timeout::Error, OpenSSL::SSL::SSLError, Resolv::ResolvError => error
        # AIDEV-NOTE: reply records warning flags before parsing completes, including partial replies on disconnect.
        outcome(nil, "#{error.class}: #{error.message}")
      end

      private

      def exchange(socket, host, email)
        code, message = reply(socket)
        return outcome(code, message) unless code == 220 && !Core.blocked?(message)
        code, message = command(socket, "EHLO #{@hostname}")
        return outcome(code, message) unless code == 250 && !Core.blocked?(message)
        if message.match?(/\bSTARTTLS\b/i)
          code, message = command(socket, "STARTTLS")
          return outcome(code, message) unless code == 220 && !Core.blocked?(message)
          context = OpenSSL::SSL::SSLContext.new
          context.set_params(verify_mode: OpenSSL::SSL::VERIFY_PEER)
          tls = OpenSSL::SSL::SSLSocket.new(socket, context)
          tls.hostname = host
          tls.sync_close = true
          tls.connect
          tls.post_connection_check(host)
          socket = tls
          code, message = command(socket, "EHLO #{@hostname}")
          return outcome(code, message) unless code == 250 && !Core.blocked?(message)
        end
        code, message = command(socket, "MAIL FROM:<probe@#{@hostname}>")
        return outcome(code, message) unless code == 250 && !Core.blocked?(message)
        code, message = command(socket, "RCPT TO:<#{email}>")
        result = outcome(code, message, recipient: true)
        # Cleanup replies also carry host/global backoff signals; never discard a block warning.
        reset_code, reset_message = command(socket, "RSET")
        merge_warning(result, reset_code, reset_message)
        quit_code, quit_message = command(socket, "QUIT")
        merge_warning(result, quit_code, quit_message)
        result
      ensure
        socket.close
      end

      def outcome(code, message, recipient: false)
        { "code" => code, "message" => message.slice(0, 1024).to_s, "status" => recipient && !Core.blocked?(message) && !@reply_blocklisted ? Core.classify(code, message) : "unknown",
          "blocklisted" => @reply_blocklisted || Core.blocked?(message),
          "temporary" => @reply_temporary || (!code.nil? && code.between?(400, 499)) }
      end

      def merge_warning(result, code, message)
        blocked = Core.blocked?(message)
        temporary = code.between?(400, 499)
        result["status"] = "unknown" if blocked || temporary
        result["blocklisted"] = result.fetch("blocklisted") || blocked
        result["temporary"] = result.fetch("temporary") || temporary
        result["message"] = "#{result.fetch('message')} / #{message}".slice(0, 1024).to_s if blocked || temporary
      end

      def command(socket, text)
        socket.write("#{text}\r\n")
        reply(socket)
      end

      def reply(socket)
        # @type var lines: Array[String]
        # @type var expected: Integer
        lines = []
        expected = 0
        30.times do
          line = socket.gets("\n", 1025)
          raise IOError, "SMTP reply missing or oversized" if line.nil? || line.bytesize > 1024
          match = /\A(\d{3})([- ])([^\r\n]*)\r?\n\z/.match(line)
          raise IOError, "Malformed SMTP reply" unless match
          code = match[1].to_i
          # AIDEV-NOTE: Preserve backoff evidence even if a later reply line disconnects or is malformed.
          @reply_blocklisted ||= Core.blocked?(match[3].to_s)
          @reply_temporary ||= code.between?(400, 499)
          expected = code if expected.zero?
          raise IOError, "Inconsistent SMTP multiline code" if expected != code
          lines << match[3].to_s
          return [code, lines.join("\n")] if match[2] == " "
        end
        raise IOError, "Too many SMTP reply lines"
      end
    end
  end
end
