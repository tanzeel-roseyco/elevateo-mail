#!/usr/bin/env ruby
# AIDEV-NOTE: Container-only SSH substitute; no remote command is ever executed.
require 'json'
root = ENV.fetch('FIXTURE_CASE')
mode = ENV.fetch('FIXTURE_MODE')
File.write("#{root}/argv.json", JSON.generate(ARGV))
File.write("#{root}/ssh.pid", Process.pid.to_s)
File.binwrite("#{root}/stdin.bin", STDIN.read)
STDOUT.sync = STDERR.sync = true
puts 'stdout-marker'
warn 'stderr-marker'
case mode
when 'delay', 'delay37', 'hold'
  child = fork do
    sleep(mode == 'hold' ? 8 : 1)
    puts 'stdout-tail'
    warn 'stderr-tail'
    exit! 0
  end
  File.write("#{root}/child.pid", child.to_s)
when 'evidence', 'evidence37'
  Dir.mkdir("#{root}/evidence/stdout.log")
when 'timeout'
  sleep 120
when 'signal'
  Process.kill('TERM', Process.pid)
  sleep 5
end
exit(mode.end_with?('37') ? 37 : 0)
