# frozen_string_literal: true

require "openssl"
require "base64"
require "json"
require "securerandom"

module LocalSecrets
  class Invalid < StandardError; end
  MAX_BYTES = 16_384
  HEX_LENGTHS = { "POSTGRES_PASSWORD" => 48, "JWT_SECRET" => 64, "MIGRATOR_DB_PASSWORD" => 48,
                  "API_DB_PASSWORD" => 48, "WORKER_DB_PASSWORD" => 48, "SECRET_KEY_BASE" => 128 }.freeze
  JWT_ROLES = { "ANON_KEY" => "anon", "SERVICE_ROLE_KEY" => "service_role" }.freeze

  def self.b64url(data) = Base64.urlsafe_encode64(data, padding: false)

  def self.token(secret, role)
    header = b64url(JSON.generate({ alg: "HS256", typ: "JWT" }))
    body = b64url(JSON.generate({ role: role, iss: "supabase", iat: 1_760_000_000, exp: 2_075_360_000 }))
    signature = b64url(OpenSSL::HMAC.digest("SHA256", secret, "#{header}.#{body}"))
    "#{header}.#{body}.#{signature}"
  end

  def self.generated
    values = HEX_LENGTHS.transform_values { |length| SecureRandom.hex(length / 2) }
    JWT_ROLES.each { |key, role| values[key] = token(values.fetch("JWT_SECRET"), role) }
    values
  end

  def self.validate_token(value, secret, role, key)
    parts = value.split(".", -1)
    raise Invalid, "invalid #{key}" unless parts.length == 3 && parts.all? { |part| /\A[A-Za-z0-9_-]+\z/.match?(part) }

    header = JSON.parse(Base64.urlsafe_decode64(parts.fetch(0)))
    payload = JSON.parse(Base64.urlsafe_decode64(parts.fetch(1)))
    expected = b64url(OpenSSL::HMAC.digest("SHA256", secret, parts.first(2).join(".")))
    valid = header == { "alg" => "HS256", "typ" => "JWT" } && payload.is_a?(Hash) &&
            payload["role"] == role && payload["iss"] == "supabase" &&
            payload["iat"].is_a?(Integer) && payload["exp"].is_a?(Integer) && payload["exp"] > payload["iat"] &&
            OpenSSL.fixed_length_secure_compare(expected, parts.fetch(2))
    raise Invalid, "invalid #{key}" unless valid
  rescue JSON::ParserError, ArgumentError
    raise Invalid, "invalid #{key}"
  end

  # AIDEV-NOTE: Retained credentials are immutable; reject partial files instead of rotating a live database password.
  def self.validate(path)
    stat = File.lstat(path)
    raise Invalid, "credential target must be a regular file" unless stat.file?

    values = {}
    File.open(path, File::RDONLY | File::NOFOLLOW) do |file|
      actual = file.stat
      raise Invalid, "credential target changed" unless actual.file? && actual.ino == stat.ino && actual.dev == stat.dev
      text = file.read(MAX_BYTES + 1) || ""
      raise Invalid, "credential file exceeds limit" unless text.bytesize <= MAX_BYTES && text.ascii_only?

      text.each_line do |line|
        line = line.chomp
        next if line.empty? || line.start_with?("#")
        match = /\A([A-Z][A-Z0-9_]*)=([A-Za-z0-9_.-]+)\z/.match(line)
        raise Invalid, "malformed credential entry" unless match
        key, value = match.captures
        raise Invalid, "duplicate #{key}" if values.key?(key)
        values[key] = value
      end
    end
    HEX_LENGTHS.each do |key, length|
      value = values[key]
      raise Invalid, "invalid #{key}" unless value && /\A[0-9a-f]{#{length}}\z/.match?(value)
    end
    JWT_ROLES.each do |key, role|
      value = values[key]
      raise Invalid, "missing #{key}" unless value
      validate_token(value, values.fetch("JWT_SECRET"), role, key)
    end
    values
  end

  def self.sync_directory(directory)
    File.open(directory, File::RDONLY) { |file| file.fsync }
  rescue Errno::EINVAL, Errno::ENOTSUP
    # AIDEV-NOTE: Some bind mounts cannot fsync directories; exclusive publication cannot overwrite a winner.
    nil
  end

  def self.ensure_file(path)
    begin
      validate(path)
      return :preserved
    rescue Errno::ENOENT
      # Only an absent target permits creation; malformed or unsafe existing targets are never replaced.
    end

    directory = File.dirname(path)
    owner = File.stat(directory)
    temporary = File.join(directory, ".#{File.basename(path)}.#{SecureRandom.hex(16)}.tmp")
    owned = false
    result = :created
    begin
      File.open(temporary, File::WRONLY | File::CREAT | File::EXCL, 0o600) do |file|
        owned = true
        file.chown(owner.uid, owner.gid)
        file.write("# Generated local-only development credentials. Never commit.\n")
        generated.each { |key, value| file.write("#{key}=#{value}\n") }
        file.flush
        file.fsync
      end
      # AIDEV-NOTE: Linking is create-only; atomic rename would silently overwrite a concurrent winner.
      begin
        File.link(temporary, path)
      rescue Errno::EEXIST
        validate(path)
        result = :preserved
      end
      sync_directory(directory)
      result
    ensure
      File.unlink(temporary) if owned
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    raise LocalSecrets::Invalid, "expected one credential path" unless ARGV.length == 1
    puts "secrets: #{LocalSecrets.ensure_file(ARGV.fetch(0))}"
  rescue LocalSecrets::Invalid => error
    warn "secrets: #{error.message}"
    exit 1
  rescue SystemCallError, IOError => error
    # Error classes identify filesystem failures without leaking paths, values or interpolated commands.
    warn "secrets: filesystem failure (#{error.class})"
    exit 1
  end
end
