# frozen_string_literal: true
require "minitest/autorun"
require "tmpdir"
require "fileutils"
require "open3"
require "rbconfig"
require_relative "../../../../ops/tests/be01-services/http"
require_relative "diagnostic"

class DiagnosticTest < Minitest::Test
  ROOT = File.expand_path("../../../..", __dir__)
  ORIGINAL = File.join(ROOT, "ops/tests/be01-services/services.rb")
  # AIDEV-NOTE: Run the actual entrypoint with inert dependencies; no secrets, services or network are needed.
  STUB = <<~'RUBY'
    module Be01Services
      class Failure < StandardError; end
      def self.expect(value, label)
        raise Failure, label unless value
      end
      def self.step(name)
        puts "CALL #{name}"
        raise Failure, "auth POST status 422" if ENV["FAIL_AT"] == name
      end
      module State
        PATH = File.join(__dir__, "existing-state.json")
        def self.init; {"nonce" => "fixture", "mailbox" => "fixture", "password" => "fixture"}; end
        def self.load; Be01Services.step("load_state"); init; end
        def self.email(data, role); role; end
        def self.bytes(data); "fixture"; end
        def self.identities; Be01Services.step("identities"); %w[owner outsider]; end
        def self.read(path); Be01Services.step("completed_seed"); {"ready" => true}; end
        def self.write_once(path, data)
          Be01Services.step(path.include?("identities") ? "persist_identities" : "mark_ready")
        end
      end
      class Auth
        def initialize(key); end
        def provision(role, password); Be01Services.step("provision_#{role}"); role; end
        def signup_denied(email, password); Be01Services.step("signup_denial"); end
        def capture(kind, email); Be01Services.step("#{kind}_capture"); end
        def identity(id, email); Be01Services.step("identity_#{email}"); end
        def token(email, password, id); Be01Services.step("password_token"); "fixture"; end
      end
      class Storage
        def initialize(*args); end
        def seed(bytes); Be01Services.step("storage_seed"); end
        def check(*args); Be01Services.step("storage_check"); end
      end
    end
  RUBY
  SEED = %w[provision_owner provision_outsider persist_identities signup_denial invite_capture
            recovery_capture storage_seed identities identity_owner identity_outsider password_token storage_check mark_ready].freeze

  def run_fixture(source, failure = nil, mode = "seed", existing_state: false)
    Dir.mktmpdir do |dir|
      File.write(File.join(dir, "existing-state.json"), "{}") if existing_state
      File.write(File.join(dir, "state.rb"), STUB)
      %w[auth storage].each { |name| File.write(File.join(dir, "#{name}.rb"), "") }
      FileUtils.cp(source, File.join(dir, "services.rb"))
      FileUtils.cp(File.join(__dir__, "diagnostic.rb"), dir)
      Open3.capture3({"SERVICE_ROLE_KEY" => "fixture", "ANON_KEY" => "fixture", "FAIL_AT" => failure},
                     RbConfig.ruby, File.join(dir, "services.rb"), *[mode].compact)
    end
  end

  def test_successful_check_and_repeated_seed_use_only_check_operations
    expected = %w[load_state completed_seed identities identity_owner identity_outsider password_token storage_check]
    [ORIGINAL, File.join(__dir__, "services.rb")].each do |source|
      [["check", false], ["seed", true]].each do |mode, existing|
        out, err, status = run_fixture(source, nil, mode, existing_state: existing)
        assert status.success?, err
        assert_empty err
        assert_equal expected, out.lines.grep(/^CALL /).map { |line| line.strip.delete_prefix("CALL ") }
        assert_equal ["PASS Auth identity/token; private Storage bytes; anonymous/user/public denial\n"],
                     out.lines.grep(/^PASS /)
      end
    end
  end

  def test_setup_failures_do_not_reach_service_operations
    {"invalid" => "service_phase", nil => "unexpected_error"}.each do |mode, assertion|
      out, err, status = run_fixture(File.join(__dir__, "services.rb"), nil, mode)
      assert_equal 1, status.exitstatus
      assert_empty out
      assert_equal "FAIL service fixture stage=setup assertion=#{assertion}\n", err
    end
  end

  def test_every_original_operation_is_preserved
    original = File.readlines(ORIGINAL).map(&:strip)
    repaired = File.readlines(File.join(__dir__, "services.rb")).map(&:strip)
    original.reject { |line| line.empty? || line.start_with?("#", 'warn "FAIL') }.each do |line|
      assert_includes repaired, line
    end
    [ORIGINAL, File.join(__dir__, "services.rb")].each do |source|
      out, err, status = run_fixture(source)
      assert status.success?, err
      assert_equal SEED, out.lines.grep(/^CALL /).map { |line| line.strip.delete_prefix("CALL ") }
    end
  end

  def test_actual_stage_wiring_and_original_discrimination
    SEED.each do |stage|
      _, err, status = run_fixture(File.join(__dir__, "services.rb"), stage)
      assert_equal 1, status.exitstatus
      assert_equal "FAIL service fixture stage=#{stage} assertion=http_auth_POST_422\n", err
    end
    _, err, status = run_fixture(File.join(__dir__, "services.rb"), "completed_seed", "check")
    assert_equal 1, status.exitstatus
    assert_includes err, "stage=completed_seed"
    _, original, status = run_fixture(ORIGINAL, "invite_capture")
    assert_equal 1, status.exitstatus
    refute_includes original, "stage=invite_capture"
  end

  def test_only_allowlisted_diagnostics_escape
    secret = "token=PRIVATE\nhttps://private.invalid/body"
    [Be01Services::Failure.new(secret), RuntimeError.new(secret),
     Be01Services::Failure.new("auth POST status 422 #{secret}")].each do |error|
      report = Be01Services::Diagnostic.report(secret, error)
      refute_includes report, "PRIVATE"
      refute_includes report, "https"
      assert_match(/\AFAIL service fixture stage=unclassified assertion=(unclassified_assertion|unexpected_error)\z/, report)
    end
    assert_equal "FAIL service fixture stage=signup_denial assertion=signup_denial",
                 Be01Services::Diagnostic.report("signup_denial", Be01Services::Failure.new("signup denial reason"))
  end
end
