# frozen_string_literal: true

require_relative "acceptance_variants"

module Be02Acceptance
  # AIDEV-NOTE: Run only on disposable fixture data, before browser consumption; open_snapshot returns a NEW admin connection.
  module VariantsTest
    module_function

    def run(admin:, seed:, variant:, resources:, open_snapshot:)
      reject_malformed_seeds(seed, variant, resources)
      reject_mixed_resource_keys(seed, variant, resources)
      Be02Acceptance.check(admin.transaction_status == PG::PQTRANS_IDLE, "variant_test_autocommit_required")
      observe = lambda do |candidate = resources, selected = variant|
        db = open_snapshot.call
        begin
          db.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
          value = Variants.verify(db: db, seed: seed, variant: selected, resources: candidate)
          db.exec("COMMIT")
          value
        ensure
          db.close
        end
      end
      Be02Acceptance.check(observe.call == resources, "variant_test_happy_failed")
      reject("variant_input_invalid") { observe.call(resources, nil) }
      reject("variant_input_invalid") { observe.call(resources, "unexpected") }
      reject("variant_resources_invalid") { observe.call(nil) }
      reject("variant_resources_invalid") { observe.call(resources.merge("unexpected" => {})) }
      reject("variant_readonly_snapshot_required") do
        Variants.verify(db: admin, seed: seed, variant: variant, resources: resources)
      end
      return true if variant == "base"

      key = variant == "multi_mailbox" ? "extra_mailboxes" : "literal_threads"
      ids = resources.fetch(key)
      duplicate = resources.merge(key => ids.transform_values { ids.values.first })
      reject("variant_resource_ids_invalid") { observe.call(duplicate) }
      collision = resources.merge(key => ids.merge(ids.keys.first => seed.fetch("mailboxes").fetch("primary")))
      reject("variant_resource_ids_invalid") { observe.call(collision) }
      if variant == "multi_mailbox"
        id = ids.fetch("secondary")
        original = admin.exec_params("SELECT display_name FROM app.mailboxes WHERE id=$1", [id]).getvalue(0, 0)
        begin
          admin.exec_params("UPDATE app.mailboxes SET display_name='corrupted fixture' WHERE id=$1", [id])
          reject("variant_committed_row_mismatch") { observe.call }
        ensure
          admin.exec_params("UPDATE app.mailboxes SET display_name=$2 WHERE id=$1", [id, original])
        end
        excluded = ids.fetch("excluded")
        user = seed.fetch("actors").fetch("reader").fetch("user_id")
        org = seed.fetch("organizations").fetch("primary")
        begin
          admin.exec_params("INSERT INTO app.mailbox_memberships (organization_id,mailbox_id,user_id) VALUES ($1,$2,$3)", [org, excluded, user])
          reject("variant_membership_set_mismatch") { observe.call }
        ensure
          admin.exec_params("DELETE FROM app.mailbox_memberships WHERE mailbox_id=$1 AND user_id=$2", [excluded, user])
        end
      else
        id = ids.fetch("read_literal")
        begin
          admin.exec_params("UPDATE app.messages SET body_text='' WHERE thread_id=$1", [id])
          reject("variant_committed_row_mismatch") { observe.call }
        ensure
          admin.exec_params("UPDATE app.messages SET body_text=$2 WHERE thread_id=$1", [id, Variants::LITERAL])
        end
        extra = SecureRandom.uuid
        begin
          admin.exec_params(<<~SQL, [id, extra])
            INSERT INTO app.messages (id,organization_id,mailbox_id,thread_id,sender,recipients,sent_at,body_text,attachment_count,created_at)
            SELECT $2,organization_id,mailbox_id,thread_id,sender,recipients,sent_at,body_text,attachment_count,created_at
            FROM app.messages WHERE thread_id=$1
          SQL
          reject("variant_committed_row_mismatch") { observe.call }
        ensure
          admin.exec_params("DELETE FROM app.messages WHERE id=$1", [extra])
        end
      end
      Be02Acceptance.check(observe.call == resources, "variant_test_restore_failed")
      true
    end

    def reject_malformed_seeds(seed, variant, resources)
      # AIDEV-NOTE: Any DB access raises outside validation, proving rejection precedes even transaction inspection.
      untouched_db = Object.new
      candidates = [nil, seed.merge("actors" => nil), seed.merge("data" => [])]
      %w[organizations mailboxes].each do |name|
        map = seed.fetch(name)
        candidates.concat([seed.merge(name => nil), seed.merge(name => []),
          seed.merge(name => map.reject { |key, _| key == "primary" }),
          seed.merge(name => map.reject { |key, _| key == "other" }),
          seed.merge(name => map.merge("unexpected" => SecureRandom.uuid)),
          seed.merge(name => map.merge(:unexpected => SecureRandom.uuid)),
          seed.merge(name => { :primary => map.fetch("primary"), "other" => map.fetch("other") })])
      end
      actors = seed.fetch("actors")
      candidates.concat([seed.merge("actors" => []),
        seed.merge("actors" => actors.merge("composer" => nil)),
        seed.merge("actors" => actors.merge("composer" => [])),
        seed.merge("actors" => actors.merge("composer" => {})),
        seed.merge("actors" => actors.reject { |key, _| key == "composer" }),
        seed.merge("actors" => actors.merge("unexpected" => {}))])
      candidates.each do |candidate|
        reject("variant_input_invalid") { Variants.seed(db: untouched_db, seed: candidate, variant: variant) }
        reject("variant_input_invalid") do
          Variants.verify(db: untouched_db, seed: candidate, variant: variant, resources: resources)
        end
      end
    end

    def reject_mixed_resource_keys(seed, variant, resources)
      untouched_db = Object.new
      candidates = [resources.merge(:unexpected => {})]
      %w[extra_mailboxes literal_threads].each do |name|
        # AIDEV-NOTE: Include a string key even for empty variants, so the old sort always encounters mixed types.
        map = resources.fetch(name).merge("unexpected" => SecureRandom.uuid, :unexpected => SecureRandom.uuid)
        candidates << resources.merge(name => map)
      end
      candidates.each do |candidate|
        reject("variant_resources_invalid") do
          Variants.verify(db: untouched_db, seed: seed, variant: variant, resources: candidate)
        end
      end
    end

    def reject(code)
      begin
        yield
      rescue Failure => error
        raise unless error.message == code
        return
      end
      raise Failure, "variant_test_expected_rejection"
    end
    private_class_method :reject, :reject_malformed_seeds, :reject_mixed_resource_keys
  end
end
