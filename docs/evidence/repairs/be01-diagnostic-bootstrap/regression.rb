#!/usr/bin/env ruby
require 'digest'
require 'fileutils'
require 'json'
require 'open3'
require 'tmpdir'
require 'timeout'
# AIDEV-NOTE: Run unchanged caller in child pwsh; fake SSH is reachable only through this fixture PATH.
HERE = File.expand_path(__dir__)
EXPECTED_ARGS = %w[-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=10
                   -o ServerAliveCountMax=3 fleet-02 timeout -k 5s 45s bash -s].freeze
PINS = {
  'bootstrap.ps1' => '0dd7ddede090bb85eaaf6e5b94de1d3ed12011ea288787061384cbefe406484d',
  'bootstrap.sh' => '3ab389aa8f6d022afa3ea531d031b2912d3c0a8911b66ac761df5a4121424db3'
}.freeze
PINS.each { |name, sha| abort "pin failed: #{name}" unless Digest::SHA256.file("#{HERE}/#{name}").hexdigest == sha }
abort 'Docker-only fixture requires UID10001' unless Process.uid == 10_001

def check(condition, message)
  raise message unless condition
end

def alive?(pid)
  Process.kill(0, pid)
  # Linux orphan zombies have stopped executing and cannot retain output pipes.
  File.read("/proc/#{pid}/stat").split(') ', 2).last.split.first != 'Z'
rescue Errno::ESRCH, Errno::ENOENT
  false
end

Dir.mktmpdir('bootstrap-fixture-', '/tmp') do |root|
  bin = "#{root}/bin"
  Dir.mkdir(bin)
  FileUtils.copy_file("#{HERE}/fake-ssh.rb", "#{bin}/ssh.exe")
  File.chmod(0o755, "#{bin}/ssh.exe")
  cases = { 'ok' => 0, 'exit37' => 37, 'delay' => 0, 'delay37' => 37,
            'hold' => 1, 'evidence' => 1, 'evidence37' => 37, 'signal' => 143, 'timeout' => 124 }
  cases.each do |mode, expected|
    path = "#{root}/#{mode}"
    Dir.mkdir(path)
    env = { 'PATH' => "#{bin}:#{ENV.fetch('PATH')}", 'FIXTURE_CASE' => path, 'FIXTURE_MODE' => mode }
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      Open3.popen3(env, 'pwsh', '-NoLogo', '-NoProfile', '-File', "#{HERE}/bootstrap.ps1",
                  '-EvidenceDirectory', "#{path}/evidence", pgroup: true) do |input, output, error, waiter|
        begin
          input.close
          readers = [Thread.new { output.read }, Thread.new { error.read }]
          status = Timeout.timeout(105) { waiter.value }
          logs = readers.map { |reader| Timeout.timeout(3) { reader.value } }
          File.write("#{path}/pwsh.stdout", logs[0])
          File.write("#{path}/pwsh.stderr", logs[1])
          check(status.exitstatus == expected, "#{mode}: caller status #{status.exitstatus}, expected #{expected}")
      elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
      check(JSON.parse(File.read("#{path}/argv.json")) == EXPECTED_ARGS, "#{mode}: argv")
      check(File.binread("#{path}/stdin.bin") == File.binread("#{HERE}/bootstrap.sh"), "#{mode}: stdin")
      fields = File.readlines("#{path}/evidence/caller.status", chomp: true).to_h { |line| line.split('=', 2) }
      check(fields.fetch('cleanup_error_type').empty?, "#{mode}: cleanup uncertain")
      check(fields.fetch('caller_error_type').empty?, "#{mode}: unexpected exception")
      check(fields.fetch('timeout') == (mode == 'timeout' ? 'True' : 'False'), "#{mode}: timeout flag")
      native = mode == 'timeout' ? 137 : (mode == 'signal' ? 143 : (mode.end_with?('37') ? 37 : 0))
      check(fields.fetch('native_ssh_exit') == native.to_s, "#{mode}: native exit")
      check(!alive?(Integer(File.read("#{path}/ssh.pid"))), "#{mode}: SSH survived")
      if %w[hold evidence evidence37].include?(mode)
        check(!fields.fetch('evidence_error').empty?, "#{mode}: missing evidence failure")
      else
        check(fields.fetch('evidence_error').empty?, "#{mode}: evidence failure")
        tail = mode.start_with?('delay') ? "stdout-tail\n" : ''
        check(File.read("#{path}/evidence/stdout.log") == "stdout-marker\n#{tail}", "#{mode}: stdout")
        check(File.read("#{path}/evidence/stderr.log") == "stderr-marker\n#{tail.sub('stdout', 'stderr')}", "#{mode}: stderr")
      end
      check(elapsed >= 5 && elapsed < 9, 'hold: shared drain deadline') if mode == 'hold'
      check(elapsed >= 75 && elapsed < 100, 'timeout: bound') if mode == 'timeout'
      puts "PASS #{mode}"
        ensure
          original = $!
          cleanup_error = nil
          # AIDEV-NOTE: Kill inside the block BEFORE Open3's unconditional waiter join on block exit.
          begin
            Process.kill('KILL', -waiter.pid)
          rescue Errno::ESRCH
            nil
          rescue StandardError => failure
            cleanup_error = failure
          end
          unless waiter.join(3)
            warn(original.full_message) if original
            warn "#{mode}: exact-group reap UNKNOWN; container reconciliation required"
            # Avoid Open3's unbounded join when even KILL cannot establish process termination.
            exit! 1
          end
          warn(cleanup_error.full_message) if cleanup_error
          raise cleanup_error if cleanup_error && !original
        end
      end
  end
  puts 'PASS 9 bootstrap cases; Linux pwsh only'
end
