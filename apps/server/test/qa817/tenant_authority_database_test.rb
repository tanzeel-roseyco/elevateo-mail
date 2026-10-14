# frozen_string_literal: true

require_relative "../be_02/collaboration_database_helper"

# AIDEV-NOTE: Use actual API login and guarded snapshots; admin observes only fixture-owned rows after denial.
class QA817TenantAuthorityDatabaseTest < CollaborationDatabaseCase
  def test_authorized_plaintext_write_is_visible_only_in_its_tenant
    witness = foreign_witness
    before = witness_rows(witness)
    content = "<script>alert('untrusted')</script>\nsecret-looking text"
    response = note(SecureRandom.uuid, body: content)
    assert_equal 201, response.status
    assert_equal content, JSON.parse(response.json).fetch("note").fetch("body_text")
    assert_equal before, witness_rows(witness)
    assert_equal 1, owned_rows("thread_notes").length
  end

  def test_foreign_tenant_read_and_write_are_denied_without_witness_mutation
    witness = foreign_witness
    before = witness_rows(witness)
    foreign_org, foreign_box, foreign_thread = witness
    # The actor belongs to both organizations, but this session is bound to the original tenant.
    refute_equal @org, foreign_org
    scope(write: false) do |connection|
      assert_empty connection.exec_query("SELECT id FROM app.threads WHERE id = '#{foreign_thread}'").to_a
    end
    error = assert_raises(Elevateo::CollaborationError) do
      state(true, thread: foreign_thread, box: foreign_box)
    end
    assert_equal "not_available", error.code
    assert_equal before, witness_rows(witness)
  end

  def test_private_mailbox_without_explicit_membership_cannot_read_or_write
    box = mailbox(visibility: "private")
    thread = conversation(box: box)
    scope(write: false) do |connection|
      assert_empty connection.exec_query("SELECT id FROM app.threads WHERE id = '#{thread}'").to_a
    end
    error = assert_raises(Elevateo::CollaborationError) { state(true, thread: thread, box: box) }
    assert_equal "not_available", error.code
    assert_empty owned_rows("thread_read_states", box: box, thread: thread, user: @user)
  end
end
