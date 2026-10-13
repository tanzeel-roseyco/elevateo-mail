# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require "open3"
require "tmpdir"
require "rbconfig"
require_relative "egress_probe"
require_relative "egress_assert"

class EgressTest < Minitest::Test
  def probe_error(error)
    File.stub(:readlines, ["header", "eth0 000011AC 00000000 0001"]) do
      Socket.stub(:tcp, ->(*) { raise error }) { EgressProbe.call("192.0.2.1", "8080") }
    end
  end

  def test_only_kernel_no_route_errors_count_as_denial
    [Errno::ENETUNREACH, Errno::EHOSTUNREACH].each do |error|
      result = probe_error(error)
      assert_equal "denied", result.fetch(:outcome)
      EgressAssertions.outcome(result.transform_keys(&:to_s), "denied")
    end
    [Errno::ECONNREFUSED, Errno::ETIMEDOUT, IOError].each do |error|
      result = probe_error(error)
      assert_equal "invalid", result.fetch(:outcome)
      assert_raises(EgressAssertions::Invalid) { EgressAssertions.outcome(result.transform_keys(&:to_s), "denied") }
    end
  end

  def test_connected_open_control_fails_identical_denial_checker
    data = { "outcome" => "connected", "default_route" => true }
    EgressAssertions.outcome(data, "unrestricted")
    assert_raises(EgressAssertions::Invalid) { EgressAssertions.outcome(data, "denied") }
  end

  def test_checker_cli_distinguishes_rejection_from_invalid_input
    checker = File.join(__dir__, "egress_assert.rb")
    output, _, status = Open3.capture3(RbConfig.ruby, checker, "outcome", "denied",
                                      stdin_data: '{"outcome":"connected","default_route":true}')
    assert_equal 42, status.exitstatus
    assert_equal "R1_OPEN_CONTROL_REJECTED\n", output
    ["", "not-json", '{"outcome":"invalid"}'].each do |input|
      output, _, status = Open3.capture3(RbConfig.ruby, checker, "outcome", "denied", stdin_data: input)
      assert_equal 1, status.exitstatus
      assert_empty output
    end
  end

  # AIDEV-NOTE: Vary token and exit independently only after the real unrestricted checker succeeds.
  def check_wrapper_failure_protocol(shell, source, invocation)
    Dir.mktmpdir("r1-checker-") do |directory|
      docker = File.join(directory, "docker.rb")
      File.write(docker, <<~RUBY)
        require "rbconfig"
        if ARGV.last == "denied" && ENV.fetch("R1_INJECT") != "none"
          puts ENV.fetch("R1_TOKEN") unless ENV.fetch("R1_TOKEN").empty?
          exit Integer(ENV.fetch("R1_INJECT"))
        end
        exec RbConfig.ruby, #{File.join(__dir__, "egress_assert.rb").inspect}, *ARGV.last(2)
      RUBY
      # AIDEV-NOTE: Interpret the fake command explicitly so read-only containers can keep /tmp mounted noexec.
      File.chmod(0o600, docker)
      dispatch = if shell == "sh"
                   'docker() { "$R1_TEST_RUBY" "$R1_TEST_DOCKER" "$@"; }'
                 else
                   # AIDEV-NOTE: Forward pipeline JSON; keep native Ruby last to preserve LASTEXITCODE for wrappers.
                   'function docker { $input | & $env:R1_TEST_RUBY $env:R1_TEST_DOCKER @args }'
                 end
      script = File.join(directory, shell == "sh" ? "check.sh" : "check.ps1")
      File.write(script, dispatch + "\n" + source + "\n" + invocation)
      cases = %w[none 125 1 42 0].map { |injected| [injected, ""] }
      cases.concat(%w[0 1 125].map { |injected| [injected, "R1_OPEN_CONTROL_REJECTED"] })
      cases << ["42", "R1_OPEN_CONTROL_REJECTED_WRONG"]
      cases.each do |injected, token|
        env = { "R1_TEST_RUBY" => RbConfig.ruby, "R1_TEST_DOCKER" => docker,
                "R1_INJECT" => injected, "R1_TOKEN" => token }
        command = shell == "sh" ? [shell, script] : [shell, "-NoProfile", "-File", script]
        output, errors, status = Open3.capture3(env, *command)
        assert_equal injected == "none", status.success?,
                     "#{shell}: denial-only injection #{injected}, token #{token.inspect}, " \
                     "exit #{status.exitstatus}, stdout #{output.byteslice(0, 1024).inspect}, " \
                     "stderr #{errors.byteslice(0, 1024).inspect}"
      end
    end
  end

  def test_shell_rejects_docker_failure_only_on_denial_invocation
    wrapper = File.read(File.join(__dir__, "egress-check.sh"))
    functions = %w[assert_json assert_open_rejected].map { |name| wrapper.match(/^#{name}\(\) \{\n.*?^\}/m).to_s }.join("\n")
    source = "set -eu\nROOT=/unused\nNONCE=test\nRUBY=unused\n" + functions
    check_wrapper_failure_protocol("sh", source, <<~SH)
      output='{"outcome":"connected","default_route":true}'
      printf '%s' "$output" | assert_json outcome unrestricted
      assert_open_rejected "$output"
    SH
  end

  def test_powershell_rejects_docker_failure_only_on_denial_invocation
    shell = ENV["R1_POWERSHELL"]
    skip "PowerShell container lane unavailable; set R1_POWERSHELL to its executable" unless shell
    wrapper = File.read(File.join(__dir__, "egress-check.ps1"))
    functions = %w[Assert-Json Assert-OpenRejected].map { |name| wrapper.match(/^function #{name}\(.*?^\}/m).to_s }.join("\n")
    source = "$ErrorActionPreference = 'Stop'\n$Label='test'\n$Mount='unused'\n$Ruby='unused'\n" + functions
    check_wrapper_failure_protocol(shell, source, <<~PS)
      $output='{"outcome":"connected","default_route":true}'
      Assert-Json $output @('outcome', 'unrestricted')
      Assert-OpenRejected $output
    PS
  end

  def test_malformed_and_default_route_denials_fail
    [{}, { "outcome" => "denied" }, { "outcome" => "denied", "default_route" => true,
                                      "reason" => "Errno::ENETUNREACH" }].each do |data|
      assert_raises(EgressAssertions::Invalid) { EgressAssertions.outcome(data, "denied") }
    end
    assert_equal "invalid", EgressProbe.call("db", "5432").fetch(:outcome)
    assert_equal "invalid", EgressProbe.call("127.0.0.1", "0").fetch(:outcome)
  end

  def test_foreign_resources_and_volume_mounts_are_not_cleanup_candidates
    owned = [{ "Config" => { "Labels" => { "elevateo.r1.invocation" => "current" } }, "Mounts" => [] }]
    EgressAssertions.owned(owned, "current", "container")
    assert_raises(EgressAssertions::Invalid) { EgressAssertions.owned(owned, "foreign", "container") }
    owned.fetch(0)["Mounts"] = [{ "Type" => "volume", "Name" => "persistent" }]
    assert_raises(EgressAssertions::Invalid) { EgressAssertions.owned(owned, "current", "container") }
  end

  def test_missing_or_stopped_target_cannot_pass
    assert_raises(EgressAssertions::Invalid) { EgressAssertions.target([], "project", "api", "runtime") }
    stopped = [{ "Config" => { "Labels" => { "com.docker.compose.project" => "project",
                                             "com.docker.compose.service" => "api" } },
                 "State" => { "Running" => false } }]
    assert_raises(EgressAssertions::Invalid) { EgressAssertions.target(stopped, "project", "api", "runtime") }
  end

  def test_external_endpoint_must_be_outside_confined_subnet
    network = [{ "Internal" => true, "Driver" => "bridge", "IPAM" => { "Config" => [{ "Subnet" => "172.20.0.0/16" }] } }]
    EgressAssertions.network(network, "172.21.0.1", "true")
    assert_raises(EgressAssertions::Invalid) { EgressAssertions.network(network, "172.20.0.1", "true") }
  end
end
