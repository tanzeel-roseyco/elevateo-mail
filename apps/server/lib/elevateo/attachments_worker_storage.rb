# frozen_string_literal: true

require_relative "attachments_storage"

module Elevateo
  module Attachments
    # AIDEV-NOTE: Workers accept an environment secret or a legacy protected file; API receives neither authority.
    class WorkerStorage
      def self.load!(env)
        path, bucket = env["ELEVATEO_INBOUND_STORAGE_TOKEN_PATH"], env["ELEVATEO_INBOUND_STORAGE_BUCKET"]
        secret = env["ELEVATEO_INBOUND_STORAGE_TOKEN"]
        return nil if path.nil? && bucket.nil? && secret.nil?
        if secret
          unless path.nil? && env["ELEVATEO_PROCESS"] == "worker" && bucket.is_a?(String) &&
              PrivateStorage::BUCKET.match?(bucket) && secret.bytesize.between?(32, 4096) &&
              /\A[A-Za-z0-9._~+\/-]+=*\z/n.match?(secret.b)
            raise ArgumentError
          end
          return PrivateStorage.new(base_url: "http://storage:5000", bucket: bucket.dup.freeze,
            service_token: secret.dup.freeze, process: "worker")
        end

        unless path.is_a?(String) && path.start_with?("/") && path.bytesize.between?(2, 4096) &&
            !path.include?("\0") && bucket.is_a?(String) && PrivateStorage::BUCKET.match?(bucket)
          raise ArgumentError
        end
        token = File.open(path, File::RDONLY | File::NONBLOCK | File::NOFOLLOW) do |file|
          stat = file.stat
          unless stat.file? && stat.nlink == 1 && (stat.mode & 0o7777) == 0o600 &&
              [0, Process.uid].include?(stat.uid) && stat.size.between?(32, 4096)
            raise ArgumentError
          end
          bytes = file.read(4097)
          unless bytes && bytes.bytesize.between?(32, 4096) && /\A[A-Za-z0-9._~+\/-]+=*\z/n.match?(bytes.b)
            raise ArgumentError
          end
          bytes.freeze
        end
        PrivateStorage.new(base_url: "http://storage:5000", bucket: bucket.dup.freeze,
          service_token: token, process: "worker")
      rescue SystemCallError, IOError, ArgumentError
        # AIDEV-NOTE: Filesystem exceptions contain secret paths; strip causes as well as their diagnostic messages.
        raise ArgumentError, "inbound private storage configuration unavailable", cause: nil
      end
    end
  end
end
