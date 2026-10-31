# frozen_string_literal: true

# AIDEV-NOTE: Concurrent DDL commits individually; retries must verify existing definitions, never trust a name alone.
module SchemaIntegrityConcurrentIndexes
  def ensure_index(table, name, columns, unique: false)
    schema = table.split(".").first
    existing = select_one(<<~SQL)
      SELECT pg_get_indexdef(i.indexrelid) AS definition,i.indisvalid AND i.indisready AS ready
      FROM pg_index i WHERE i.indexrelid=to_regclass(#{connection.quote("#{schema}.#{name}")})
    SQL
    expected = "CREATE #{unique ? 'UNIQUE ' : ''}INDEX #{name} ON #{table} USING btree (#{columns})"
    if existing
      raise "unexpected index definition: #{schema}.#{name}" unless index_signature(existing.fetch("definition")) == index_signature(expected)
      return if existing.fetch("ready")

      # AIDEV-NOTE: A failed concurrent build leaves an invalid index; replace only the verified task-owned definition.
      drop_index(table, name)
    end
    execute "CREATE #{unique ? 'UNIQUE ' : ''}INDEX CONCURRENTLY #{name} ON #{table}(#{columns})"
  end

  def drop_index(table, name)
    execute "DROP INDEX CONCURRENTLY IF EXISTS #{table.split('.').first}.#{name}"
  end

  private

  def index_signature(definition)
    # PostgreSQL prints text literal casts and omits redundant expression parentheses in pg_get_indexdef.
    definition.gsub("::text", "").gsub(/[\s()]/, "")
  end
end
