# frozen_string_literal: true

require_relative "mailbox_rotation_helper"
require_relative "authorized_peer_fixture"

class MailboxRotationTenantTest < MailboxRotationTestCase
  include AuthorizedPeerFixture

  def test_old_backlog_cannot_monopolize_another_organization
    peer = build_send_peer(MailboxRotationTestCase)
    peer.instance_variable_set(:@epoch, @epoch)
    backlog = Array.new(5) { enqueue }
    backlog.each { |id| make_older(id) }
    other = peer.enqueue
    selected = due
    assert_includes backlog, selected
    assert_equal other, due(excluded: [selected])
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM app_send_private.mailbox_schedule WHERE organization_id=$1", [peer.instance_variable_get(:@org)]).getvalue(0, 0)
  end

  def teardown
    @peer&.teardown
  ensure
    super
  end
end
