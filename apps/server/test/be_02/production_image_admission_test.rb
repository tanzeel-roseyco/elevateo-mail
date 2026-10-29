# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "open3"

# AIDEV-NOTE: Python operations tests own credential admission; this checks the real shell wrapper boundary.
class ProductionImageAdmissionTest < Minitest::Test
  def test_forwards_arguments_without_splitting_or_shell_expansion
    arguments = ["--dry-run", "fixture with spaces", "$(must-not-execute)"]
    invoke(arguments, exit_code: 0) do |status, recorded|
      assert status.success?
      assert_equal [File.expand_path("../../../../ops/production/deployment.py", __dir__), *arguments], recorded
    end
  end

  def test_propagates_rejected_configuration_exit_status
    invoke(["--dry-run"], exit_code: 64) { |status, _recorded| assert_equal 64, status.exitstatus }
  end

  def test_propagates_runtime_failure_exit_status
    invoke([], exit_code: 1) { |status, _recorded| assert_equal 1, status.exitstatus }
  end

  private

  def invoke(arguments, exit_code:)
    Dir.mktmpdir("deployment-wrapper") do |directory|
      marker = File.join(directory, "called")
      executable = File.join(directory, "python3")
      File.write(executable, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$ADMISSION_MARKER\"\nexit \"$ADMISSION_EXIT\"\n")
      File.chmod(0o700, executable)
      script = File.expand_path("../../../../ops/production/deploy.sh", __dir__)
      environment = { "PATH" => "#{directory}:#{ENV.fetch('PATH')}",
        "ADMISSION_MARKER" => marker, "ADMISSION_EXIT" => exit_code.to_s }
      _stdout, _stderr, status = Open3.capture3(environment, "sh", script, *arguments)
      yield status, File.exist?(marker) ? File.readlines(marker, chomp: true) : []
    end
  end
end
