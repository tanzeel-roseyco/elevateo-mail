# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require_relative "acceptance_invitation"

class AcceptanceInvitationTest < Minitest::Test
  def link
    "http://app.test/auth/accept?token=#{'a' * 64}&type=invite&redirect_to=http%3A%2F%2Fapp.test%2Fauth%2Fcomplete"
  end

  def private_directory
    Dir.mktmpdir do |directory|
      File.chmod(0o700, directory)
      yield directory, Be02Acceptance::InvitationOutput.new(directory)
    end
  end

  def test_real_link_shape_and_private_contract_publication
    assert_equal "a" * 64, Be02Acceptance::Invitation.validate_link(link)
    private_directory do |directory, output|
      value = { version: 1, link: link, password: "Synthetic!only", actor_id: SecureRandom.uuid,
        organization_id: SecureRandom.uuid, mailbox_id: SecureRandom.uuid }
      output.publish(value)
      assert_equal JSON.parse(JSON.generate(value)), output.read(Be02Acceptance::InvitationOutput::NAME)
      info = File.lstat(File.join(directory, Be02Acceptance::InvitationOutput::NAME))
      assert_equal 0o600, info.mode & 0o777
      assert_equal 1, info.nlink
      refute File.exist?(File.join(directory, Be02Acceptance::InvitationOutput::TEMP))
      output.reset
      assert_empty Dir.children(directory)
    end
  end

  def test_bad_provenance_fails_without_disclosing_link
    [link.sub("app.test/auth/accept", "evil.test/auth/accept"), link.sub("http://app.test/", "http://user@app.test/"),
      link.sub("type=invite", "type=recovery"), link + "&type=invite", link + "#secret",
      link.sub("app.test%2Fauth", "evil.test%2Fauth"), link.sub("token=#{'a' * 64}", "token=secret")].each do |bad|
      error = assert_raises(Be02Acceptance::Failure) { Be02Acceptance::Invitation.validate_link(bad) }
      assert_match(/\Ainvitation_[a-z_]+\z/, error.message)
      refute_includes error.message, bad
    end
  end

  def test_existing_output_is_not_replaced_and_temporary_is_cleaned
    private_directory do |directory, output|
      output.publish({ marker: "original" })
      assert_raises(Errno::EEXIST) { output.publish({ marker: "replacement" }) }
      assert_equal({ "marker" => "original" }, output.read(Be02Acceptance::InvitationOutput::NAME))
      refute File.exist?(File.join(directory, Be02Acceptance::InvitationOutput::TEMP))
    end
  end

  def test_symlink_and_insecure_directory_are_rejected
    private_directory do |directory, output|
      source = File.join(directory, "owned.json")
      File.write(source, '{}', mode: "w", perm: 0o600)
      File.symlink(source, File.join(directory, Be02Acceptance::InvitationOutput::NAME))
      assert_raises(Be02Acceptance::Failure) { output.reset }
      assert_raises(Errno::ELOOP) { output.read(Be02Acceptance::InvitationOutput::NAME) }
      assert File.exist?(source)
      File.chmod(0o755, directory)
      assert_raises(Be02Acceptance::Failure) { Be02Acceptance::InvitationOutput.new(directory) }
    end
  end

  def test_missing_seed_fails_before_any_auth_invitation
    old = ENV.to_h.slice("ELEVATEO_BROWSER_ORIGIN", "ELEVATEO_AUTH_URL", "ELEVATEO_MODE", "ELEVATEO_OUTBOUND_HOLD")
    ENV.update("ELEVATEO_BROWSER_ORIGIN" => "http://app.test", "ELEVATEO_AUTH_URL" => "http://auth:9999",
      "ELEVATEO_MODE" => "local", "ELEVATEO_OUTBOUND_HOLD" => "true")
    private_directory do |directory, _output|
      assert_raises(Errno::ENOENT) { Be02Acceptance::Invitation.new(directory) }
      assert_empty Dir.children(directory)
    end
  ensure
    %w[ELEVATEO_BROWSER_ORIGIN ELEVATEO_AUTH_URL ELEVATEO_MODE ELEVATEO_OUTBOUND_HOLD].each { |key| ENV.delete(key) }
    ENV.update(old)
  end
end
