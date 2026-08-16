# frozen_string_literal: true

require 'digest'
require 'time'

require_relative '../config'
require_relative '../db'
require_relative '../logging'
require_relative '../repositories/property_repository'
require_relative '../repositories/reference_repository'

module Reports
  # GET /api/reports/market/summary?areaId=&from=&to=
  #
  # Aggregates the canonical Mongo listing documents into an area market
  # snapshot: price distribution, price per m², supply trend by month, the mix
  # by property type / finishing / status, the leading compounds and developers,
  # and the average developer payment terms. Cached in Redis for 5 minutes.
  module MarketReport
    CACHE_NAMESPACE = 'cache:list'
    TOP_N = 10

    module_function

    # @return [Hash] normalised, JSON-ready payload (string keys)
    def summary(area_id: nil, from: nil, to: nil, refresh: false)
      key = cache_key(area_id, from, to)
      DB.delete_cache(key) if refresh

      DB.cache(key, Config.market_cache_ttl) do
        build(area_id: area_id, from: from, to: to)
      end
    end

    def cache_key(area_id, from, to)
      DB.cache_key(CACHE_NAMESPACE, 'market:summary', area_id, from&.utc&.iso8601, to&.utc&.iso8601)
    end

    def build(area_id: nil, from: nil, to: nil)
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      facets = Repositories::PropertyRepository.market_facets(area_id: area_id, from: from, to: to,
                                                              top: TOP_N)
      overall = first_of(facets, 'overall') || {}
      total = overall['count'].to_i
      fallback = first_of(facets, 'prices')

      payload = {
        generated_at: Time.now.utc,
        currency: 'EGP',
        filters: {
          area_id: area_id,
          from: from&.utc,
          to: to&.utc
        },
        area: area_block(facets, area_id),
        totals: {
          listings: total,
          featured: overall['featured'].to_i,
          compounds: bucket_count(facets, 'topCompounds'),
          developers: bucket_count(facets, 'topDevelopers'),
          areas: bucket_count(facets, 'byArea')
        },
        price: {
          avg: money(overall['avgPrice']),
          median: money(overall['medianPrice'] || median_of(fallback, 'prices')),
          min: money(overall['minPrice']),
          max: money(overall['maxPrice']),
          avg_per_meter: money(overall['avgPricePerMeter']),
          median_per_meter: money(overall['medianPricePerMeter'] || median_of(fallback, 'pricesPerMeter')),
          min_per_meter: money(overall['minPricePerMeter']),
          max_per_meter: money(overall['maxPricePerMeter'])
        },
        area_sqm: {
          avg: rounded(overall['avgAreaSqm'], 1),
          min: rounded(overall['minAreaSqm'], 0),
          max: rounded(overall['maxAreaSqm'], 0),
          avg_bedrooms: rounded(overall['avgBedrooms'], 1)
        },
        payment_terms: {
          avg_down_payment_percent: rounded(overall['avgDownPaymentPercent'], 1),
          avg_installment_years: rounded(overall['avgInstallmentYears'], 1),
          avg_monthly_installment: money(overall['avgMonthlyInstallment'])
        },
        by_property_type: buckets(facets, 'byPropertyType', total, key: :property_type),
        by_finishing: buckets(facets, 'byFinishing', total, key: :finishing),
        by_sale_type: buckets(facets, 'bySaleType', total, key: :sale_type),
        by_status: buckets(facets, 'byStatus', total, key: :status),
        by_bedrooms: bedroom_buckets(facets, total),
        by_area: area_buckets(facets, total),
        supply_trend: supply_trend(facets),
        top_compounds: top_compounds(facets),
        top_developers: top_developers(facets),
        top_amenities: amenity_buckets(facets, total)
      }

      Logging.info('market_report.built', areaId: area_id, listings: total,
                                          durationMs: elapsed_ms(started))
      payload
    end

    # --- shaping ------------------------------------------------------------

    # Only meaningful when the report is scoped to one area; a market-wide
    # report describes every area through `by_area` instead.
    def area_block(facets, area_id)
      return nil if area_id.nil?

      meta = first_of(facets, 'areaMeta')
      return nil if meta.nil?

      {
        id: area_id,
        name: meta['name'],
        city: meta['city'],
        governorate: meta['governorate'],
        listings: meta['count'].to_i
      }
    end

    def buckets(facets, name, total, key:)
      Array(facets[name]).map do |bucket|
        {
          key => bucket['_id'],
          count: bucket['count'].to_i,
          share: share(bucket['count'], total),
          avg_price: money(bucket['avgPrice']),
          min_price: money(bucket['minPrice']),
          max_price: money(bucket['maxPrice']),
          avg_price_per_meter: money(bucket['avgPricePerMeter']),
          avg_area_sqm: rounded(bucket['avgAreaSqm'], 1)
        }
      end
    end

    def bedroom_buckets(facets, total)
      Array(facets['byBedrooms']).map do |bucket|
        {
          bedrooms: bucket['_id'].to_i,
          count: bucket['count'].to_i,
          share: share(bucket['count'], total),
          avg_price: money(bucket['avgPrice'])
        }
      end
    end

    def area_buckets(facets, total)
      Array(facets['byArea']).map do |bucket|
        {
          area_id: bucket['_id'],
          name: bucket['name'],
          city: bucket['city'],
          count: bucket['count'].to_i,
          share: share(bucket['count'], total),
          avg_price: money(bucket['avgPrice']),
          avg_price_per_meter: money(bucket['avgPricePerMeter'])
        }
      end
    end

    def supply_trend(facets)
      Array(facets['supplyTrend']).map do |bucket|
        {
          month: bucket['_id'],
          count: bucket['count'].to_i,
          avg_price: money(bucket['avgPrice']),
          avg_price_per_meter: money(bucket['avgPricePerMeter'])
        }
      end
    end

    def top_compounds(facets)
      Array(facets['topCompounds']).map do |bucket|
        {
          id: bucket['_id'],
          name: bucket['name'],
          slug: bucket['slug'],
          developer: bucket['developerName'],
          listings: bucket['count'].to_i,
          avg_price: money(bucket['avgPrice']),
          min_price: money(bucket['minPrice']),
          max_price: money(bucket['maxPrice']),
          avg_price_per_meter: money(bucket['avgPricePerMeter'])
        }
      end
    end

    def top_developers(facets)
      Array(facets['topDevelopers']).map do |bucket|
        {
          id: bucket['_id'],
          name: bucket['name'],
          slug: bucket['slug'],
          listings: bucket['count'].to_i,
          compounds: Array(bucket['compounds']).compact.uniq.length,
          avg_price: money(bucket['avgPrice']),
          avg_price_per_meter: money(bucket['avgPricePerMeter'])
        }
      end
    end

    def amenity_buckets(facets, total)
      Array(facets['topAmenities']).map do |bucket|
        {
          amenity: bucket['_id'],
          count: bucket['count'].to_i,
          share: share(bucket['count'], total)
        }
      end
    end

    # --- numeric helpers ----------------------------------------------------

    def first_of(facets, name)
      Array(facets[name]).first
    end

    def bucket_count(facets, name)
      Array(facets[name]).length
    end

    def money(value)
      return nil if value.nil?

      value.to_f.round(2)
    end

    def rounded(value, digits)
      return nil if value.nil?

      digits.zero? ? value.to_f.round : value.to_f.round(digits)
    end

    def share(count, total)
      return 0.0 if total.to_i.zero?

      ((count.to_f / total) * 100).round(2)
    end

    # Exact median for the MongoDB < 7 fallback path.
    def median_of(bucket, field)
      values = Array(bucket && bucket[field]).compact.map(&:to_f).sort
      return nil if values.empty?

      middle = values.length / 2
      values.length.odd? ? values[middle] : ((values[middle - 1] + values[middle]) / 2.0)
    end

    def elapsed_ms(started)
      ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(2)
    end
  end
end
