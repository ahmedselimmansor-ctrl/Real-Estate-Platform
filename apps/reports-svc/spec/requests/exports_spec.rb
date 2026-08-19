# frozen_string_literal: true

RSpec.describe 'Admin CSV exports', type: :request do
  describe 'GET /api/reports/admin/export/leads.csv' do
    before do
      allow(Reports::Repositories::LeadRepository).to receive(:count).and_return(1)
      allow(Reports::Repositories::LeadRepository).to receive(:each) do |_filters, **_options, &block|
        block.call(lead_row)
        1
      end
    end

    it 'requires authentication' do
      get '/api/reports/admin/export/leads.csv'

      expect(last_response.status).to eq(401)
      expect(error_code).to eq('UNAUTHORIZED')
      expect(last_response.headers['content-type']).to include('application/json')
    end

    it 'rejects a non-admin role' do
      get '/api/reports/admin/export/leads.csv', {}, bearer(role: 'agent')

      expect(last_response.status).to eq(403)
      expect(error_code).to eq('FORBIDDEN')
    end

    it 'rejects an expired token' do
      get '/api/reports/admin/export/leads.csv', {},
          bearer(role: 'admin', exp: Time.now.to_i - 10)

      expect(last_response.status).to eq(401)
      expect(error_code).to eq('TOKEN_EXPIRED')
    end

    it 'streams a UTF-8 CSV with a BOM for Excel' do
      get '/api/reports/admin/export/leads.csv', {}, admin_headers

      expect(last_response.status).to eq(200)
      expect(last_response.headers['content-type']).to eq('text/csv; charset=utf-8')
      expect(last_response.headers['content-disposition']).to include('attachment; filename="topchoice-leads-')
      expect(last_response.headers['x-total-rows']).to eq('1')
      expect(last_response.headers['cache-control']).to eq('no-store')

      body = last_response.body
      expect(body.byteslice(0, 3).bytes).to eq([0xEF, 0xBB, 0xBF])

      rows = CSV.parse(body.byteslice(3..).force_encoding('UTF-8'))
      expect(rows.first).to eq(Reports::Exports::LEAD_HEADERS)
      expect(rows[1][0]).to eq('6f1d3f6e-6a1f-4a3a-9d0e-5c1f2b3a4d5e')
      expect(rows[1][1]).to eq('Mona Adel')
      expect(rows[1][4]).to eq('new')
      expect(rows[1][6]).to eq('I would like a viewing next week') # newlines flattened
      expect(rows[1][8]).to eq('palm-hills-new-cairo-3br-apartment-tc-1042')
    end

    it 'passes the date, status and area filters to the repository' do
      expect(Reports::Repositories::LeadRepository)
        .to receive(:each)
        .with(hash_including(from: Time.utc(2026, 1, 1),
                             to: Time.utc(2026, 3, 31, 23, 59, 59),
                             status: 'qualified',
                             area_id: SpecSupport::Fixtures::AREA_ID),
              any_args)
        .and_return(0)

      get '/api/reports/admin/export/leads.csv?from=2026-01-01&to=2026-03-31&status=qualified' \
          "&areaId=#{SpecSupport::Fixtures::AREA_ID}", {}, admin_headers

      expect(last_response.status).to eq(200)
    end

    it 'rejects an unknown lead status with 422' do
      get '/api/reports/admin/export/leads.csv?status=exploded', {}, admin_headers

      expect(last_response.status).to eq(422)
      expect(error_code).to eq('VALIDATION_ERROR')
      expect(json_response.dig('error', 'details', 0, 'field')).to eq('status')
    end

    it 'surfaces an unsupported filter as JSON before the stream opens' do
      allow(Reports::Repositories::LeadRepository).to receive(:count)
        .and_raise(Reports::Errors::ValidationError.field('areaId', 'is not supported by this schema'))

      get "/api/reports/admin/export/leads.csv?areaId=#{SpecSupport::Fixtures::AREA_ID}", {},
          admin_headers

      expect(last_response.status).to eq(422)
      expect(error_code).to eq('VALIDATION_ERROR')
    end

    it 'returns 503 when Postgres is unreachable' do
      allow(Reports::Repositories::LeadRepository).to receive(:count)
        .and_raise(Reports::Errors::DependencyError.new('PostgreSQL is unavailable'))

      get '/api/reports/admin/export/leads.csv', {}, admin_headers

      expect(last_response.status).to eq(503)
      expect(error_code).to eq('SERVICE_UNAVAILABLE')
    end
  end

  describe 'GET /api/reports/admin/export/properties.csv' do
    before do
      allow(Reports::Repositories::PropertyRepository).to receive(:count).and_return(1)
      allow(Reports::Repositories::PropertyRepository).to receive(:each_for_export) do |_f, **_o, &block|
        block.call(property_document)
        1
      end
    end

    it 'is admin only' do
      get '/api/reports/admin/export/properties.csv', {}, bearer(role: 'user')
      expect(last_response.status).to eq(403)
    end

    it 'streams every listing column' do
      get '/api/reports/admin/export/properties.csv', {}, admin_headers

      expect(last_response.status).to eq(200)
      expect(last_response.headers['content-type']).to eq('text/csv; charset=utf-8')
      expect(last_response.headers['content-disposition']).to include('topchoice-properties-')

      body = last_response.body
      expect(body.byteslice(0, 3).bytes).to eq([0xEF, 0xBB, 0xBF])

      rows = CSV.parse(body.byteslice(3..).force_encoding('UTF-8'))
      expect(rows.first).to eq(Reports::Exports::PROPERTY_HEADERS)

      row = rows[1]
      expect(row[0]).to eq(SpecSupport::Fixtures::PROPERTY_ID)
      expect(row[2]).to eq('TC-1042')
      expect(row[6]).to eq('apartment')
      expect(row[10]).to eq('8500000')
      expect(row[11]).to eq('EGP')
      expect(row[34]).to eq('pool|gym|security|clubhouse')
      expect(row.last).to eq('https://localhost/properties/palm-hills-new-cairo-3br-apartment-tc-1042')
    end

    it 'keeps the Arabic title intact' do
      get '/api/reports/admin/export/properties.csv', {}, admin_headers

      rows = CSV.parse(last_response.body.byteslice(3..).force_encoding('UTF-8'))
      expect(rows[1][5]).to eq('شقة 3 غرف 180 متر في بالم هيلز نيو كايرو')
    end

    it 'validates the enum filters' do
      get '/api/reports/admin/export/properties.csv?propertyType=castle', {}, admin_headers

      expect(last_response.status).to eq(422)
      expect(json_response.dig('error', 'details', 0, 'field')).to eq('propertyType')
    end

    it 'passes filters through' do
      expect(Reports::Repositories::PropertyRepository)
        .to receive(:each_for_export)
        .with(hash_including(status: 'available', property_type: 'villa',
                             area_id: SpecSupport::Fixtures::AREA_ID),
              any_args)
        .and_return(0)

      get '/api/reports/admin/export/properties.csv?status=available&propertyType=villa' \
          "&areaId=#{SpecSupport::Fixtures::AREA_ID}", {}, admin_headers

      expect(last_response.status).to eq(200)
    end
  end
end
