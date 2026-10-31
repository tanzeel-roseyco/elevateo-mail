# frozen_string_literal: true

require "minitest/autorun"
require "pg"
require "json"

# AIDEV-NOTE: Catalog assertions inspect the final migrated schema, including private tables and later ALTERs.
class SchemaIntegrityDatabaseTest < Minitest::Test
  SCHEMAS = %w[app app_auth app_drafts_private app_send_private app_connector_private app_meta].freeze
  EXCEPTIONS = JSON.parse(File.read(File.expand_path("../../db/schema_integrity/exceptions.json", __dir__))).freeze

  def setup
    @db = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    raise "wrong disposable database" unless @db.db == ENV.fetch("BE02_TASK_DATABASE_NAME")
  end

  def teardown
    @db&.close
  end

  def catalog(sql)
    @db.exec_params(sql, ["{#{SCHEMAS.join(',')}}"]).to_a
  end

  def test_every_owned_table_has_a_primary_key
    missing = catalog(<<~SQL)
      SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p')
      AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p')
    SQL
    assert_empty missing
  end

  def test_every_foreign_key_has_a_valid_unconditional_leading_index
    missing = catalog(<<~SQL)
      SELECT k.conrelid::regclass::text AS relation,k.conname,pg_get_constraintdef(k.oid) AS definition
      FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace
      WHERE k.contype='f' AND n.nspname=ANY($1::text[]) AND NOT EXISTS (
        SELECT 1 FROM pg_index i WHERE i.indrelid=k.conrelid AND i.indisvalid AND i.indisready
        AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts>=cardinality(k.conkey)
        AND ARRAY(SELECT key FROM unnest(i.indkey::smallint[]) WITH ORDINALITY x(key,position)
          WHERE position<=cardinality(k.conkey) ORDER BY key)=ARRAY(SELECT unnest(k.conkey) ORDER BY 1))
    SQL
    assert_empty missing
  end

  def test_no_duplicate_indexes
    duplicates = catalog(<<~SQL)
      SELECT a.indexrelid::regclass::text AS first,b.indexrelid::regclass::text AS second
      FROM pg_index a JOIN pg_index b ON a.indrelid=b.indrelid AND a.indexrelid<b.indexrelid
      JOIN pg_class t ON t.oid=a.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_class ai ON ai.oid=a.indexrelid JOIN pg_class bi ON bi.oid=b.indexrelid
      WHERE n.nspname=ANY($1::text[]) AND a.indisvalid AND b.indisvalid
      AND a.indkey=b.indkey AND a.indclass=b.indclass AND a.indcollation=b.indcollation
      AND a.indoption=b.indoption AND ai.relam=bi.relam
      AND a.indpred::text IS NOT DISTINCT FROM b.indpred::text
      AND a.indexprs::text IS NOT DISTINCT FROM b.indexprs::text
    SQL
    assert_empty duplicates
  end

  def test_no_unvalidated_constraints_or_invalid_indexes
    assert_empty catalog(<<~SQL)
      SELECT conrelid::regclass::text,conname FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace
      WHERE n.nspname=ANY($1::text[]) AND NOT convalidated
    SQL
    assert_empty catalog(<<~SQL)
      SELECT i.indexrelid::regclass::text FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[])
      AND (NOT i.indisvalid OR NOT i.indisready)
    SQL
  end

  def test_every_nonrelational_uuid_and_structured_value_has_an_explicit_exception
    candidates = catalog(<<~SQL)
      SELECT n.nspname||'.'||c.relname||'.'||a.attname AS column,
        CASE WHEN a.atttypid='uuid'::regtype THEN 'identity' ELSE 'structured' END AS rule
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_type t ON t.oid=a.atttypid
      WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
      AND (t.typname IN ('json','jsonb') OR t.typcategory='A' OR
        (t.typname='uuid' AND NOT EXISTS(SELECT 1 FROM pg_constraint k
          WHERE k.conrelid=c.oid AND (k.contype='f' OR (k.contype='p' AND cardinality(k.conkey)=1)) AND a.attnum=ANY(k.conkey))))
    SQL
    registered = EXCEPTIONS.fetch("columns").reject { |entry| entry.fetch("rule") == "derived" }
    assert_equal registered.map { |entry| entry.values_at("column", "rule") }.sort,
      candidates.map { |entry| entry.values_at("column", "rule") }.sort
    EXCEPTIONS.values.flatten.each do |entry|
      assert_operator entry.fetch("reason").length, :>, 40
      assert File.exist?(File.expand_path("../../#{entry.fetch('evidence')}", __dir__)), entry.inspect
    end
  end

  def test_no_unlisted_prefix_or_constraint_support_index_redundancy
    candidates = catalog(<<~SQL)
      SELECT DISTINCT a.indexrelid::regclass::text AS index
      FROM pg_index a JOIN pg_index b ON a.indrelid=b.indrelid AND a.indexrelid<>b.indexrelid
      JOIN pg_class t ON t.oid=a.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_class ai ON ai.oid=a.indexrelid JOIN pg_class bi ON bi.oid=b.indexrelid
      JOIN pg_am am ON am.oid=ai.relam
      WHERE n.nspname=ANY($1::text[]) AND am.amname='btree' AND ai.relam=bi.relam
      AND a.indisvalid AND b.indisvalid AND a.indpred IS NULL AND b.indpred IS NULL
      AND a.indexprs IS NULL AND b.indexprs IS NULL AND a.indnatts=a.indnkeyatts
      AND ((NOT a.indisunique AND a.indnkeyatts<=b.indnkeyatts
        AND NOT EXISTS(SELECT 1 FROM generate_series(0,a.indnkeyatts-1) p
          WHERE a.indkey[p]<>b.indkey[p] OR a.indclass[p]<>b.indclass[p]
          OR a.indcollation[p]<>b.indcollation[p]))
        OR (a.indisunique AND b.indisunique AND b.indnkeyatts<a.indnkeyatts
          AND b.indkey::smallint[] <@ a.indkey::smallint[]))
    SQL
    # AIDEV-NOTE: Sort-direction candidates require query evidence; equality prefixes permit backward scans.
    assert_equal EXCEPTIONS.fetch("indexes").map { |entry| entry.fetch("index") }.sort,
      candidates.map { |entry| entry.fetch("index") }.sort
    EXCEPTIONS.fetch("indexes").each do |entry|
      references = @db.exec_params("SELECT count(*) FROM pg_constraint WHERE contype='f' AND conindid=$1::regclass", [entry.fetch("index")])
      assert_operator references[0].fetch("count").to_i, :>, 0, entry.inspect
    end
    EXCEPTIONS.fetch("columns").select { |entry| entry.fetch("rule") == "derived" }.each do |entry|
      schema, table, column = entry.fetch("column").split(".")
      found = @db.exec_params("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3", [schema, table, column])
      assert_equal 1, found.ntuples, entry.inspect
    end
  end
end
