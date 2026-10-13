# frozen_string_literal: true
require "json"
require "digest"

# AIDEV-NOTE: Compare baked runtime files, not a source bind mount masquerading as the application image.
begin
  expected = JSON.parse(STDIN.read(65_537))
  raise "invalid manifest" unless expected.is_a?(Hash) && expected.length.between?(10, 100)
  expected.each do |path, digest|
    raise "invalid path" unless /\A[a-zA-Z0-9_.\/-]+\z/.match?(path) && !path.include?("..") && !path.start_with?("/")
    raise "invalid digest" unless /\A[0-9a-f]{64}\z/.match?(digest)
    file = File.join("/app", path)
    raise "source mismatch" unless File.file?(file) && !File.symlink?(file) && Digest::SHA256.file(file).hexdigest == digest
  end
  directories = %w[app bin config db lib sig test]
  actual = directories.flat_map { |dir| Dir.glob("/app/#{dir}/**/*", File::FNM_DOTMATCH) }
    .select { |file| File.file?(file) || File.symlink?(file) }.map { |file| file.delete_prefix("/app/") }.sort
  scoped = expected.keys.select { |path| directories.include?(path.split("/").first) }.sort
  raise "unexpected baked source" unless actual == scoped
  puts "PASS baked application source hashes and runtime file set"
rescue StandardError
  warn "baked source verification failed"
  exit 1
end
