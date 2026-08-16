# frozen_string_literal: true

require 'digest'
require 'time'

require_relative '../config'
require_relative '../db'
require_relative '../errors'
require_relative '../finance'
require_relative '../formatting'
require_relative '../http_fetch'
require_relative '../logging'
require_relative '../pdf/brochure_document'
require_relative '../repositories/property_repository'
require_relative '../repositories/reference_repository'

module Reports
  # GET /api/reports/property/:id/brochure.pdf
  #
  # Loads the canonical Mongo listing, enriches it from the Postgres reference
  # tables, builds the developer payment plan with Reports::Finance and renders
  # the A4 PDF. Rendered bytes are cached in Redis for 10 minutes under the
  # CONTRACT §2 `cache:prop:{id}` namespace.
  module Brochure
    CACHE_SUFFIX = 'brochure:v1'

    Result = Struct.new(:bytes, :filename, :etag, :property_id, :cached, keyword_init: true)

    module_function

    def generate(identifier, refresh: false)
      property = Repositories::PropertyRepository.find(identifier)
      raise Errors::PropertyNotFoundError.new("No property matches '#{identifier}'.") if property.nil?

      property_id = canonical_id(property)
      key = cache_key(property_id)
      DB.delete_cache(key) if refresh

      cached = true
      bytes = DB.cache_bytes(key, Config.brochure_cache_ttl) do
        cached = false
        render(property)
      end

      Result.new(
        bytes: bytes,
        filename: filename(property),
        etag: Digest::SHA256.hexdigest(bytes)[0, 32],
        property_id: property_id,
        cached: cached
      )
    end

    def render(property)
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      bytes = Pdf::BrochureDocument.new(view_model(property)).render
      Logging.info('brochure.rendered',
                   propertyId: canonical_id(property),
                   bytes: bytes.bytesize,
                   durationMs: ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(2))
      bytes
    end

    def cache_key(property_id)
      "cache:prop:#{property_id}:#{CACHE_SUFFIX}"
    end

    def canonical_id(property)
      property['id'] || property['_id'].to_s
    end

    def filename(property)
      slug = Formatting.slugify(property['slug'] || dig(property, 'title', 'en'), fallback: 'property')
      reference = Formatting.slugify(property['referenceNo'], fallback: 'listing')
      "nawy-#{slug}-#{reference}.pdf"
    end

    def listing_url(property)
      "#{Config.frontend_url}/properties/#{property['slug']}"
    end

    # =======================================================================
    # View model
    # =======================================================================
    def view_model(property)
      specs   = property['specs'] || {}
      price   = property['price'] || {}
      plan    = property['paymentPlan'] || {}
      loc     = property['location'] || {}
      compound = property['compound'] || {}
      developer = property['developer'] || {}
      now = Time.now.utc

      compound_row  = Repositories::ReferenceRepository.compound(compound['id'])
      developer_row = Repositories::ReferenceRepository.developer(developer['id'])
      area_row      = Repositories::ReferenceRepository.area(loc['areaId'])

      {
        reference_no: property['referenceNo'],
        title: dig(property, 'title', 'en') || property['slug'],
        property_type: Formatting.humanize(property['propertyType']),
        sale_type: Formatting.humanize(property['saleType']),
        status: Formatting.humanize(property['status']),
        location_line: location_line(loc, compound),
        price_label: Formatting.egp(price['amount']),
        price_per_meter_label: Formatting.per_meter(price['pricePerMeter'] || derived_price_per_meter(price, specs)),
        payment_headline: payment_headline(plan, price),
        hero_image_io: hero_image(property),
        specs: spec_rows(property, specs, plan),
        amenities: amenity_labels(property['amenities']),
        payment_plan: payment_plan_block(price, plan),
        about_blocks: about_blocks(property, compound, compound_row, developer, developer_row, area_row),
        address_line: address_line(loc, area_row),
        coordinates_line: coordinates_line(loc),
        listing_url: listing_url(property),
        generated_on: Formatting.long_date(now),
        generated_at_label: now.strftime('%d %b %Y %H:%M UTC'),
        footer_disclaimer: 'Figures are indicative and generated from the current listing data. ' \
                           'They are not a contractual offer; confirm prices, availability and ' \
                           'payment terms with a Nawy consultant before signing.'
      }
    end

    def hero_image(property)
      images = dig(property, 'media', 'images') || []
      primary = images.find { |image| image['isPrimary'] } || images.min_by { |image| image['order'].to_i }
      return nil if primary.nil?

      url = primary['url']
      url = "#{Config.s3_public_base_url}/#{primary['key']}" if url.to_s.empty? && primary['key'] &&
                                                                !Config.s3_public_base_url.empty?
      return nil if url.to_s.empty?

      HttpFetch.image(url)
    end

    def location_line(loc, compound)
      [compound['name'], loc['areaName'], loc['city']].compact.reject(&:empty?).uniq.join(', ')
    end

    def address_line(loc, area_row)
      parts = [loc['address'], loc['areaName'], loc['city'], loc['governorate']].compact
      parts << "Governorate benchmark: #{Formatting.per_meter(area_row[:avg_price_per_meter])}" if
        area_row && area_row[:avg_price_per_meter]
      parts.reject { |part| part.to_s.strip.empty? }.join(' · ')
    end

    def coordinates_line(loc)
      coordinates = dig(loc, 'geo', 'coordinates')
      return 'Coordinates unavailable' unless coordinates.is_a?(Array) && coordinates.length == 2

      lng, lat = coordinates
      format('Coordinates: %.6f, %.6f (lat, lng)', lat.to_f, lng.to_f)
    end

    def derived_price_per_meter(price, specs)
      area = specs['areaSqm'].to_f
      return 0 if area.zero?

      (price['amount'].to_f / area).round
    end

    def payment_headline(plan, price)
      down_percent = plan['downPaymentPercent']
      years = plan['installmentYears']
      return 'Cash purchase' if down_percent.nil? || years.nil? || years.to_i.zero?

      down_amount = (price['amount'].to_f * down_percent.to_f / 100).round
      "#{Formatting.percent(down_percent)} down (#{Formatting.egp(down_amount)}) over #{years.to_i} years"
    end

    def spec_rows(property, specs, plan)
      rows = [
        ['Property type', Formatting.humanize(property['propertyType'])],
        ['Sale type', Formatting.humanize(property['saleType'])],
        ['Bedrooms', specs['bedrooms']&.to_s || '—'],
        ['Bathrooms', specs['bathrooms']&.to_s || '—'],
        ['Built-up area', Formatting.area(specs['areaSqm'])],
        ['Garden area', specs['gardenSqm'].to_i.positive? ? Formatting.area(specs['gardenSqm']) : '—'],
        ['Floor', specs['floor'].nil? ? '—' : specs['floor'].to_s],
        ['Parking', specs['parkingSpots'].nil? ? '—' : specs['parkingSpots'].to_s],
        ['Finishing', Formatting.humanize(property['finishing'])],
        ['Status', Formatting.humanize(property['status'])],
        ['Delivery', Formatting.quarter(plan['deliveryDate'])],
        ['Reference', property['referenceNo'].to_s]
      ]
      rows
    end

    def amenity_labels(slugs)
      list = Array(slugs).map(&:to_s).reject(&:empty?)
      return [] if list.empty?

      names = Repositories::ReferenceRepository.amenity_names(list)
      list.map { |slug| names[slug] || Formatting.humanize(slug) }
    end

    # --- payment plan -------------------------------------------------------
    def payment_plan_block(price, plan)
      amount = price['amount']
      return nil if amount.nil?

      down_percent = plan['downPaymentPercent'] || 10
      years = (plan['installmentYears'] || 0).to_i
      return cash_plan_block(price) if years <= 0

      schedule = Finance.installment_schedule(
        price: amount,
        down_payment_percent: down_percent,
        years: years,
        delivery_date: plan['deliveryDate'],
        frequency: Finance::DEFAULT_FREQUENCY,
        maintenance_percent: Config.maintenance_percent
      )
      summary = schedule[:summary]

      {
        summary_rows: [
          ['Unit price', Formatting.egp(summary[:price])],
          ["Down payment (#{Formatting.percent(schedule[:input][:down_payment_percent])})",
           Formatting.egp(summary[:down_payment])],
          ['Balance financed by the developer', Formatting.egp(summary[:remaining])],
          ['Instalment plan',
           "#{summary[:installments_count]} quarterly instalments over #{years} years"],
          ['Quarterly instalment', Formatting.egp_precise(summary[:installment_amount])],
          ['Monthly equivalent', Formatting.egp_precise(summary[:monthly_equivalent])],
          ["Maintenance deposit (#{Formatting.percent(summary[:maintenance_percent])}) on delivery",
           Formatting.egp(summary[:maintenance_deposit])],
          ['Delivery', Formatting.quarter(plan['deliveryDate'])],
          ['Total cash out', Formatting.egp(summary[:total_paid])]
        ],
        cash_flow_rows: schedule[:yearly].map do |year|
          [year[:year].to_s, year[:payments].to_s, Formatting.egp(year[:paid]),
           "#{year[:cumulative_percent]}%"]
        end,
        disclaimer: 'Instalments are equal quarterly payments starting from the contract date, ' \
                    'the standard structure for Egyptian primary sales. The maintenance deposit ' \
                    'is charged on handover and is not part of the unit price.'
      }
    end

    def cash_plan_block(price)
      {
        summary_rows: [
          ['Unit price', Formatting.egp(price['amount'])],
          ['Payment', 'Cash / resale — no developer instalment plan on this unit']
        ],
        cash_flow_rows: [],
        disclaimer: 'This unit is listed for cash settlement; mortgage options can be modelled ' \
                    'with POST /api/reports/mortgage/calculate.'
      }
    end

    # --- narrative ----------------------------------------------------------
    def about_blocks(property, compound, compound_row, developer, developer_row, area_row)
      blocks = []

      description = dig(property, 'description', 'en')
      if description && !description.to_s.strip.empty?
        blocks << { title: 'About this unit', body: Formatting.truncate(description, 900), meta: nil }
      end

      compound_text = Repositories::ReferenceRepository.english(compound_row && compound_row[:description])
      if compound['name'] || compound_text
        blocks << {
          title: "The compound — #{compound['name']}",
          body: compound_text || "#{compound['name']} is a gated community developed by #{developer['name']}.",
          meta: compound_meta(compound_row)
        }
      end

      developer_text = Repositories::ReferenceRepository.english(developer_row && developer_row[:description])
      if developer['name'] || developer_text
        blocks << {
          title: "The developer — #{developer['name']}",
          body: developer_text || "#{developer['name']} is one of the developers listed on Nawy.",
          meta: developer_meta(developer_row)
        }
      end

      area_text = Repositories::ReferenceRepository.english(area_row && area_row[:description])
      if area_text
        blocks << {
          title: "The area — #{area_row[:name]}",
          body: Formatting.truncate(area_text, 700),
          meta: nil
        }
      end

      blocks.each { |block| block[:body] = Formatting.truncate(block[:body].to_s, 900) }
      blocks
    end

    def compound_meta(row)
      return nil if row.nil?

      parts = []
      parts << "Delivery from #{row[:delivery_year]}" if row[:delivery_year]
      parts << "#{row[:installment_years]}-year plans" if row[:installment_years]
      parts << "from #{Formatting.egp(row[:starting_price])}" if row[:starting_price]
      parts.empty? ? nil : parts.join('  ·  ')
    end

    def developer_meta(row)
      return nil if row.nil?

      parts = []
      parts << "Founded #{row[:founded_year]}" if row[:founded_year]
      parts << "#{row[:projects_count]} projects on Nawy" if row[:projects_count]
      parts << row[:website] if row[:website]
      parts.empty? ? nil : parts.join('  ·  ')
    end

    def dig(hash, *path)
      path.reduce(hash) do |memo, key|
        break nil unless memo.is_a?(Hash)

        memo[key]
      end
    end
  end
end
