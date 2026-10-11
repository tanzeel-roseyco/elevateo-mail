# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require "tmpdir"
require "digest"
require_relative "../bin/generate-secrets"

class SecretsTest < Minitest::Test
  def setup
    # AIDEV-NOTE: Set R1_SCRATCH to a task-owned bind mount to run this same suite on Windows-backed storage.
    @directory = Dir.mktmpdir("be01r1-secrets-", ENV["R1_SCRATCH"])
    @path = File.join(@directory, ".env")
  end

  def teardown
    FileUtils.remove_entry(@directory)
  end

  def snapshot
    stat = File.stat(@path)
    [Digest::SHA256.file(@path).hexdigest, stat.ino, stat.mode, stat.uid, stat.gid, stat.size, stat.mtime, stat.ctime]
  end

  def test_creation_and_existing_file_are_complete_and_immutable
    assert_equal :created, LocalSecrets.ensure_file(@path)
    assert_equal 8, LocalSecrets.validate(@path).size
    assert_equal 0o600, File.stat(@path).mode & 0o777
    before = snapshot
    assert_equal :preserved, LocalSecrets.ensure_file(@path)
    assert_equal before, snapshot
    assert_equal [".env"], Dir.children(@directory)
  end

  def test_invalid_existing_files_are_preserved
    ["", "JWT_SECRET=partial\n", "POSTGRES_PASSWORD=one\nPOSTGRES_PASSWORD=two\n"].each do |bytes|
      File.write(@path, bytes)
      before = snapshot
      assert_raises(LocalSecrets::Invalid) { LocalSecrets.ensure_file(@path) }
      assert_equal before, snapshot
    end
  end

  def test_wrong_signed_role_and_oversized_file_are_rejected
    LocalSecrets.ensure_file(@path)
    values = LocalSecrets.validate(@path)
    values["ANON_KEY"] = values.fetch("SERVICE_ROLE_KEY")
    File.write(@path, values.map { |key, value| "#{key}=#{value}\n" }.join)
    assert_raises(LocalSecrets::Invalid) { LocalSecrets.ensure_file(@path) }
    File.write(@path, "#" * (LocalSecrets::MAX_BYTES + 1))
    assert_raises(LocalSecrets::Invalid) { LocalSecrets.ensure_file(@path) }
  end

  def test_symlink_is_never_followed_or_replaced
    target = File.join(@directory, "target")
    File.write(target, "untouched")
    File.symlink(target, @path)
    assert_raises(LocalSecrets::Invalid) { LocalSecrets.ensure_file(@path) }
    assert File.symlink?(@path)
    assert_equal "untouched", File.read(target)
  end

  def test_concurrent_creators_publish_one_complete_winner
    readers, writers = 8.times.map { IO.pipe }.transpose
    children = writers.map do |writer|
      fork do
        readers.each(&:close)
        result = LocalSecrets.ensure_file(@path)
        writer.write(result.to_s)
        writers.each(&:close)
        exit! 0
      rescue StandardError
        exit! 1
      end
    end
    writers.each(&:close)
    results = readers.map(&:read)
    readers.each(&:close)
    children.each { |pid| assert Process.wait2(pid).last.success? }
    assert_equal 1, results.count("created")
    assert_equal 7, results.count("preserved")
    assert_equal 8, LocalSecrets.validate(@path).size
    assert_equal [".env"], Dir.children(@directory)
  end

  def test_link_failure_does_not_leave_a_partial_target_or_temporary
    File.stub(:link, ->(*) { raise Errno::EOPNOTSUPP }) do
      assert_raises(Errno::EOPNOTSUPP) { LocalSecrets.ensure_file(@path) }
    end
    refute File.exist?(@path)
    assert_empty Dir.children(@directory)
  end

  def test_write_flush_and_file_sync_failures_leave_no_target
    original_open = File.method(:open)
    %i[write flush fsync].each do |operation|
      injected_open = lambda do |*arguments, &block|
        original_open.call(*arguments) do |file|
          if arguments.first.end_with?(".tmp")
            file.define_singleton_method(operation) { |*| raise IOError, "injected file failure" }
          end
          block.call(file)
        end
      end
      File.stub(:open, injected_open) do
        assert_raises(IOError) { LocalSecrets.ensure_file(@path) }
      end
      refute File.exist?(@path)
      assert_empty Dir.children(@directory)
    end
  end

  def test_post_publication_failure_retains_complete_target
    LocalSecrets.stub(:sync_directory, ->(*) { raise IOError, "injected flush failure" }) do
      assert_raises(IOError) { LocalSecrets.ensure_file(@path) }
    end
    assert_equal 8, LocalSecrets.validate(@path).size
    assert_equal [".env"], Dir.children(@directory)
  end
end
