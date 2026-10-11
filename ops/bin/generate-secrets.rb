# frozen_string_literal: true

# Generates ignored local-only development credentials idempotently.
# Existing values are preserved; only missing keys are added.
require "openssl"
require "base64"
require "json"
require "securerandom"

path = ARGV.fetch(0)
existing = {}
if File.exist?(path)
  File.readlines(path, chomp: true).each do |line|
    next if line.strip.empty? || line.start_with?("#")
    key, value = line.split("=", 2)
    existing[key] = value
  end
end

def b64url(data) = Base64.urlsafe_encode64(data, padding: false)

def hs256(secret, payload)
  header = b64url(JSON.generate({ alg: "HS256", typ: "JWT" }))
  body = b64url(JSON.generate(payload))
  sig = b64url(OpenSSL::HMAC.digest("SHA256", secret, "#{header}.#{body}"))
  "#{header}.#{body}.#{sig}"
end

values = existing.dup
values["POSTGRES_PASSWORD"] ||= SecureRandom.hex(24)
values["JWT_SECRET"] ||= SecureRandom.hex(32)
now = 1_760_000_000
exp = now + (10 * 365 * 24 * 3600)
values["ANON_KEY"] ||= hs256(values["JWT_SECRET"], { role: "anon", iss: "supabase", iat: now, exp: exp })
values["SERVICE_ROLE_KEY"] ||= hs256(values["JWT_SECRET"], { role: "service_role", iss: "supabase", iat: now, exp: exp })
values["MIGRATOR_DB_PASSWORD"] ||= SecureRandom.hex(24)
values["API_DB_PASSWORD"] ||= SecureRandom.hex(24)
values["WORKER_DB_PASSWORD"] ||= SecureRandom.hex(24)
values["SECRET_KEY_BASE"] ||= SecureRandom.hex(64)

added = values.keys - existing.keys
File.open(path, File::WRONLY | File::CREAT | File::TRUNC, 0o600) do |f|
  f.puts "# Generated local-only development credentials. Never commit."
  values.each { |k, v| f.puts "#{k}=#{v}" }
end
# Match host ownership of the bind-mounted directory so the host compose CLI can read it.
dir = File.stat(File.dirname(path))
File.chown(dir.uid, dir.gid, path)
puts(added.empty? ? "secrets: preserved existing (#{values.size} keys)" : "secrets: added #{added.join(',')}")
