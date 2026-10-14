# frozen_string_literal: true

require "json"
require "securerandom"

module Be02Acceptance
  # AIDEV-NOTE: Private publication is exclusive; only the runner removes files after all consumers stop.
  class InvitationOutput
    NAME = "acceptance-invitation.json"
    TEMP = "acceptance-invitation.tmp"

    def initialize(directory = "/acceptance")
      @directory = directory
      info = File.lstat(directory)
      Be02Acceptance.check(info.directory? && File.realpath(directory) == directory &&
        info.uid == Process.euid && info.gid == Process.egid && (info.mode & 0o777) == 0o700,
        "invitation_directory_invalid")
    end

    def read(name)
      File.open(File.join(@directory, name), File::RDONLY | File::NOFOLLOW | File::NONBLOCK) do |file|
        validate(file.stat)
        Be02Acceptance.check(file.stat.size.between?(1, 65_536), "invitation_input_size_invalid")
        bytes = file.read(65_537).to_s
        Be02Acceptance.check(bytes && bytes.bytesize <= 65_536, "invitation_input_size_invalid")
        # @type var value: invitation_json
        value = JSON.parse(bytes)
        raise Failure, "invitation_input_invalid" unless value.is_a?(Hash)
        value
      end
    end

    def reset
      path = File.join(@directory, NAME)
      begin
        validate(File.lstat(path))
        File.unlink(path)
      rescue Errno::ENOENT
        # AIDEV-NOTE: First lane has no invitation; a retained temporary file is never adopted or overwritten.
      end
    end

    def publish(value)
      path = File.join(@directory, NAME)
      temporary = File.join(@directory, TEMP)
      created = false
      published = false
      begin
        File.open(temporary, File::WRONLY | File::CREAT | File::EXCL | File::NOFOLLOW, 0o600) do |file|
          created = true
          validate(file.stat)
          file.write(JSON.generate(value) + "\n")
          file.flush
          file.fsync
        end
        # AIDEV-NOTE: Same-directory hardlink publishes complete bytes atomically without replacing an existing file.
        File.link(temporary, path)
        published = true
      ensure
        File.unlink(temporary) if created
      end
      File.open(@directory, File::RDONLY) { |directory| directory.fsync }
    rescue StandardError
      File.unlink(path) if published
      raise
    end

    private

    def validate(info)
      Be02Acceptance.check(info.file? && info.uid == Process.euid && info.gid == Process.egid &&
        (info.mode & 0o777) == 0o600 && info.nlink == 1, "invitation_file_invalid")
    end
  end
end
