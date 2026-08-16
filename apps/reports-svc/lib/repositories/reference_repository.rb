# frozen_string_literal: true

require 'json'

require_relative '../db'
require_relative '../logging'
require_relative '../pg_introspect'

module Reports
  module Repositories
    # Read-only lookups of the reference tables api-core owns in Postgres
    # (`compounds`, `developers`, `areas`). Column names are discovered from the
    # catalogue, so the brochure keeps working whether Prisma maps to
    # snake_case or leaves models camelCase.
    #
    # Every method degrades to `nil` rather than failing the request — the
    # brochure already carries denormalised names from the Mongo document.
    module ReferenceRepository
      COMPOUND_TABLES  = %w[compounds Compound compound].freeze
      DEVELOPER_TABLES = %w[developers Developer developer].freeze
      AREA_TABLES      = %w[areas Area area].freeze
      AMENITY_TABLES   = %w[amenities Amenity amenity].freeze

      COMPOUND_FIELDS = {
        id: %w[id],
        slug: %w[slug],
        name: %w[name name_en nameEn],
        name_ar: %w[name_ar nameAr],
        description: %w[description description_en descriptionEn],
        delivery_year: %w[delivery_year deliveryYear],
        installment_years: %w[installment_years installmentYears],
        down_payment_percent: %w[down_payment_percent downPaymentPercent],
        starting_price: %w[starting_price startingPrice],
        max_price: %w[max_price maxPrice],
        min_area_sqm: %w[min_area_sqm minAreaSqm],
        max_area_sqm: %w[max_area_sqm maxAreaSqm],
        master_plan_url: %w[master_plan_url masterPlanUrl],
        developer_id: %w[developer_id developerId],
        area_id: %w[area_id areaId]
      }.freeze

      DEVELOPER_FIELDS = {
        id: %w[id],
        slug: %w[slug],
        name: %w[name name_en nameEn],
        name_ar: %w[name_ar nameAr],
        description: %w[description description_en descriptionEn],
        founded_year: %w[founded_year foundedYear],
        projects_count: %w[projects_count projectsCount],
        website: %w[website url],
        phone: %w[phone hotline],
        logo_url: %w[logo_url logoUrl]
      }.freeze

      AREA_FIELDS = {
        id: %w[id],
        slug: %w[slug],
        name: %w[name_en nameEn name],
        name_ar: %w[name_ar nameAr],
        city: %w[city],
        governorate: %w[governorate],
        description: %w[description description_en descriptionEn],
        avg_price_per_meter: %w[avg_price_per_meter avgPricePerMeter],
        property_count: %w[property_count propertyCount]
      }.freeze

      module_function

      def compound(id)  = fetch_row(COMPOUND_TABLES, COMPOUND_FIELDS, id)
      def developer(id) = fetch_row(DEVELOPER_TABLES, DEVELOPER_FIELDS, id)
      def area(id)      = fetch_row(AREA_TABLES, AREA_FIELDS, id)

      # slug => English display name, for the amenity slugs stored on a listing.
      # Returns {} when the table or its columns are not available.
      def amenity_names(slugs)
        list = Array(slugs).map(&:to_s).reject(&:empty?).uniq
        return {} if list.empty?

        DB.postgres do |conn|
          table = PgIntrospect.table(conn, *AMENITY_TABLES)
          return {} if table.nil?

          columns = PgIntrospect.columns(conn, table)
          slug_column = PgIntrospect.pick(columns, 'slug')
          name_column = PgIntrospect.pick(columns, 'name_en', 'nameEn', 'name')
          return {} if slug_column.nil? || name_column.nil?

          sql = "SELECT #{PgIntrospect.quote_ident(slug_column)} AS slug, " \
                "#{PgIntrospect.quote_ident(name_column)} AS name " \
                "FROM #{PgIntrospect.quote_ident(table)} " \
                "WHERE #{PgIntrospect.quote_ident(slug_column)} = ANY($1::text[])"

          conn.exec_params(sql, [pg_array(list)]).each_with_object({}) do |row, out|
            out[row['slug']] = row['name']
          end
        end
      rescue StandardError => e
        Logging.warn('reference_repository.amenities_failed', error: e.class.name, errorMessage: e.message)
        {}
      end

      # Ruby array -> Postgres `text[]` literal, escaping handled by libpq.
      def pg_array(values)
        PG::TextEncoder::Array.new.encode(values.map(&:to_s))
      end

      def fetch_row(tables, fields, id)
        return nil if id.to_s.strip.empty?

        DB.postgres do |conn|
          table = PgIntrospect.table(conn, *tables)
          return nil if table.nil?

          columns = PgIntrospect.columns(conn, table)
          id_column = PgIntrospect.pick(columns, 'id')
          return nil if id_column.nil?

          selects = fields.filter_map do |logical, candidates|
            column = PgIntrospect.pick(columns, *candidates)
            column && "t.#{PgIntrospect.quote_ident(column)} AS #{PgIntrospect.quote_ident(logical.to_s)}"
          end
          return nil if selects.empty?

          sql = "SELECT #{selects.join(', ')} FROM #{PgIntrospect.quote_ident(table)} t " \
                "WHERE t.#{PgIntrospect.quote_ident(id_column)}::text = $1 LIMIT 1"

          row = conn.exec_params(sql, [id.to_s]).first
          row && normalise(row)
        end
      rescue StandardError => e
        Logging.warn('reference_repository.lookup_failed', error: e.class.name, errorMessage: e.message)
        nil
      end

      # Bilingual `{en, ar}` columns arrive as jsonb (decoded to a Hash) or as a
      # raw JSON string depending on the pg type map — normalise both.
      def normalise(row)
        row.each_with_object({}) do |(key, value), out|
          out[key.to_sym] = decode_json(value)
        end
      end

      def decode_json(value)
        return value unless value.is_a?(String)

        stripped = value.strip
        return value unless stripped.start_with?('{') || stripped.start_with?('[')

        begin
          JSON.parse(stripped)
        rescue JSON::ParserError
          value
        end
      end

      # "{en: …, ar: …}" | "plain text" -> English text
      def english(value)
        case value
        when Hash then value['en'] || value[:en] || value.values.first
        when String then value
        end
      end
    end
  end
end
