# frozen_string_literal: true

require 'set'

require_relative 'errors'
require_relative 'logging'

module Reports
  # Postgres is owned by api-core (Prisma). Prisma may or may not `@@map` its
  # models to snake_case, so instead of guessing we ask the catalogue once and
  # cache the answer for the life of the process.
  #
  #   table   = PgIntrospect.table(conn, 'leads', 'Lead')
  #   columns = PgIntrospect.columns(conn, table)
  #   created = PgIntrospect.pick(columns, 'created_at', 'createdAt')
  module PgIntrospect
    TABLE_SQL = <<~SQL
      SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = ANY (ARRAY['r','v','m','p','f'])
         AND n.nspname = ANY (current_schemas(false))
         AND c.relname = $1
       LIMIT 1
    SQL

    COLUMN_SQL = <<~SQL
      SELECT a.attname
        FROM pg_attribute a
        JOIN pg_class c     ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relname = $1
         AND n.nspname = ANY (current_schemas(false))
         AND a.attnum > 0
         AND NOT a.attisdropped
    SQL

    MUTEX = Mutex.new

    class << self
      def cache
        @cache ||= { tables: {}, columns: {} }
      end

      def reset!
        MUTEX.synchronize { @cache = { tables: {}, columns: {} } }
      end

      # First candidate that actually exists, or nil.
      def table(conn, *candidates)
        key = candidates.join('|')
        cached = cache[:tables]
        return cached[key] if cached.key?(key)

        found = candidates.flatten.find do |candidate|
          conn.exec_params(TABLE_SQL, [candidate]).ntuples.positive?
        end

        MUTEX.synchronize { cache[:tables][key] = found }
        Logging.warn('pg_introspect.table_missing', candidates: candidates.flatten) if found.nil?
        found
      end

      def table!(conn, *candidates)
        table(conn, *candidates) ||
          raise(Errors::DependencyError.new(
                  "Expected table #{candidates.flatten.join(' / ')} is not present in the database. " \
                  'Has api-core run its migrations?'
                ))
      end

      def columns(conn, table_name)
        return Set.new if table_name.nil?

        cached = cache[:columns]
        return cached[table_name] if cached.key?(table_name)

        set = conn.exec_params(COLUMN_SQL, [table_name]).map { |row| row['attname'] }.to_set
        MUTEX.synchronize { cache[:columns][table_name] = set }
        set
      end

      # First candidate column present on the table, or nil.
      def pick(columns, *candidates)
        candidates.flatten.find { |candidate| columns.include?(candidate) }
      end

      def quote_ident(name)
        %("#{name.to_s.gsub('"', '""')}")
      end

      # "t"."created_at" AS "created_at"
      def select_alias(prefix, column, alias_name)
        return "NULL AS #{quote_ident(alias_name)}" if column.nil?

        "#{prefix}.#{quote_ident(column)} AS #{quote_ident(alias_name)}"
      end
    end
  end
end
