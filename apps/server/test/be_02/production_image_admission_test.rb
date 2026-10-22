# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "open3"

# AIDEV-NOTE: A fake Docker executable proves rejected images cannot reach deployment admission.
class ProductionImageAdmissionTest < Minitest::Test
  def test_rejects_missing_mutable_and_malformed_images_before_docker
    [nil, "", "server:latest", "sha256:abc", "repo@sha256:#{'a' * 63}",
      "repo@sha256:#{'g' * 64}", "repo@sha256:#{'a' * 64}suffix"].each do |image|
      with_fake_docker(image) do |status, called|
        assert_equal 64, status.exitstatus
        refute called
      end
    end
  end

  def test_accepts_local_and_repository_content_digests
    ["sha256:#{'a' * 64}", "registry.example/server@sha256:#{'0' * 64}"].each do |image|
      with_fake_docker(image) do |status, called, arguments, stderr|
        assert status.success?, stderr
        assert called
        assert_equal image, arguments.first
        assert_equal ["compose", "-f", File.expand_path("../../../../ops/production/compose.yaml", __dir__),
          "config", "--quiet"], arguments.drop(1)
      end
    end
  end

  private

  def with_fake_docker(image)
    Dir.mktmpdir("image-admission") do |directory|
      marker = File.join(directory, "called")
      executable = File.join(directory, "docker")
      File.write(executable, "#!/bin/sh\nprintf '%s\\n' \"$ELEVATEO_ADMITTED_PRODUCTION_IMAGE\" \"$@\" > \"$ADMISSION_MARKER\"\n")
      File.chmod(0o700, executable)
      script = File.expand_path("../../../../ops/production/deploy.sh", __dir__)
      environment = { "PATH" => "#{directory}:#{ENV.fetch('PATH')}",
        "ADMISSION_MARKER" => marker, "ELEVATEO_PRODUCTION_IMAGE" => image }
      _stdout, stderr, status = Open3.capture3(environment, "sh", script, "config", "--quiet")
      called = File.exist?(marker)
      yield status, called, called ? File.readlines(marker, chomp: true) : [], stderr
    end
  end
end
