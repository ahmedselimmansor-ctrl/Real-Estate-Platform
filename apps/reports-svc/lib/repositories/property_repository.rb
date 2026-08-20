# frozen_string_literal: true

require 'bson'

require_relative '../db'
require_relative '../logging'

module Reports
  module Repositories
    # Read-only access to the canonical Mongo `properties` documents
    # (CONTRACT §2: "the canonical property document lives in Mongo";
    # reports-svc never writes business data).
    module PropertyRepository
      COLLECTION = :properties

      # api-core inserts seed docs with `_id: ObjectId(mongoId)` while the seed
      # files also carry a UUID `id`. Timestamps may land as BSON dates or as
      # ISO strings depending on the Mongoose schema, so every date comparison
      # goes through `$convert`.
      DATE_FIELD = '$publishedAt'
      DATE_ALIAS = '_publishedAtDate'

      module_function

      def collection
        DB.mongo[COLLECTION]
      end

      # --- single document ---------------------------------------------------

      # Accepts a UUID, a Mongo ObjectId, a slug or a reference number.
      def find(identifier)
        value = identifier.to_s.strip
        return nil if value.empty?

        clauses = [
          # The UUID lives in `propertyId`; there is no top-level `id` on a
          # property document, so matching on 'id' silently never fired and the
          # documented UUID lookup 404'd while slug and reference worked.
          { 'propertyId' => value },
          { 'slug' => value.downcase },
          { 'referenceNo' => value.upcase },
          { '_id' => value }
        ]
        clauses << { '_id' => BSON::ObjectId.from_string(value) } if BSON::ObjectId.legal?(value)

        collection.find({ '$or' => clauses, 'deletedAt' => nil }).limit(1).first
      end

      # --- market aggregation ------------------------------------------------

      # @return [Hash] the raw `$facet` output (string keys, Mongo types).
      def market_facets(area_id: nil, from: nil, to: nil, top: 10)
        pipeline = base_pipeline(area_id: area_id, from: from, to: to)
        run_facets(pipeline, top: top, median: true)
      rescue Mongo::Error::OperationFailure => e
        # $median / $percentile need MongoDB 7+. Fall back to a Ruby-side median.
        raise unless median_unsupported?(e)

        Logging.warn('mongo.median_unsupported', errorMessage: e.message)
        run_facets(base_pipeline(area_id: area_id, from: from, to: to), top: top, median: false)
      end

      def base_pipeline(area_id: nil, from: nil, to: nil)
        match = { 'deletedAt' => nil }
        match['location.areaId'] = area_id if area_id

        pipeline = [{ '$match' => match }]
        pipeline << { '$addFields' => { DATE_ALIAS => date_conversion } }

        if from || to
          range = {}
          range['$gte'] = from.utc if from
          range['$lte'] = to.utc if to
          pipeline << { '$match' => { DATE_ALIAS => range } }
        end

        pipeline
      end

      def date_conversion(field = DATE_FIELD)
        { '$convert' => { 'input' => field, 'to' => 'date', 'onError' => nil, 'onNull' => nil } }
      end

      def run_facets(pipeline, top:, median:)
        full = pipeline + [{ '$facet' => facets(top: top, median: median) }]
        collection.aggregate(full, allow_disk_use: true, max_time_ms: 15_000).first || {}
      end

      def facets(top:, median:)
        overall_group = {
          '_id' => nil,
          'count' => { '$sum' => 1 },
          'avgPrice' => { '$avg' => '$price.amount' },
          'minPrice' => { '$min' => '$price.amount' },
          'maxPrice' => { '$max' => '$price.amount' },
          'avgPricePerMeter' => { '$avg' => '$price.pricePerMeter' },
          'minPricePerMeter' => { '$min' => '$price.pricePerMeter' },
          'maxPricePerMeter' => { '$max' => '$price.pricePerMeter' },
          'avgAreaSqm' => { '$avg' => '$specs.areaSqm' },
          'minAreaSqm' => { '$min' => '$specs.areaSqm' },
          'maxAreaSqm' => { '$max' => '$specs.areaSqm' },
          'avgBedrooms' => { '$avg' => '$specs.bedrooms' },
          'avgDownPaymentPercent' => { '$avg' => '$paymentPlan.downPaymentPercent' },
          'avgInstallmentYears' => { '$avg' => '$paymentPlan.installmentYears' },
          'avgMonthlyInstallment' => { '$avg' => '$paymentPlan.monthlyInstallment' },
          'featured' => { '$sum' => { '$cond' => [{ '$eq' => ['$isFeatured', true] }, 1, 0] } }
        }

        if median
          overall_group['medianPrice'] =
            { '$median' => { 'input' => '$price.amount', 'method' => 'approximate' } }
          overall_group['medianPricePerMeter'] =
            { '$median' => { 'input' => '$price.pricePerMeter', 'method' => 'approximate' } }
        end

        result = {
          'overall' => [{ '$group' => overall_group }],
          'byPropertyType' => bucket_facet('$propertyType'),
          'byFinishing' => bucket_facet('$finishing'),
          'bySaleType' => bucket_facet('$saleType'),
          'byStatus' => bucket_facet('$status'),
          'byBedrooms' => [
            { '$group' => { '_id' => '$specs.bedrooms', 'count' => { '$sum' => 1 },
                            'avgPrice' => { '$avg' => '$price.amount' } } },
            { '$sort' => { '_id' => 1 } }
          ],
          'byArea' => [
            { '$group' => { '_id' => '$location.areaId',
                            'name' => { '$first' => '$location.areaName' },
                            'city' => { '$first' => '$location.city' },
                            'count' => { '$sum' => 1 },
                            'avgPrice' => { '$avg' => '$price.amount' },
                            'avgPricePerMeter' => { '$avg' => '$price.pricePerMeter' } } },
            { '$sort' => { 'count' => -1, '_id' => 1 } },
            { '$limit' => 20 }
          ],
          'supplyTrend' => [
            { '$match' => { DATE_ALIAS => { '$ne' => nil } } },
            { '$group' => { '_id' => { '$dateToString' => { 'format' => '%Y-%m',
                                                            'date' => "$#{DATE_ALIAS}" } },
                            'count' => { '$sum' => 1 },
                            'avgPrice' => { '$avg' => '$price.amount' },
                            'avgPricePerMeter' => { '$avg' => '$price.pricePerMeter' } } },
            { '$sort' => { '_id' => 1 } }
          ],
          'topCompounds' => [
            { '$group' => { '_id' => '$compound.id',
                            'name' => { '$first' => '$compound.name' },
                            'slug' => { '$first' => '$compound.slug' },
                            'developerName' => { '$first' => '$developer.name' },
                            'count' => { '$sum' => 1 },
                            'avgPrice' => { '$avg' => '$price.amount' },
                            'minPrice' => { '$min' => '$price.amount' },
                            'maxPrice' => { '$max' => '$price.amount' },
                            'avgPricePerMeter' => { '$avg' => '$price.pricePerMeter' } } },
            { '$sort' => { 'count' => -1, 'avgPrice' => -1, '_id' => 1 } },
            { '$limit' => top }
          ],
          'topDevelopers' => [
            { '$group' => { '_id' => '$developer.id',
                            'name' => { '$first' => '$developer.name' },
                            'slug' => { '$first' => '$developer.slug' },
                            'count' => { '$sum' => 1 },
                            'avgPrice' => { '$avg' => '$price.amount' },
                            'avgPricePerMeter' => { '$avg' => '$price.pricePerMeter' },
                            'compounds' => { '$addToSet' => '$compound.id' } } },
            { '$sort' => { 'count' => -1, 'avgPrice' => -1, '_id' => 1 } },
            { '$limit' => top }
          ],
          'topAmenities' => [
            { '$unwind' => '$amenities' },
            { '$group' => { '_id' => '$amenities', 'count' => { '$sum' => 1 } } },
            { '$sort' => { 'count' => -1, '_id' => 1 } },
            { '$limit' => 12 }
          ],
          'areaMeta' => [
            { '$group' => { '_id' => '$location.areaId',
                            'name' => { '$first' => '$location.areaName' },
                            'city' => { '$first' => '$location.city' },
                            'governorate' => { '$first' => '$location.governorate' },
                            'count' => { '$sum' => 1 } } },
            { '$sort' => { 'count' => -1 } },
            { '$limit' => 1 }
          ]
        }

        # Without $median we pull the price vector and compute it in Ruby.
        unless median
          result['prices'] = [{ '$group' => { '_id' => nil,
                                              'prices' => { '$push' => '$price.amount' },
                                              'pricesPerMeter' => { '$push' => '$price.pricePerMeter' } } }]
        end

        result
      end

      def bucket_facet(field)
        [
          { '$group' => { '_id' => field, 'count' => { '$sum' => 1 },
                          'avgPrice' => { '$avg' => '$price.amount' },
                          'minPrice' => { '$min' => '$price.amount' },
                          'maxPrice' => { '$max' => '$price.amount' },
                          'avgPricePerMeter' => { '$avg' => '$price.pricePerMeter' },
                          'avgAreaSqm' => { '$avg' => '$specs.areaSqm' } } },
          { '$sort' => { 'count' => -1, '_id' => 1 } }
        ]
      end

      def median_unsupported?(error)
        message = error.message.to_s
        message.include?('$median') || message.include?('percentile') ||
          message.include?('Unrecognized expression') || message.include?('unknown group operator')
      end

      # --- exports -----------------------------------------------------------

      # Streams matching documents to the block, oldest first.
      def each_for_export(filters = {}, batch_size: 500, limit: nil)
        pipeline = export_pipeline(filters)
        pipeline << { '$limit' => limit } if limit
        view = collection.aggregate(pipeline, allow_disk_use: true, batch_size: batch_size,
                                              max_time_ms: 120_000)
        count = 0
        view.each do |doc|
          count += 1
          yield doc
        end
        count
      end

      def export_pipeline(filters)
        match = { 'deletedAt' => nil }
        match['location.areaId'] = filters[:area_id] if filters[:area_id]
        match['status'] = filters[:status] if filters[:status]
        match['propertyType'] = filters[:property_type] if filters[:property_type]
        match['saleType'] = filters[:sale_type] if filters[:sale_type]
        match['compound.id'] = filters[:compound_id] if filters[:compound_id]
        match['developer.id'] = filters[:developer_id] if filters[:developer_id]

        pipeline = [{ '$match' => match },
                    { '$addFields' => { DATE_ALIAS => date_conversion } }]

        if filters[:from] || filters[:to]
          range = {}
          range['$gte'] = filters[:from].utc if filters[:from]
          range['$lte'] = filters[:to].utc if filters[:to]
          pipeline << { '$match' => { DATE_ALIAS => range } }
        end

        pipeline << { '$sort' => { DATE_ALIAS => 1, '_id' => 1 } }
        pipeline
      end

      def count(filters = {})
        pipeline = export_pipeline(filters) + [{ '$count' => 'total' }]
        (collection.aggregate(pipeline, max_time_ms: 15_000).first || {})['total'].to_i
      end
    end
  end
end
