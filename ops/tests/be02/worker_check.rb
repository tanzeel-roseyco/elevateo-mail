# frozen_string_literal: true

require "pg"
# AIDEV-NOTE: Observe durable real-HTTP intents through trusted test SQL; never lend admin rights to the worker.
deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 30
PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL")) do |db|
  loop do
    counts = db.exec(<<~SQL).first
      SELECT count(*) AS total, count(*) FILTER (WHERE i.state = 'completed') AS completed
        FROM app_auth.revocation_intents i JOIN app_auth.sessions s USING(cookie_digest)
        JOIN auth.users u ON u.id = s.user_id WHERE u.email LIKE 'be02-http-%@example.invalid'
    SQL
    if counts.fetch("total").to_i >= 2 && counts.fetch("completed") == counts.fetch("total")
      puts "Worker completed real HTTP local/global Auth revocation intents"
      break
    end
    raise "worker did not complete all real HTTP revocation intents" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
    sleep 0.5
  end
end
