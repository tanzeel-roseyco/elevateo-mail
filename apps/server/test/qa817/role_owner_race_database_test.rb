# frozen_string_literal: true

require_relative "../be_02/mailbox_membership_database_helper"

# AIDEV-NOTE: A unique owner is a database invariant, including two distinct simultaneous enrollment candidates.
class QA817RoleOwnerRaceDatabaseTest < MailboxMembershipDatabaseCase
  # AIDEV-NOTE: These role-specific cases seed their own grants; inherited cleanup owns final-owner removal.
  def sec802_default_fixture?
    false
  end

  def test_distinct_owner_insert_race_leaves_exactly_one_owner
    candidates = [add_actor, add_actor]
    connections = Array.new(2) { connect("BE02_ADMIN_DATABASE_URL", "supabase_admin") }
    start = Queue.new
    workers = connections.each_with_index.map do |connection, index|
      Thread.new do
        start.pop
        begin
          connection.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'owner')",
            [@org, candidates.fetch(index).user_id])
          :inserted
        rescue PG::UniqueViolation
          :duplicate
        end
      end.tap { |thread| thread.report_on_exception = false }
    end
    2.times { start << true }
    workers.each { |worker| raise "owner race exceeded deadline" unless worker.join(3) }
    assert_equal %i[duplicate inserted], workers.map(&:value).sort
    rows = @admin.exec_params("SELECT user_id FROM app.organization_access WHERE organization_id=$1 AND role='owner'",
      [@org]).map { |row| row.fetch("user_id") }
    assert_equal 1, rows.length
    assert_includes candidates.map(&:user_id), rows.first
  ensure
    2.times { start << true } if start
    workers&.each do |worker|
      unless worker.join(3)
        worker.kill
        worker.join(1)
      end
    end
    close_connections(connections || [])
  end
end
