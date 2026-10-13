# frozen_string_literal: true

require "json"
require "ipaddr"

module EgressAssertions
  class Invalid < StandardError; end
  class OpenControlRejected < Invalid; end

  def self.require!(condition, message)
    raise Invalid, message unless condition
  end

  def self.outcome(data, expected)
    require!(%w[connected denied unrestricted].include?(expected), "invalid expected outcome")
    outcome = expected == "unrestricted" ? "connected" : expected
    # AIDEV-NOTE: A distinct exit and token separate proven open-control rejection from Docker/tool failures.
    if expected == "denied" && data["outcome"] == "connected" && data["default_route"] == true
      raise OpenControlRejected, "open control connected"
    end
    require!(data["outcome"] == outcome, "probe did not establish #{outcome}")
    require!(data["default_route"] == true, "unrestricted control lacks default route") if expected == "unrestricted"
    if expected == "denied"
      require!(data["default_route"] == false, "confined namespace has a default route")
      require!(%w[Errno::ENETUNREACH Errno::EHOSTUNREACH].include?(data["reason"]), "unverified denial")
    end
  end

  # AIDEV-NOTE: Inspection runs in a separate networkless tool; runtime namespace probes receive no secrets.
  def self.target(data, project, service, network)
    require!(data.is_a?(Array) && data.length == 1, "target is missing or ambiguous")
    container = data.fetch(0)
    labels = container.fetch("Config").fetch("Labels")
    require!(labels["com.docker.compose.project"] == project && labels["com.docker.compose.service"] == service,
             "target labels do not match")
    require!(container.fetch("State")["Running"] == true, "target is not running")
    require!(container.fetch("NetworkSettings").fetch("Networks").keys == [network], "unexpected target network")
    host = container.fetch("HostConfig")
    require!(host["Privileged"] == false && host["NetworkMode"] != "host", "unsafe target privileges")
    require!(Array(host["CapAdd"]).none? { |cap| %w[NET_ADMIN SYS_ADMIN ALL].include?(cap) }, "unsafe capabilities")
    env = container.fetch("Config").fetch("Env").to_h { |entry| entry.split("=", 2) }
    require!(env.none? { |key, value| /(?:^|_)https?_proxy\z|^all_proxy\z/i.match?(key) && !value.to_s.empty? },
             "proxy configured")
    if %w[api worker].include?(service)
      require!(env["ELEVATEO_OUTBOUND_HOLD"] == "true" && env["ELEVATEO_SMTP_HOST"] == "mailpit" &&
               env["ELEVATEO_SMTP_PORT"] == "1025", "hold or Mailpit configuration differs")
    elsif service == "auth"
      require!(env["GOTRUE_SMTP_HOST"] == "mailpit" && env["GOTRUE_SMTP_PORT"] == "1025", "Auth SMTP differs")
    elsif service == "mailpit"
      require!(env["MP_SMTP_RELAY_ALL"] == "false", "Mailpit relay enabled")
      require!(env.none? { |key, value| key.start_with?("MP_SMTP_RELAY_") && key != "MP_SMTP_RELAY_ALL" && !value.empty? },
               "Mailpit relay configured")
    end
  end

  def self.network(data, address, internal)
    require!(data.is_a?(Array) && data.length == 1, "network missing or ambiguous")
    network = data.fetch(0)
    require!(network["Internal"] == (internal == "true"), "network internal property differs")
    require!(network["Driver"] == "bridge", "network driver must be bridge")
    subnets = network.fetch("IPAM").fetch("Config").filter_map { |config| config["Subnet"] }
    require!(!subnets.empty? && subnets.none? { |subnet| IPAddr.new(subnet).include?(address) },
             "external endpoint is inside target subnet")
  end

  def self.owned(data, nonce, kind)
    require!(data.is_a?(Array) && data.length == 1, "owned resource missing or ambiguous")
    resource = data.fetch(0)
    labels = kind == "container" ? resource.fetch("Config").fetch("Labels") : resource.fetch("Labels")
    require!(labels["elevateo.r1.invocation"] == nonce, "resource ownership mismatch")
    require!(resource.fetch("Mounts", []).none? { |mount| mount["Type"] == "volume" }, "unexpected volume retained")
  end

  def self.publication(data, gateway)
    require!(data.is_a?(Array) && data.length == 1, "listener missing or ambiguous")
    ports = data.fetch(0).fetch("NetworkSettings").fetch("Ports").fetch("8080/tcp")
    require!(ports.length == 1 && ports.fetch(0)["HostIp"] == gateway, "listener published beyond fixture gateway")
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    input = STDIN.read(1_048_577) || ""
    raise EgressAssertions::Invalid, "inspection exceeds limit" if input.bytesize > 1_048_576
    data = JSON.parse(input)
    case ARGV.fetch(0)
    when "outcome" then EgressAssertions.outcome(data, ARGV.fetch(1))
    when "target" then EgressAssertions.target(data, *ARGV.drop(1))
    when "network" then EgressAssertions.network(data, *ARGV.drop(1))
    when "owned" then EgressAssertions.owned(data, *ARGV.drop(1))
    when "publication" then EgressAssertions.publication(data, ARGV.fetch(1))
    else raise EgressAssertions::Invalid, "unknown assertion"
    end
  rescue EgressAssertions::OpenControlRejected
    puts "R1_OPEN_CONTROL_REJECTED"
    exit 42
  rescue StandardError => error
    # Inspection may contain credentials: never print data or exception messages from JSON/parsing/library code.
    warn(error.is_a?(EgressAssertions::Invalid) ? error.message : "invalid assertion input (#{error.class})")
    exit 1
  end
end
