require_relative "boot"
require "rails"
require "active_record/railtie"
require "action_controller/railtie"
require_relative "../lib/elevateo/config"

Bundler.require(*Rails.groups)

module ElevateoServer
  class Application < Rails::Application
    config.load_defaults 8.1
    config.api_only = true
    config.eager_load = false
    config.autoload_lib(ignore: %w[tasks])
    config.active_record.schema_format = :sql
    config.active_record.dump_schemas = "app,app_meta"
    # pg_dump is absent from the runtime image; the schema-dump tool service owns db/structure.sql.
    config.active_record.dump_schema_after_migration = false
    # Migration bookkeeping lives in private app_meta so every tenant-bearing app table can FORCE RLS.
    config.active_record.schema_migrations_table_name = "app_meta.schema_migrations"
    config.active_record.internal_metadata_table_name = "app_meta.ar_internal_metadata"
    config.logger = ActiveSupport::Logger.new($stdout)
    config.log_level = :info
    config.filter_parameters += %i[password token secret key]
    config.hosts.clear
    config.secret_key_base = ENV.fetch("SECRET_KEY_BASE")
  end
end
