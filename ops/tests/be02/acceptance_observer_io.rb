# frozen_string_literal: true

require_relative "acceptance_observer"

module Be02Acceptance
  # AIDEV-NOTE: Fixed private mounts only; this one-shot process has no administrator credential or public route.
  class ObserverIO
    def self.read_private(path)
      File.open(path, File::RDONLY | File::NOFOLLOW) do |file|
        stat = file.stat
        raise "observer_file_invalid" unless stat.file? && stat.uid == Process.euid &&
          (stat.mode & 0o777) == 0o600 && stat.size.between?(1, 16_384) && stat.nlink == 1
        JSON.parse(file.read(16_385), object_class: UniqueObject)
      end
    end

    class UniqueObject < Hash
      def []=(key, value)
        raise "observer_duplicate_key" if key?(key)
        super
      end
    end

    def self.run
      config = read_private("/observer-config/role.json")
      raise "observer_config_invalid" unless config.keys.sort == %w[binding password].sort &&
        config.fetch("password").is_a?(String) && /\A[0-9a-f]{64}\z/.match?(config.fetch("password"))
      binding = config.fetch("binding")
      request = read_private("/observer-control/request.json")
      keys = %w[schema_version request_id nonce draft_id operation_id phase]
      raise "observer_request_invalid" unless request.keys.sort == keys.sort &&
        request.fetch("schema_version") == 1 && Observer::UUID.match?(request.fetch("request_id").to_s) &&
        %w[before after].include?(request.fetch("phase"))
      observer = Observer.new({ host: "db", port: 5432, dbname: "postgres", user: binding.fetch("role"),
        password: config.fetch("password"), connect_timeout: 3 }, binding)
      facts = observer.observe(draft_id: request.fetch("draft_id"), operation_id: request.fetch("operation_id"),
        nonce: request.fetch("nonce"))
      result = { "schema_version" => 1, "request_id" => request.fetch("request_id"), "phase" => request.fetch("phase"),
        "request_sha256" => Digest::SHA256.hexdigest(JSON.generate(request)), "facts" => facts }
      directory = File.lstat("/observer-control")
      raise "observer_directory_invalid" unless directory.directory? && directory.uid == Process.euid &&
        (directory.mode & 0o777) == 0o700 && File.realpath("/observer-control") == "/observer-control"
      File.open("/observer-control/result.tmp", File::WRONLY | File::CREAT | File::EXCL | File::NOFOLLOW, 0o600) do |file|
        file.write(JSON.generate(result) + "\n")
        file.flush
        file.fsync
      end
      # The scheduler permits exactly one observer invocation; a prior receipt is an error, never overwritten.
      begin
        File.lstat("/observer-control/result.json")
      rescue Errno::ENOENT
        File.rename("/observer-control/result.tmp", "/observer-control/result.json")
      else
        raise "observer_unacknowledged_result"
      end
      File.open("/observer-control", File::RDONLY) { |dir| dir.fsync }
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    Be02Acceptance::ObserverIO.run
    puts "observer=observed"
  rescue StandardError
    warn "observer=failed; private request/configuration diagnostics withheld"
    exit 1
  end
end
