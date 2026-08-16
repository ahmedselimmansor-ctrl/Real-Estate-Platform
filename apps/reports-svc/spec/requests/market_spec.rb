# frozen_string_literal: true

RSpec.describe 'GET /api/reports/market/summary', type: :request do
  before do
    allow(Reports::Repositories::PropertyRepository)
      .to receive(:market_facets).and_return(market_facets)
  end

  it 'returns the aggregated market snapshot' do
    get '/api/reports/market/summary'

    expect(last_response.status).to eq(200)
    expect(json_response['success']).to be(true)

    data = json_response['data']
    expect(data['currency']).to eq('EGP')
    expect(data.dig('totals', 'listings')).to eq(35)
    expect(data.dig('price', 'avg')).to eq(12_450_000.0)
    expect(data.dig('price', 'median')).to eq(9_800_000.0)
    expect(data.dig('price', 'min')).to eq(3_200_000.0)
    expect(data.dig('price', 'max')).to eq(61_000_000.0)
    expect(data.dig('price', 'avgPerMeter')).to eq(55_120.5)
    expect(data.dig('paymentTerms', 'avgDownPaymentPercent')).to eq(12.5)
    expect(data.dig('paymentTerms', 'avgInstallmentYears')).to eq(7.4)
  end

  it 'breaks the supply down by type, finishing and month' do
    get '/api/reports/market/summary'
    data = json_response['data']

    apartments = data['byPropertyType'].first
    expect(apartments).to include('propertyType' => 'apartment', 'count' => 20)
    expect(apartments['share']).to eq(57.14)

    expect(data['byFinishing'].map { |bucket| bucket['finishing'] })
      .to eq(%w[semi_finished fully_finished])

    expect(data['supplyTrend'].first).to include('month' => '2025-11', 'count' => 4)
    expect(data['supplyTrend'].map { |bucket| bucket['month'] }).to eq(%w[2025-11 2025-12])
  end

  it 'lists the top compounds and developers' do
    get '/api/reports/market/summary'
    data = json_response['data']

    expect(data['topCompounds'].first).to include(
      'name' => 'Palm Hills New Cairo', 'listings' => 9, 'avgPrice' => 13_200_000.0
    )
    expect(data['topDevelopers'].first).to include(
      'name' => 'Palm Hills Developments', 'listings' => 9, 'compounds' => 1
    )
    expect(data['topAmenities'].first).to include('amenity' => 'pool')
  end

  it 'passes the area and date filters through to the repository' do
    expect(Reports::Repositories::PropertyRepository)
      .to receive(:market_facets)
      .with(hash_including(area_id: SpecSupport::Fixtures::AREA_ID,
                           from: Time.utc(2026, 1, 1),
                           to: Time.utc(2026, 6, 30, 23, 59, 59)))
      .and_return(market_facets)

    get "/api/reports/market/summary?areaId=#{SpecSupport::Fixtures::AREA_ID}&from=2026-01-01&to=2026-06-30"

    expect(last_response.status).to eq(200)
    expect(json_response.dig('data', 'area', 'name')).to eq('New Cairo')
    expect(json_response.dig('data', 'filters', 'areaId')).to eq(SpecSupport::Fixtures::AREA_ID)
  end

  it 'caches the payload for five minutes' do
    expect(Reports::DB).to receive(:cache) do |key, ttl, &block|
      expect(key).to start_with('cache:list:')
      expect(ttl).to eq(300)
      Reports::JsonCodec.normalize(block.call)
    end

    get '/api/reports/market/summary'
    expect(last_response.status).to eq(200)
    expect(last_response.headers['cache-control']).to eq('private, max-age=300')
  end

  it 'rejects a non-UUID areaId with 422' do
    get '/api/reports/market/summary?areaId=not-a-uuid'

    expect(last_response.status).to eq(422)
    expect(error_code).to eq('VALIDATION_ERROR')
    expect(json_response.dig('error', 'details', 0, 'field')).to eq('areaId')
  end

  it 'rejects an unparseable date' do
    get '/api/reports/market/summary?from=yesterday'

    expect(last_response.status).to eq(422)
    expect(json_response.dig('error', 'details', 0, 'field')).to eq('from')
  end

  it 'rejects an inverted date range' do
    get '/api/reports/market/summary?from=2026-06-01&to=2026-01-01'

    expect(last_response.status).to eq(422)
    expect(json_response.dig('error', 'message')).to match(/must not be after/)
  end

  it 'copes with an empty market' do
    allow(Reports::Repositories::PropertyRepository).to receive(:market_facets).and_return(
      'overall' => [], 'byPropertyType' => [], 'byFinishing' => [], 'bySaleType' => [],
      'byStatus' => [], 'byBedrooms' => [], 'byArea' => [], 'supplyTrend' => [],
      'topCompounds' => [], 'topDevelopers' => [], 'topAmenities' => [], 'areaMeta' => []
    )

    get '/api/reports/market/summary'

    expect(last_response.status).to eq(200)
    expect(json_response.dig('data', 'totals', 'listings')).to eq(0)
    expect(json_response.dig('data', 'price', 'avg')).to be_nil
    expect(json_response.dig('data', 'byPropertyType')).to eq([])
  end

  it 'returns 503 when Mongo is unreachable' do
    allow(Reports::Repositories::PropertyRepository)
      .to receive(:market_facets)
      .and_raise(Reports::Errors::DependencyError.new('mongo is unavailable: connection refused'))

    get '/api/reports/market/summary'

    expect(last_response.status).to eq(503)
    expect(error_code).to eq('SERVICE_UNAVAILABLE')
  end
end
