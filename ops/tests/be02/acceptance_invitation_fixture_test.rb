# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require_relative "acceptance_invitation"

# AIDEV-NOTE: Only DB/provider I/O is doubled; run uses actual private files, provenance gates and publication.
class InvitationFixtureTest < Minitest::Test
  class Result
    def initialize(ids = [], count = 1)
      @ids, @count = ids, count
    end
    def column_values(_column) = @ids
    def ntuples = @count
  end

  class Database
    attr_reader :events
    def initialize(ids, valid, organization)
      @ids, @valid, @organization, @events = ids, valid, organization, []
    end
    def exec_params(sql, values)
      @events << [sql, values]
      return Result.new(@ids.sort) if sql.include?("ANY($1::uuid[])")
      return Result.new([@organization]) if sql.include?("SELECT organization_id::text")
      return Result.new([], @valid ? 1 : 0) if sql.include?("confirmation_token=$3")
      Result.new
    end
    def transaction
      @events << ["begin", []]
      yield
      @events << ["commit", []]
    end
    def close = @events << ["close", []]
  end

  class Fixture < Be02Acceptance::Invitation
    attr_accessor :connection
    def database = connection
    def issue
      connection.events << ["issued", []]
      @actor = SecureRandom.uuid
    end
    def delivered_link
      "http://app.test/auth/accept?token=#{'a' * 56}&type=invite&redirect_to=http%3A%2F%2Fapp.test%2Fauth%2Fcomplete"
    end
  end

  def fixture(valid: true)
    names = %w[ELEVATEO_BROWSER_ORIGIN ELEVATEO_AUTH_URL ELEVATEO_MODE ELEVATEO_OUTBOUND_HOLD
      BE02_ACCEPTANCE_DISPATCH_ID BE02_ACCEPTANCE_NONCE]
    original = ENV.to_h.slice(*names)
    ENV.update("ELEVATEO_BROWSER_ORIGIN" => "http://app.test", "ELEVATEO_AUTH_URL" => "http://auth:9999",
      "ELEVATEO_MODE" => "local", "ELEVATEO_OUTBOUND_HOLD" => "true",
      "BE02_ACCEPTANCE_DISPATCH_ID" => "invitation-test", "BE02_ACCEPTANCE_NONCE" => "b" * 64)
    Dir.mktmpdir do |directory|
      org, box = SecureRandom.uuid, SecureRandom.uuid
      actors = Be02Acceptance::ACTORS.to_h { |name| [name, { "user_id" => SecureRandom.uuid }] }
      seed = { kind: "runtime", fixture_identity: { dispatch_id: "invitation-test", nonce: "b" * 64 },
        organizations: { primary: org }, mailboxes: { primary: box }, actors: actors }
      credentials = { schema_version: 1, passwords: Be02Acceptance::ACTORS.to_h { |name| [name, "private-test"] } }
      { "seed.json" => seed, "acceptance-credentials.json" => credentials }.each do |name, value|
        File.open(File.join(directory, name), File::WRONLY | File::CREAT | File::EXCL, 0o600) do |file|
          file.write(JSON.generate(value))
        end
      end
      instance = Fixture.new(directory)
      instance.connection = Database.new(actors.values.map { |actor| actor.fetch("user_id") }, valid, org)
      yield instance, directory, org, box
    end
  ensure
    names.each { |name| ENV.delete(name) }
    ENV.update(original)
  end

  def test_seed_verified_then_auth_issued_then_only_primary_scope_granted_then_private_ready
    fixture do |instance, directory, org, box|
      instance.run
      output = Be02Acceptance::InvitationOutput.new(directory).read(Be02Acceptance::InvitationOutput::NAME)
      assert_equal %w[actor_id link mailbox_id organization_id password version], output.keys.sort
      assert_equal org, output.fetch("organization_id")
      assert_equal box, output.fetch("mailbox_id")
      assert_equal 1, output.fetch("version")
      events = instance.connection.events
      assert events.first.first.include?("ANY($1::uuid[])")
      issued = events.index { |sql, _| sql == "issued" }
      provenance = events.index { |sql, _| sql.include?("confirmation_token=$3") }
      membership = events.index { |sql, _| sql.include?("INSERT INTO app.mailbox_memberships") }
      assert issued < provenance && provenance < membership
      assert_equal [org, box, output.fetch("actor_id")], events.fetch(membership).last
      assert_equal "close", events.last.first
      refute File.exist?(File.join(directory, Be02Acceptance::InvitationOutput::TEMP))
    end
  end

  def test_next_lane_retires_only_previous_invitation_scope_and_publishes_fresh_identity
    fixture do |first, directory, org, box|
      first.run
      output = Be02Acceptance::InvitationOutput.new(directory)
      previous = output.read(Be02Acceptance::InvitationOutput::NAME)
      second = Fixture.new(directory)
      second.connection = first.connection
      second.run
      current = output.read(Be02Acceptance::InvitationOutput::NAME)
      refute_equal previous.fetch("actor_id"), current.fetch("actor_id")
      assert_equal org, current.fetch("organization_id")
      assert_equal box, current.fetch("mailbox_id")
      deletes = second.connection.events.select { |sql, _| sql.start_with?("DELETE FROM") }
      assert_equal 1, deletes.length
      assert_equal [org, previous.fetch("actor_id")], deletes.first.last
    end
  end

  def test_wrong_auth_token_has_no_membership_or_private_publication
    fixture(valid: false) do |instance, directory, _org, _box|
      error = assert_raises(Be02Acceptance::Failure) { instance.run }
      assert_equal "invitation_auth_provenance_invalid", error.message
      refute(instance.connection.events.any? { |sql, _| sql.include?("INSERT INTO app.") })
      refute File.exist?(File.join(directory, Be02Acceptance::InvitationOutput::NAME))
      assert_equal "close", instance.connection.events.last.first
    end
  end
end
