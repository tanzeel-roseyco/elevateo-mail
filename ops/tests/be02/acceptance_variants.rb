# frozen_string_literal: true

require_relative "acceptance_seed_support"

module Be02Acceptance
  module Variants
    NAMES = %w[base multi_mailbox literal_read].freeze
    LITERAL = '<script>globalThis.ACCEPTANCE_LITERAL_EXECUTED=true</script><img src="https://literal.invalid/pixel"><a href="https://literal.invalid/">synthetic link</a>'.freeze
    module_function

    def seed(db:, seed:, variant:)
      validate_seed(seed, variant)
      Be02Acceptance.check(db.transaction_status == PG::PQTRANS_INTRANS &&
        db.exec("SHOW transaction_read_only").getvalue(0, 0) == "off", "variant_seed_transaction_required")
      if variant == "multi_mailbox"
        db.exec_params("SELECT app_auth.lock_authorization_generations($1,NULL)", [seed.fetch("organizations").fetch("primary")])
      end
      resources = { "extra_mailboxes" => {}, "literal_threads" => {} }
      aliases = variant == "multi_mailbox" ? %w[secondary excluded] : %w[read_empty read_literal]
      key = variant == "multi_mailbox" ? "extra_mailboxes" : "literal_threads"
      aliases.each { |name| resources.fetch(key)[name] = SecureRandom.uuid } unless variant == "base"
      validate_resources(seed, variant, resources)
      rows(seed, resources).each do |table, row|
        values = row.dup
        values[:id] = SecureRandom.uuid if table == "app.messages"
        columns = values.keys.map { |column| PG::Connection.quote_ident(column.to_s) }.join(",")
        placeholders = values.each_key.with_index.map { |_, index| "$#{index + 1}" }.join(",")
        db.exec_params("INSERT INTO #{table} (#{columns}) VALUES (#{placeholders})", values.values)
      end
      resources
    end

    # AIDEV-NOTE: Caller opens a NEW post-commit readonly connection; this helper never publishes credentials or manifests.
    def verify(db:, seed:, variant:, resources:)
      validate_seed(seed, variant)
      validate_resources(seed, variant, resources)
      Be02Acceptance.check(db.transaction_status == PG::PQTRANS_INTRANS &&
        db.exec("SHOW transaction_read_only").getvalue(0, 0) == "on" &&
        db.exec("SHOW transaction_isolation").getvalue(0, 0) == "repeatable read", "variant_readonly_snapshot_required")
      rows(seed, resources).each do |table, row|
        predicates = row.each_key.with_index.map do |column, index|
          "#{PG::Connection.quote_ident(column.to_s)} IS NOT DISTINCT FROM $#{index + 1}"
        end
        count = db.exec_params("SELECT count(*) FROM #{table} WHERE #{predicates.join(' AND ')}", row.values).getvalue(0, 0)
        Be02Acceptance.check(count == "1", "variant_committed_row_mismatch")
      end
      resources.fetch("extra_mailboxes").each do |name, id|
        count = db.exec_params("SELECT count(*) FROM app.mailbox_memberships WHERE mailbox_id=$1", [id]).getvalue(0, 0)
        Be02Acceptance.check(count == (name == "secondary" ? "1" : "0"), "variant_membership_set_mismatch")
      end
      resources.fetch("literal_threads").each do |name, id|
        messages = db.exec_params("SELECT count(*) FROM app.messages WHERE thread_id=$1", [id]).getvalue(0, 0)
        states = db.exec_params("SELECT count(*) FROM app.thread_read_states WHERE thread_id=$1", [id]).getvalue(0, 0)
        Be02Acceptance.check(messages == "1" && states == (name == "read_empty" ? "0" : "2"), "variant_literal_set_mismatch")
      end
      resources
    end

    def validate_seed(seed, variant)
      Be02Acceptance.check(NAMES.include?(variant) && seed.is_a?(Hash), "variant_input_invalid")
      actors = seed.fetch("actors")
      Be02Acceptance.check(actors.is_a?(Hash) && actors.size == ACTORS.size &&
        ACTORS.all? { |name| actors[name].is_a?(Hash) && actors[name].key?("user_id") }, "variant_input_invalid")
      %w[organizations mailboxes].each do |name|
        map = seed[name]
        Be02Acceptance.check(map.is_a?(Hash) && map.size == 2 &&
          %w[primary other].all? { |key| map.key?(key) }, "variant_input_invalid")
      end
      Be02Acceptance.check(seed["data"].is_a?(Hash), "variant_input_invalid")
      ids = actors.values.map { |actor| actor.fetch("user_id") } + seed.fetch("organizations").values +
        seed.fetch("mailboxes").values + seed.fetch("data").values_at("thread_primary", "thread_other", "draft_primary", "draft_other")
      Be02Acceptance.check(ids.all? { |id| id.is_a?(String) && UUID.match?(id) } && ids.uniq.size == ids.size,
        "variant_seed_ids_invalid")
      Time.iso8601(seed.fetch("data").fetch("ordered_at"))
    rescue KeyError, TypeError, ArgumentError, NoMethodError
      raise Failure, "variant_input_invalid"
    end

    def validate_resources(seed, variant, resources)
      Be02Acceptance.check(resources.is_a?(Hash) && resources.keys.sort == %w[extra_mailboxes literal_threads], "variant_resources_invalid")
      boxes, threads = resources.values_at("extra_mailboxes", "literal_threads")
      Be02Acceptance.check(boxes.is_a?(Hash) && threads.is_a?(Hash) &&
        boxes.keys.sort == (variant == "multi_mailbox" ? %w[excluded secondary] : []) &&
        threads.keys.sort == (variant == "literal_read" ? %w[read_empty read_literal] : []), "variant_resources_invalid")
      ids = boxes.values + threads.values
      base = seed.fetch("actors").values.map { |actor| actor.fetch("user_id") } + seed.fetch("organizations").values +
        seed.fetch("mailboxes").values + seed.fetch("data").values_at("thread_primary", "thread_other", "draft_primary", "draft_other")
      Be02Acceptance.check(ids.all? { |id| id.is_a?(String) && UUID.match?(id) } &&
        ids.uniq.size == ids.size && (ids & base).empty?, "variant_resource_ids_invalid")
    end

    def rows(seed, resources)
      org = seed.fetch("organizations").fetch("primary")
      box = seed.fetch("mailboxes").fetch("primary")
      actors, at = seed.fetch("actors"), seed.fetch("data").fetch("ordered_at")
      result = []
      resources.fetch("extra_mailboxes").each do |name, id|
        address = "#{name}-#{id}@acceptance.test"
        result << ["app.mailboxes", { id: id, organization_id: org, address: address,
          display_name: "Acceptance #{name}", display_address: address, visibility: "private" }]
        next unless name == "secondary"
        result << ["app.mailbox_memberships", { organization_id: org, mailbox_id: id,
          user_id: actors.fetch("composer").fetch("user_id"), compose: false, approve_send: false, manage_members: false }]
      end
      resources.fetch("literal_threads").each do |name, id|
        empty = name == "read_empty"
        result << ["app.threads", { id: id, organization_id: org, mailbox_id: box, subject: empty ? nil : "", created_at: at }]
        result << ["app.messages", { organization_id: org, mailbox_id: box, thread_id: id, sender: nil,
          recipients: "[]", sent_at: empty ? nil : at, body_text: empty ? "" : LITERAL, attachment_count: 0, created_at: at }]
        next if empty
        %w[reader manager_backup].each do |actor|
          result << ["app.thread_read_states", { organization_id: org, mailbox_id: box, thread_id: id,
            user_id: actors.fetch(actor).fetch("user_id"), is_read: actor == "manager_backup", read_state_version: 1, updated_at: at }]
        end
      end
      result
    end
    private_class_method :validate_seed, :validate_resources, :rows
  end
end
