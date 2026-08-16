# frozen_string_literal: true

# Minimal stand-ins for the Sinatra request scope, so the helper modules can be
# unit tested without booting a request.
class ResponsesHarness
  include Reports::Helpers::Responses

  FakeResponse = Struct.new(:headers)

  attr_reader :env, :response, :current_status, :current_content_type

  def initialize(request_id: 'req-abc')
    @env = { 'reports.request_id' => request_id }
    @response = FakeResponse.new({})
    @current_status = 200
    @current_content_type = nil
  end

  def status(value = nil)
    return @current_status if value.nil?

    @current_status = value
  end

  def content_type(value)
    @current_content_type = value
  end
end

class ParamsHarness
  include Reports::Helpers::Params

  FakeRequest = Struct.new(:body)

  attr_reader :params, :request

  def initialize(params = {}, raw_body = '')
    @params = params
    @request = FakeRequest.new(StringIO.new(raw_body))
  end
end

RSpec.describe Reports::Helpers::Responses do
  subject(:harness) { ResponsesHarness.new }

  it 'renders the success envelope with camelCased keys' do
    body = harness.json_success({ total_count: 2 })

    expect(JSON.parse(body)).to eq('success' => true, 'data' => { 'totalCount' => 2 })
    expect(harness.current_status).to eq(200)
    expect(harness.current_content_type).to eq('application/json; charset=utf-8')
  end

  it 'adds meta for paginated payloads' do
    body = harness.json_success([], meta: harness.pagination_meta(page: 2, limit: 20, total: 45))
    expect(JSON.parse(body)['meta']).to eq(
      'page' => 2, 'limit' => 20, 'total' => 45, 'totalPages' => 3
    )
  end

  it 'renders the error envelope with the right status' do
    body = harness.json_error(code: 'VALIDATION_ERROR', message: 'nope', status: 422,
                              details: [{ field: 'price', message: 'must be positive' }])

    expect(harness.current_status).to eq(422)
    expect(JSON.parse(body)).to eq(
      'success' => false,
      'error' => { 'code' => 'VALIDATION_ERROR', 'message' => 'nope',
                   'details' => [{ 'field' => 'price', 'message' => 'must be positive' }] }
    )
  end

  it 'renders a typed error object' do
    error = Reports::Errors::PropertyNotFoundError.new('No property matches x.')
    body = harness.error_from(error)

    expect(harness.current_status).to eq(404)
    expect(JSON.parse(body).dig('error', 'code')).to eq('PROPERTY_NOT_FOUND')
  end

  it 'copies error headers onto the response' do
    error = Reports::Errors::RateLimitedError.new('slow down', headers: { 'retry-after' => '30' })
    harness.error_from(error)

    expect(harness.response.headers['retry-after']).to eq('30')
    expect(harness.current_status).to eq(429)
  end

  it 'builds an attachment disposition with an ASCII and a UTF-8 filename' do
    harness.attachment!('nawy-leads-2026.csv', 'text/csv; charset=utf-8')

    expect(harness.current_content_type).to eq('text/csv; charset=utf-8')
    expect(harness.response.headers['content-disposition'])
      .to eq(%(attachment; filename="nawy-leads-2026.csv"; filename*=UTF-8''nawy-leads-2026.csv))
    expect(harness.response.headers['x-content-type-options']).to eq('nosniff')
  end

  it 'sets cache directives' do
    harness.no_store!
    expect(harness.response.headers['cache-control']).to eq('no-store')

    harness.cache_for!(300)
    expect(harness.response.headers['cache-control']).to eq('private, max-age=300')
  end

  it 'exposes the request id from the rack env' do
    expect(harness.request_id).to eq('req-abc')
  end
end

RSpec.describe Reports::Helpers::Params do
  describe '#json_request_body' do
    it 'parses a JSON object' do
      harness = ParamsHarness.new({}, '{"price": 1000}')
      expect(harness.json_request_body).to eq('price' => 1000)
    end

    it 'treats an empty body as an empty object' do
      expect(ParamsHarness.new({}, '').json_request_body).to eq({})
    end

    it 'rejects malformed JSON' do
      expect { ParamsHarness.new({}, '{oops').json_request_body }
        .to raise_error(Reports::Errors::InvalidJsonError) { |error|
          expect(error.status).to eq(400)
          expect(error.code).to eq('INVALID_JSON')
        }
    end

    it 'rejects a JSON array at the top level' do
      expect { ParamsHarness.new({}, '[1,2]').json_request_body }
        .to raise_error(Reports::Errors::InvalidJsonError)
    end

    it 'rejects an oversized body' do
      body = JSON.generate(blob: 'x' * (64 * 1024))
      expect { ParamsHarness.new({}, body).json_request_body }
        .to raise_error(Reports::Errors::BadRequestError)
    end
  end

  describe '#body_value' do
    it 'accepts camelCase and snake_case' do
      harness = ParamsHarness.new
      expect(harness.body_value({ 'downPaymentPercent' => 10 }, 'downPaymentPercent')).to eq(10)
      expect(harness.body_value({ 'down_payment_percent' => 15 }, 'downPaymentPercent')).to eq(15)
      expect(harness.body_value({}, 'downPaymentPercent')).to be_nil
    end
  end

  describe 'coercions' do
    subject(:harness) { ParamsHarness.new }

    it 'coerces integers with bounds' do
      expect(harness.coerce_integer('20', 'limit', min: 1, max: 100)).to eq(20)
      expect(harness.coerce_integer(nil, 'limit', default: 20)).to eq(20)
      expect { harness.coerce_integer('abc', 'limit') }
        .to raise_error(Reports::Errors::ValidationError, /limit must be an integer/)
      expect { harness.coerce_integer('500', 'limit', max: 100) }
        .to raise_error(Reports::Errors::ValidationError, /must not exceed 100/)
    end

    it 'coerces UUIDs' do
      uuid = 'b47dcd29-cff0-5bd0-b7dd-03def1acf3b2'
      expect(harness.coerce_uuid(uuid, 'areaId')).to eq(uuid)
      expect(harness.coerce_uuid(nil, 'areaId')).to be_nil
      expect { harness.coerce_uuid('nope', 'areaId') }
        .to raise_error(Reports::Errors::ValidationError, /must be a UUID/)
    end

    it 'coerces enums against the CONTRACT §3 values' do
      expect(harness.coerce_enum('villa', 'propertyType',
                                 Reports::Helpers::Params::PROPERTY_TYPES)).to eq('villa')
      expect(harness.coerce_enum('rent', 'saleType',
                                 Reports::Helpers::Params::SALE_TYPES)).to eq('rent')
      expect { harness.coerce_enum('castle', 'propertyType', Reports::Helpers::Params::PROPERTY_TYPES) }
        .to raise_error(Reports::Errors::ValidationError, /must be one of/)
    end

    it 'coerces an inclusive UTC date range' do
      from, to = harness.coerce_time_range('2026-01-01', '2026-03-31')
      expect(from).to eq(Time.utc(2026, 1, 1, 0, 0, 0))
      expect(to).to eq(Time.utc(2026, 3, 31, 23, 59, 59))
    end

    it 'rejects an inverted range' do
      expect { harness.coerce_time_range('2026-06-01', '2026-01-01') }
        .to raise_error(Reports::Errors::ValidationError, /must not be after/)
    end

    it 'defaults pagination to page 1 / limit 20 and caps the limit at 100' do
      expect(ParamsHarness.new({}).pagination).to eq([1, 20])
      expect(ParamsHarness.new('page' => '3', 'limit' => '50').pagination).to eq([3, 50])
      expect { ParamsHarness.new('limit' => '500').pagination }
        .to raise_error(Reports::Errors::ValidationError)
    end

    it 'coerces booleans' do
      expect(harness.coerce_boolean('true')).to be(true)
      expect(harness.coerce_boolean('1')).to be(true)
      expect(harness.coerce_boolean('no')).to be(false)
      expect(harness.coerce_boolean(nil, default: true)).to be(true)
    end
  end
end
