# frozen_string_literal: true

# AIDEV-NOTE: Admin fixtures own exact limit IDs; global domains are shared across organizations, never silently reset.
module SendBudgetFixture
  def create_send_budgets(sender:, destination_domains: ["example.invalid"], ceiling: 1_000)
    @budget_route = SecureRandom.uuid
    @budget_egress = SecureRandom.uuid
    @budget_limit_ids ||= []
    @admin.exec_params(<<~SQL, [@budget_route, @org, @box, @budget_egress])
      INSERT INTO app_send_private.budget_routes
        (id,organization_id,mailbox_id,group_name,egress_id,version,enabled)
        VALUES ($1,$2,$3,'outreach',$4,1,true)
    SQL
    scopes = [["user", [@user]], ["organization", [@org]], ["group", [@org, "outreach"]], ["mailbox", [@org, @box]],
      ["sender_domain", [sender.split("@").last]], ["egress", [@budget_egress]],
      *destination_domains.uniq.map { |domain| ["destination_domain", [domain]] }]
    scopes.each do |kind, scope|
      row = @admin.exec_params(<<~SQL, [SecureRandom.uuid, kind, JSON.generate(scope), ceiling]).first
        INSERT INTO app_send_private.budget_limits (id,kind,scope,version,ceiling,enabled)
          VALUES ($1,$2,$3::jsonb,1,$4,true) ON CONFLICT (kind,scope) DO NOTHING RETURNING id
      SQL
      @budget_limit_ids << row.fetch("id") if row
    end
  end
end
