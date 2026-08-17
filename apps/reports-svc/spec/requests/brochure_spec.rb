# frozen_string_literal: true

RSpec.describe 'GET /api/reports/property/:id/brochure.pdf', type: :request do
  let(:document) { property_document }

  before do
    allow(Reports::Repositories::PropertyRepository).to receive(:find).and_return(document)
    allow(Reports::Repositories::ReferenceRepository).to receive(:compound).and_return(
      { id: SpecSupport::Fixtures::COMPOUND_ID, name: 'Palm Hills New Cairo',
        description: { 'en' => 'Palm Hills New Cairo spreads over 500 acres off the Ring Road.',
                       'ar' => '...' },
        delivery_year: 2026, installment_years: 8, starting_price: 9_140_000 }
    )
    allow(Reports::Repositories::ReferenceRepository).to receive(:developer).and_return(
      { id: SpecSupport::Fixtures::DEVELOPER_ID, name: 'Palm Hills Developments',
        description: { 'en' => 'One of Egypt\'s largest listed developers.', 'ar' => '...' },
        founded_year: 2005, projects_count: 3, website: 'https://www.palmhillsdevelopments.com' }
    )
    allow(Reports::Repositories::ReferenceRepository).to receive(:area).and_return(
      { id: SpecSupport::Fixtures::AREA_ID, name: 'New Cairo',
        description: { 'en' => 'New Cairo is the eastern hub of Greater Cairo.', 'ar' => '...' },
        avg_price_per_meter: 55_000 }
    )
    allow(Reports::Repositories::ReferenceRepository).to receive(:amenity_names).and_return(
      'pool' => 'Swimming Pool', 'gym' => 'Gym & Fitness Centre'
    )
    # Never reach out to the network in a spec: exercise the placeholder path.
    allow(Reports::HttpFetch).to receive(:image).and_return(nil)
  end

  it 'renders a PDF as an attachment with a slugged filename' do
    get "/api/reports/property/#{SpecSupport::Fixtures::PROPERTY_ID}/brochure.pdf"

    expect(last_response.status).to eq(200)
    expect(last_response.headers['content-type']).to eq('application/pdf')
    expect(last_response.headers['content-disposition'])
      .to include('attachment; filename="topchoice-palm-hills-new-cairo-3br-apartment-tc-1042-tc-1042.pdf"')
    expect(last_response.body[0, 5]).to eq('%PDF-')
    expect(last_response.body.bytesize).to be > 2_000
  end

  it 'sets the correlation and cache headers' do
    get "/api/reports/property/#{SpecSupport::Fixtures::PROPERTY_ID}/brochure.pdf"

    expect(last_response.headers['x-property-id']).to eq(SpecSupport::Fixtures::PROPERTY_ID)
    expect(last_response.headers['x-cache']).to eq('MISS')
    expect(last_response.headers['cache-control']).to eq('private, max-age=600')
    expect(last_response.headers['etag']).to be_a(String)
    expect(last_response.headers['x-request-id']).not_to be_nil
  end

  it 'caches the rendered bytes in Redis for ten minutes' do
    expect(Reports::DB).to receive(:cache_bytes) do |key, ttl, &block|
      expect(key).to eq("cache:prop:#{SpecSupport::Fixtures::PROPERTY_ID}:brochure:v1")
      expect(ttl).to eq(600)
      block.call
    end

    get "/api/reports/property/#{SpecSupport::Fixtures::PROPERTY_ID}/brochure.pdf"
    expect(last_response.status).to eq(200)
  end

  it 'reports a cache hit without re-rendering' do
    allow(Reports::DB).to receive(:cache_bytes).and_return("%PDF-1.4\ncached".b)
    expect(Reports::Brochure).not_to receive(:render)

    get "/api/reports/property/#{SpecSupport::Fixtures::PROPERTY_ID}/brochure.pdf"

    expect(last_response.status).to eq(200)
    expect(last_response.headers['x-cache']).to eq('HIT')
  end

  it 'looks the property up by slug or reference number too' do
    expect(Reports::Repositories::PropertyRepository).to receive(:find).with('TC-1042')
                                                                      .and_return(document)

    get '/api/reports/property/TC-1042/brochure.pdf'
    expect(last_response.status).to eq(200)
  end

  it 'still renders when the Postgres reference tables are unavailable' do
    allow(Reports::Repositories::ReferenceRepository).to receive(:compound).and_return(nil)
    allow(Reports::Repositories::ReferenceRepository).to receive(:developer).and_return(nil)
    allow(Reports::Repositories::ReferenceRepository).to receive(:area).and_return(nil)
    allow(Reports::Repositories::ReferenceRepository).to receive(:amenity_names).and_return({})

    get "/api/reports/property/#{SpecSupport::Fixtures::PROPERTY_ID}/brochure.pdf"

    expect(last_response.status).to eq(200)
    expect(last_response.body[0, 5]).to eq('%PDF-')
  end

  it 'renders a resale listing without a developer plan' do
    cash = property_document('saleType' => 'resale',
                             'paymentPlan' => { 'downPaymentPercent' => nil,
                                                'installmentYears' => 0,
                                                'deliveryDate' => nil })
    allow(Reports::Repositories::PropertyRepository).to receive(:find).and_return(cash)

    get "/api/reports/property/#{SpecSupport::Fixtures::PROPERTY_ID}/brochure.pdf"

    expect(last_response.status).to eq(200)
    expect(last_response.body[0, 5]).to eq('%PDF-')
  end

  it 'returns 404 PROPERTY_NOT_FOUND for an unknown listing' do
    allow(Reports::Repositories::PropertyRepository).to receive(:find).and_return(nil)

    get '/api/reports/property/does-not-exist/brochure.pdf'

    expect(last_response.status).to eq(404)
    expect(last_response.headers['content-type']).to include('application/json')
    expect(error_code).to eq('PROPERTY_NOT_FOUND')
  end

  it 'returns 503 when Mongo is unreachable' do
    allow(Reports::Repositories::PropertyRepository)
      .to receive(:find).and_raise(Reports::Errors::DependencyError.new('mongo is unavailable'))

    get "/api/reports/property/#{SpecSupport::Fixtures::PROPERTY_ID}/brochure.pdf"

    expect(last_response.status).to eq(503)
    expect(error_code).to eq('SERVICE_UNAVAILABLE')
  end
end

RSpec.describe Reports::Brochure do
  before do
    allow(Reports::HttpFetch).to receive(:image).and_return(nil)
    allow(Reports::Repositories::ReferenceRepository).to receive(:compound).and_return(nil)
    allow(Reports::Repositories::ReferenceRepository).to receive(:developer).and_return(nil)
    allow(Reports::Repositories::ReferenceRepository).to receive(:area).and_return(nil)
    allow(Reports::Repositories::ReferenceRepository).to receive(:amenity_names).and_return({})
  end

  describe '.view_model' do
    subject(:view) { described_class.view_model(property_document) }

    it 'formats the headline figures in EGP' do
      expect(view[:price_label]).to eq('EGP 8,500,000')
      expect(view[:price_per_meter_label]).to eq('EGP 47,222 / m²')
      expect(view[:payment_headline]).to eq('10% down (EGP 850,000) over 8 years')
    end

    it 'builds the payment plan from lib/finance.rb' do
      rows = view[:payment_plan][:summary_rows].to_h
      expect(rows['Unit price']).to eq('EGP 8,500,000')
      expect(rows['Down payment (10%)']).to eq('EGP 850,000')
      expect(rows['Quarterly instalment']).to eq('EGP 239,062.50')
      expect(rows['Instalment plan']).to eq('32 quarterly instalments over 8 years')
      expect(rows['Maintenance deposit (8%) on delivery']).to eq('EGP 680,000')
      expect(rows['Total cash out']).to eq('EGP 9,180,000')
    end

    it 'rolls the plan into a yearly cash flow starting from the contract date' do
      cash_flow = view[:payment_plan][:cash_flow_rows]
      expect(cash_flow.first[0]).to eq(Date.today.year.to_s)
      expect(cash_flow.last[3]).to eq('100.0%')
      expect(cash_flow.sum { |row| row[1].to_i }).to eq(34) # 1 down payment + 32 + maintenance
    end

    it 'falls back to humanised amenity slugs when the amenity table is unavailable' do
      expect(view[:amenities]).to eq(%w[Pool Gym Security Clubhouse])
    end

    it 'points at the public listing URL' do
      expect(view[:listing_url])
        .to eq('https://localhost/properties/palm-hills-new-cairo-3br-apartment-tc-1042')
    end

    it 'renders the location line and coordinates' do
      expect(view[:location_line]).to eq('Palm Hills New Cairo, New Cairo, Cairo')
      expect(view[:coordinates_line]).to eq('Coordinates: 30.030400, 31.491300 (lat, lng)')
    end
  end

  describe '.filename' do
    it 'slugs the listing and its reference' do
      expect(described_class.filename(property_document))
        .to eq('topchoice-palm-hills-new-cairo-3br-apartment-tc-1042-tc-1042.pdf')
    end
  end

  describe '.render' do
    it 'produces a real, non-trivial PDF' do
      bytes = described_class.render(property_document)
      expect(bytes[0, 5]).to eq('%PDF-')
      expect(bytes).to end_with("%%EOF\n").or include('%%EOF')
      expect(bytes.bytesize).to be > 2_000
    end

    it 'survives a listing with no media and no compound' do
      bare = property_document('media' => { 'images' => [] }, 'compound' => {}, 'amenities' => [])
      expect(described_class.render(bare)[0, 5]).to eq('%PDF-')
    end
  end
end
