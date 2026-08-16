# frozen_string_literal: true

RSpec.describe 'Health endpoints', type: :request do
  describe 'GET /health' do
    it 'reports the CONTRACT §4 health payload' do
      get '/health'

      expect(last_response.status).to eq(200)
      expect(json_response).to include(
        'status' => 'ok',
        'service' => 'reports-svc',
        'version' => '1.0.0'
      )
      expect(json_response['deps'].keys).to contain_exactly('postgres', 'mongo', 'redis')
    end

    it 'is also mounted under the /api/reports prefix' do
      get '/api/reports/health'
      expect(last_response.status).to eq(200)
      expect(json_response['service']).to eq('reports-svc')
    end

    it 'stays 200 even when a dependency is down (liveness, not readiness)' do
      allow(Reports::DB).to receive(:health).and_return(
        postgres: { status: 'down', error: 'PG::ConnectionBad' },
        mongo: { status: 'ok', latencyMs: 1.0 },
        redis: { status: 'ok', latencyMs: 0.2 }
      )

      get '/health'
      expect(last_response.status).to eq(200)
      expect(json_response.dig('deps', 'postgres', 'status')).to eq('down')
    end

    it 'echoes the X-Request-Id it was given' do
      get '/health', {}, 'HTTP_X_REQUEST_ID' => 'req-123'
      expect(last_response.headers['x-request-id']).to eq('req-123')
    end

    it 'generates an X-Request-Id when the caller omits one' do
      get '/health'
      expect(last_response.headers['x-request-id']).to match(/\A[0-9a-f-]{36}\z/)
    end
  end

  describe 'GET /health/ready' do
    it 'is ready when every dependency answers' do
      get '/health/ready'
      expect(last_response.status).to eq(200)
      expect(json_response['status']).to eq('ok')
    end

    it 'is 503 and degraded when a dependency is down' do
      allow(Reports::DB).to receive(:health).and_return(
        postgres: { status: 'ok', latencyMs: 1.0 },
        mongo: { status: 'down', error: 'Mongo::Error::NoServerAvailable' },
        redis: { status: 'ok', latencyMs: 0.2 }
      )

      get '/health/ready'
      expect(last_response.status).to eq(503)
      expect(json_response['status']).to eq('degraded')
    end

    it 'is mounted under the prefix too' do
      get '/api/reports/health/ready'
      expect(last_response.status).to eq(200)
    end
  end

  describe 'unknown routes' do
    it 'returns the CONTRACT §4 error envelope' do
      get '/api/reports/does-not-exist'

      expect(last_response.status).to eq(404)
      expect(json_response['success']).to be(false)
      expect(error_code).to eq('NOT_FOUND')
      expect(json_response.dig('error', 'details')).to eq([])
    end
  end

  describe 'GET /api/reports' do
    it 'describes the service' do
      get '/api/reports'
      expect(last_response.status).to eq(200)
      expect(json_response.dig('data', 'service')).to eq('reports-svc')
      expect(json_response.dig('data', 'endpoints')).to be_an(Array)
    end
  end
end
