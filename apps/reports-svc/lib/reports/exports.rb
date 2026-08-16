# frozen_string_literal: true

require 'csv'
require 'time'

require_relative '../config'
require_relative '../formatting'
require_relative '../logging'
require_relative '../repositories/lead_repository'
require_relative '../repositories/property_repository'

module Reports
  # Admin CSV exports (CONTRACT §6):
  #   GET /api/reports/admin/export/leads.csv
  #   GET /api/reports/admin/export/properties.csv
  #
  # Both stream: rows are written to the client as they are read from the
  # database instead of being buffered into one giant string. Every file starts
  # with a UTF-8 BOM so Excel renders the Arabic columns correctly.
  module Exports
    BOM = "\xEF\xBB\xBF"
    CSV_CONTENT_TYPE = 'text/csv; charset=utf-8'

    LEAD_HEADERS = [
      'Lead ID', 'Name', 'Email', 'Phone', 'Status', 'Source', 'Message',
      'Property ID', 'Property Slug', 'Property Area ID', 'Property Price Min',
      'Property Status', 'User ID', 'Agent ID', 'Created At', 'Updated At'
    ].freeze

    PROPERTY_HEADERS = [
      'Property ID', 'Mongo ID', 'Reference No', 'Slug', 'Title (EN)', 'Title (AR)',
      'Property Type', 'Sale Type', 'Status', 'Finishing', 'Price (EGP)', 'Currency',
      'Price Per Meter (EGP)', 'Down Payment %', 'Installment Years',
      'Monthly Installment (EGP)', 'Delivery Date', 'Bedrooms', 'Bathrooms',
      'Area (sqm)', 'Garden (sqm)', 'Floor', 'Parking Spots', 'Area ID', 'Area Name',
      'City', 'Governorate', 'Address', 'Latitude', 'Longitude', 'Compound ID',
      'Compound Name', 'Developer ID', 'Developer Name', 'Amenities', 'Featured',
      'Views', 'Favorites', 'Leads', 'Published At', 'Created At', 'Updated At', 'Listing URL'
    ].freeze

    module_function

    def leads_filename(filters)
      "nawy-leads-#{filename_suffix(filters)}.csv"
    end

    def properties_filename(filters)
      "nawy-properties-#{filename_suffix(filters)}.csv"
    end

    def filename_suffix(filters)
      parts = []
      parts << Formatting.short_date(filters[:from]) if filters[:from]
      parts << Formatting.short_date(filters[:to]) if filters[:to]
      parts << Formatting.slugify(filters[:status], fallback: 'status') if filters[:status]
      parts << 'area' if filters[:area_id]
      parts << Time.now.utc.strftime('%Y%m%d-%H%M%S')
      parts.join('-')
    end

    # --- leads --------------------------------------------------------------

    # Yields UTF-8 chunks to the block (a Sinatra stream).
    def stream_leads(filters, out)
      out << BOM
      out << CSV.generate_line(LEAD_HEADERS)

      rows = Repositories::LeadRepository.each(
        filters,
        batch_size: Config.export_batch_size,
        max_rows: Config.export_max_rows
      ) do |row|
        out << CSV.generate_line(lead_row(row))
      end

      Logging.info('export.leads', rows: rows, filters: loggable(filters))
      rows
    rescue StandardError => e
      # The status line is already on the wire; the best we can do is mark the
      # file as incomplete and log loudly.
      Logging.exception('export.leads_failed', e, filters: loggable(filters))
      out << CSV.generate_line(["# export interrupted: #{e.class.name}"])
      raise
    end

    def lead_row(row)
      [
        row['id'],
        row['name'],
        row['email'],
        row['phone'],
        row['status'],
        row['source'],
        single_line(row['message']),
        row['property_id'],
        row['property_slug'],
        row['property_area_id'],
        row['property_price_min'],
        row['property_status'],
        row['user_id'],
        row['agent_id'],
        Formatting.iso_time(row['created_at']),
        Formatting.iso_time(row['updated_at'])
      ]
    end

    # --- properties ---------------------------------------------------------

    def stream_properties(filters, out)
      out << BOM
      out << CSV.generate_line(PROPERTY_HEADERS)

      rows = Repositories::PropertyRepository.each_for_export(
        filters,
        batch_size: Config.export_batch_size,
        limit: Config.export_max_rows
      ) do |doc|
        out << CSV.generate_line(property_row(doc))
      end

      Logging.info('export.properties', rows: rows, filters: loggable(filters))
      rows
    rescue StandardError => e
      Logging.exception('export.properties_failed', e, filters: loggable(filters))
      out << CSV.generate_line(["# export interrupted: #{e.class.name}"])
      raise
    end

    def property_row(doc)
      price = doc['price'] || {}
      plan  = doc['paymentPlan'] || {}
      specs = doc['specs'] || {}
      loc   = doc['location'] || {}
      geo   = (loc['geo'] || {})['coordinates']
      compound  = doc['compound'] || {}
      developer = doc['developer'] || {}
      stats = doc['stats'] || {}
      title = doc['title'] || {}

      [
        doc['id'] || doc['_id'].to_s,
        doc['mongoId'] || doc['_id'].to_s,
        doc['referenceNo'],
        doc['slug'],
        single_line(title['en']),
        single_line(title['ar']),
        doc['propertyType'],
        doc['saleType'],
        doc['status'],
        doc['finishing'],
        price['amount'],
        price['currency'] || 'EGP',
        price['pricePerMeter'],
        plan['downPaymentPercent'],
        plan['installmentYears'],
        plan['monthlyInstallment'],
        Formatting.short_date(plan['deliveryDate']),
        specs['bedrooms'],
        specs['bathrooms'],
        specs['areaSqm'],
        specs['gardenSqm'],
        specs['floor'],
        specs['parkingSpots'],
        loc['areaId'],
        loc['areaName'],
        loc['city'],
        loc['governorate'],
        single_line(loc['address']),
        geo.is_a?(Array) ? geo[1] : nil,
        geo.is_a?(Array) ? geo[0] : nil,
        compound['id'],
        compound['name'],
        developer['id'],
        developer['name'],
        Array(doc['amenities']).join('|'),
        doc['isFeatured'] ? 'yes' : 'no',
        stats['views'],
        stats['favorites'],
        stats['leads'],
        Formatting.iso_time(doc['publishedAt']),
        Formatting.iso_time(doc['createdAt']),
        Formatting.iso_time(doc['updatedAt']),
        "#{Config.frontend_url}/properties/#{doc['slug']}"
      ]
    end

    # --- helpers ------------------------------------------------------------

    def single_line(value)
      return nil if value.nil?

      value.to_s.gsub(/[\r\n]+/, ' ').strip
    end

    def loggable(filters)
      filters.transform_values { |value| value.is_a?(Time) ? value.utc.iso8601 : value }.compact
    end
  end
end
