# frozen_string_literal: true

require 'time'

require_relative '../db'
require_relative '../errors'
require_relative '../logging'
require_relative '../pg_introspect'

module Reports
  module Repositories
    # Read-only access to the `leads` table api-core owns in Postgres.
    # Column names are resolved from the catalogue (see PgIntrospect) so the
    # export survives either Prisma naming convention.
    module LeadRepository
      TABLES = %w[leads Lead lead].freeze
      PROPERTY_INDEX_TABLES = %w[property_index PropertyIndex property_indexes propertyIndex].freeze

      # logical name => candidate column names, in priority order
      FIELDS = {
        'id' => %w[id],
        'name' => %w[name full_name fullName],
        'email' => %w[email],
        'phone' => %w[phone phone_number phoneNumber],
        'status' => %w[status lead_status leadStatus],
        'source' => %w[source channel],
        'message' => %w[message notes note comment],
        'property_id' => %w[property_id propertyId],
        'user_id' => %w[user_id userId],
        'agent_id' => %w[agent_id agentId assigned_to assignedTo],
        'created_at' => %w[created_at createdAt],
        'updated_at' => %w[updated_at updatedAt]
      }.freeze

      PROPERTY_FIELDS = {
        'property_slug' => %w[slug],
        'property_area_id' => %w[area_id areaId],
        'property_price_min' => %w[price_min priceMin],
        'property_status' => %w[status]
      }.freeze

      # Column order of the generated CSV.
      EXPORT_HEADERS = %w[
        id name email phone status source message property_id property_slug
        property_area_id property_price_min property_status user_id agent_id
        created_at updated_at
      ].freeze

      Query = Struct.new(:sql, :params, :order_sql, keyword_init: true)

      module_function

      # Streams rows (Hash keyed by the logical names above) in batches.
      # @return [Integer] number of rows yielded
      def each(filters = {}, batch_size: 500, max_rows: nil)
        emitted = 0

        DB.postgres do |conn|
          query = build_query(conn, filters)
          offset = 0

          loop do
            limit = batch_size
            limit = [limit, max_rows - emitted].min if max_rows
            break if limit <= 0

            params = query.params + [limit, offset]
            sql = "#{query.sql} #{query.order_sql} LIMIT $#{params.length - 1} OFFSET $#{params.length}"
            result = conn.exec_params(sql, params)

            result.each do |row|
              emitted += 1
              yield row
            end

            break if result.ntuples < limit

            offset += result.ntuples
          end
        end

        emitted
      end

      def count(filters = {})
        DB.postgres do |conn|
          query = build_query(conn, filters, count_only: true)
          conn.exec_params(query.sql, query.params).first['count'].to_i
        end
      end

      # --- SQL assembly -------------------------------------------------------

      def build_query(conn, filters, count_only: false)
        table = PgIntrospect.table!(conn, *TABLES)
        columns = PgIntrospect.columns(conn, table)

        resolved = FIELDS.each_with_object({}) do |(logical, candidates), out|
          out[logical] = PgIntrospect.pick(columns, *candidates)
        end

        property_table, property_columns = resolve_property_index(conn, resolved['property_id'])
        wheres = []
        params = []

        created_column = resolved['created_at']
        if filters[:from]
          if created_column.nil?
            raise Errors::ValidationError.field('from', 'is not supported: leads have no created_at column')
          end

          params << filters[:from].utc.iso8601
          wheres << "l.#{PgIntrospect.quote_ident(created_column)} >= $#{params.length}"
        end

        if filters[:to]
          if created_column.nil?
            raise Errors::ValidationError.field('to', 'is not supported: leads have no created_at column')
          end

          params << filters[:to].utc.iso8601
          wheres << "l.#{PgIntrospect.quote_ident(created_column)} <= $#{params.length}"
        end

        if filters[:status]
          status_column = resolved['status']
          raise Errors::ValidationError.field('status', 'is not supported by this schema') if status_column.nil?

          params << filters[:status]
          wheres << "l.#{PgIntrospect.quote_ident(status_column)}::text = $#{params.length}"
        end

        if filters[:area_id]
          area_column = property_columns && PgIntrospect.pick(property_columns, 'area_id', 'areaId')
          if area_column.nil?
            raise Errors::ValidationError.field(
              'areaId', 'is not supported: leads cannot be joined to property_index in this schema'
            )
          end

          params << filters[:area_id]
          wheres << "p.#{PgIntrospect.quote_ident(area_column)}::text = $#{params.length}"
        end

        if filters[:property_id]
          property_column = resolved['property_id']
          raise Errors::ValidationError.field('propertyId', 'is not supported by this schema') if property_column.nil?

          params << filters[:property_id]
          wheres << "l.#{PgIntrospect.quote_ident(property_column)}::text = $#{params.length}"
        end

        join_sql = build_join(property_table, property_columns, resolved['property_id'])
        where_sql = wheres.empty? ? '' : " WHERE #{wheres.join(' AND ')}"

        select_sql =
          if count_only
            'COUNT(*) AS count'
          else
            build_select(resolved, property_columns)
          end

        sql = "SELECT #{select_sql} FROM #{PgIntrospect.quote_ident(table)} l#{join_sql}#{where_sql}"

        order_sql =
          if created_column
            "ORDER BY l.#{PgIntrospect.quote_ident(created_column)} ASC, " \
              "l.#{PgIntrospect.quote_ident(resolved['id'] || created_column)} ASC"
          else
            "ORDER BY l.#{PgIntrospect.quote_ident(resolved['id'] || 'id')} ASC"
          end

        Query.new(sql: sql, params: params, order_sql: order_sql)
      end

      def build_select(resolved, property_columns)
        lead_selects = FIELDS.keys.map do |logical|
          column = resolved[logical]
          if column
            "l.#{PgIntrospect.quote_ident(column)} AS #{PgIntrospect.quote_ident(logical)}"
          else
            "NULL AS #{PgIntrospect.quote_ident(logical)}"
          end
        end

        property_selects = PROPERTY_FIELDS.map do |logical, candidates|
          column = property_columns && PgIntrospect.pick(property_columns, *candidates)
          if column
            "p.#{PgIntrospect.quote_ident(column)} AS #{PgIntrospect.quote_ident(logical)}"
          else
            "NULL AS #{PgIntrospect.quote_ident(logical)}"
          end
        end

        (lead_selects + property_selects).join(', ')
      end

      def build_join(property_table, property_columns, lead_property_column)
        return '' if property_table.nil? || property_columns.nil? || lead_property_column.nil?

        id_column = PgIntrospect.pick(property_columns, 'id')
        return '' if id_column.nil?

        " LEFT JOIN #{PgIntrospect.quote_ident(property_table)} p " \
          "ON p.#{PgIntrospect.quote_ident(id_column)}::text = " \
          "l.#{PgIntrospect.quote_ident(lead_property_column)}::text"
      end

      def resolve_property_index(conn, lead_property_column)
        return [nil, nil] if lead_property_column.nil?

        table = PgIntrospect.table(conn, *PROPERTY_INDEX_TABLES)
        return [nil, nil] if table.nil?

        [table, PgIntrospect.columns(conn, table)]
      rescue StandardError => e
        Logging.warn('lead_repository.property_index_unavailable', error: e.class.name,
                                                                   errorMessage: e.message)
        [nil, nil]
      end
    end
  end
end
