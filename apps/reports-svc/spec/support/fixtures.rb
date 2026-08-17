# frozen_string_literal: true

module SpecSupport
  # Fixtures mirror the shape of the shared seed dataset (`seed/properties.json`)
  # and of the Mongo `$facet` output the market report consumes.
  module Fixtures
    PROPERTY_ID  = 'cccb864c-9dc1-5e61-bd8d-cbcf60be81b8'
    AREA_ID      = 'b47dcd29-cff0-5bd0-b7dd-03def1acf3b2'
    COMPOUND_ID  = '1a63850a-81c8-5c83-a7d6-3c0b69fd93f9'
    DEVELOPER_ID = 'fbbdfc50-271a-535e-814b-30585c974062'

    def property_document(overrides = {})
      {
        'id' => PROPERTY_ID,
        'mongoId' => 'bfeaaa033d129db4724c32bf',
        'slug' => 'palm-hills-new-cairo-3br-apartment-tc-1042',
        'referenceNo' => 'TC-1042',
        'title' => { 'en' => '3 Bedroom Apartment 180 m² in Palm Hills New Cairo',
                     'ar' => 'شقة 3 غرف 180 متر في بالم هيلز نيو كايرو' },
        'description' => { 'en' => 'A 180 m² apartment inside Palm Hills New Cairo with 3 bedrooms, ' \
                                   'delivered semi finished and overlooking the central park.',
                           'ar' => 'شقة 180 متر داخل بالم هيلز نيو كايرو.' },
        'propertyType' => 'apartment',
        'saleType' => 'primary',
        'status' => 'available',
        'finishing' => 'semi_finished',
        'price' => { 'amount' => 8_500_000, 'currency' => 'EGP', 'pricePerMeter' => 47_222 },
        'paymentPlan' => { 'downPaymentPercent' => 10, 'installmentYears' => 8,
                           'monthlyInstallment' => 79_687, 'deliveryDate' => '2027-06-30' },
        'specs' => { 'bedrooms' => 3, 'bathrooms' => 3, 'areaSqm' => 180, 'gardenSqm' => 0,
                     'floor' => 5, 'parkingSpots' => 1 },
        'location' => { 'areaId' => AREA_ID, 'areaName' => 'New Cairo', 'city' => 'Cairo',
                        'governorate' => 'Cairo', 'address' => '90th North St.',
                        'geo' => { 'type' => 'Point', 'coordinates' => [31.4913, 30.0304] } },
        'compound' => { 'id' => COMPOUND_ID, 'name' => 'Palm Hills New Cairo',
                        'slug' => 'palm-hills-new-cairo' },
        'developer' => { 'id' => DEVELOPER_ID, 'name' => 'Palm Hills Developments',
                         'slug' => 'palm-hills', 'logoUrl' => 'https://picsum.photos/seed/x/320/320' },
        'amenities' => %w[pool gym security clubhouse],
        'media' => {
          'images' => [
            { 'url' => 'https://picsum.photos/seed/topchoice-prop-1/1600/900',
              'key' => 'properties/palm-hills-new-cairo-3br-apartment-tc-1042/1.jpg',
              'width' => 1600, 'height' => 900, 'isPrimary' => true, 'order' => 0 }
          ],
          'floorPlans' => [], 'videoUrl' => nil, 'tourUrl' => nil
        },
        'stats' => { 'views' => 120, 'favorites' => 8, 'leads' => 3 },
        'isFeatured' => true,
        'publishedAt' => '2026-02-10T00:00:00.000Z',
        'createdAt' => '2026-02-01T00:00:00.000Z',
        'updatedAt' => '2026-02-11T00:00:00.000Z',
        'deletedAt' => nil
      }.merge(overrides)
    end

    def market_facets(overrides = {})
      {
        'overall' => [{
          '_id' => nil, 'count' => 35, 'avgPrice' => 12_450_000.0, 'minPrice' => 3_200_000,
          'maxPrice' => 61_000_000, 'medianPrice' => 9_800_000, 'avgPricePerMeter' => 55_120.5,
          'minPricePerMeter' => 31_000, 'maxPricePerMeter' => 92_000,
          'medianPricePerMeter' => 54_000, 'avgAreaSqm' => 212.4, 'minAreaSqm' => 95,
          'maxAreaSqm' => 620, 'avgBedrooms' => 3.1, 'avgDownPaymentPercent' => 12.5,
          'avgInstallmentYears' => 7.4, 'avgMonthlyInstallment' => 92_400.0, 'featured' => 5
        }],
        'byPropertyType' => [
          { '_id' => 'apartment', 'count' => 20, 'avgPrice' => 9_100_000.0, 'minPrice' => 3_200_000,
            'maxPrice' => 18_000_000, 'avgPricePerMeter' => 51_000.0, 'avgAreaSqm' => 165.2 },
          { '_id' => 'villa', 'count' => 15, 'avgPrice' => 17_900_000.0, 'minPrice' => 11_000_000,
            'maxPrice' => 61_000_000, 'avgPricePerMeter' => 61_000.0, 'avgAreaSqm' => 300.0 }
        ],
        'byFinishing' => [
          { '_id' => 'semi_finished', 'count' => 25, 'avgPrice' => 11_000_000.0 },
          { '_id' => 'fully_finished', 'count' => 10, 'avgPrice' => 15_000_000.0 }
        ],
        'bySaleType' => [{ '_id' => 'primary', 'count' => 30, 'avgPrice' => 12_000_000.0 },
                         { '_id' => 'resale', 'count' => 5, 'avgPrice' => 15_000_000.0 }],
        'byStatus' => [{ '_id' => 'available', 'count' => 35, 'avgPrice' => 12_450_000.0 }],
        'byBedrooms' => [{ '_id' => 3, 'count' => 18, 'avgPrice' => 10_500_000.0 },
                         { '_id' => 4, 'count' => 17, 'avgPrice' => 14_500_000.0 }],
        'byArea' => [{ '_id' => AREA_ID, 'name' => 'New Cairo', 'city' => 'Cairo', 'count' => 35,
                       'avgPrice' => 12_450_000.0, 'avgPricePerMeter' => 55_120.5 }],
        'supplyTrend' => [
          { '_id' => '2025-11', 'count' => 4, 'avgPrice' => 9_000_000.0, 'avgPricePerMeter' => 48_000.0 },
          { '_id' => '2025-12', 'count' => 6, 'avgPrice' => 11_500_000.0, 'avgPricePerMeter' => 52_000.0 }
        ],
        'topCompounds' => [{ '_id' => COMPOUND_ID, 'name' => 'Palm Hills New Cairo',
                             'slug' => 'palm-hills-new-cairo', 'developerName' => 'Palm Hills Developments',
                             'count' => 9, 'avgPrice' => 13_200_000.0, 'minPrice' => 9_140_000,
                             'maxPrice' => 33_960_000, 'avgPricePerMeter' => 56_000.0 }],
        'topDevelopers' => [{ '_id' => DEVELOPER_ID, 'name' => 'Palm Hills Developments',
                              'slug' => 'palm-hills', 'count' => 9, 'avgPrice' => 13_200_000.0,
                              'avgPricePerMeter' => 56_000.0, 'compounds' => [COMPOUND_ID] }],
        'topAmenities' => [{ '_id' => 'pool', 'count' => 30 }, { '_id' => 'gym', 'count' => 28 }],
        'areaMeta' => [{ '_id' => AREA_ID, 'name' => 'New Cairo', 'city' => 'Cairo',
                         'governorate' => 'Cairo', 'count' => 35 }]
      }.merge(overrides)
    end

    def lead_row(overrides = {})
      {
        'id' => '6f1d3f6e-6a1f-4a3a-9d0e-5c1f2b3a4d5e',
        'name' => 'Mona Adel',
        'email' => 'mona@example.com',
        'phone' => '+201001234567',
        'status' => 'new',
        'source' => 'website',
        'message' => "I would like a viewing\nnext week",
        'property_id' => PROPERTY_ID,
        'property_slug' => 'palm-hills-new-cairo-3br-apartment-tc-1042',
        'property_area_id' => AREA_ID,
        'property_price_min' => 8_500_000,
        'property_status' => 'available',
        'user_id' => nil,
        'agent_id' => nil,
        'created_at' => '2026-03-01 10:15:00 UTC',
        'updated_at' => '2026-03-02 09:00:00 UTC'
      }.merge(overrides)
    end
  end
end
