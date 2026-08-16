# frozen_string_literal: true

require 'bigdecimal'

RSpec.describe Reports::JsonCodec do
  describe '.normalize' do
    it 'camelCases symbol keys and leaves string keys alone' do
      normalized = described_class.normalize(avg_price: 1, 'by-month' => { total_count: 2 })
      expect(normalized).to eq('avgPrice' => 1, 'by-month' => { 'totalCount' => 2 })
    end

    it 'leaves month buckets like "2026-01" untouched as string keys' do
      expect(described_class.normalize('2026-01' => 4)).to eq('2026-01' => 4)
    end

    it 'converts BigDecimal to Float' do
      expect(described_class.normalize(price: BigDecimal('8884.88'))).to eq('price' => 8884.88)
    end

    it 'converts times and dates to ISO-8601' do
      normalized = described_class.normalize(
        at: Time.utc(2026, 8, 14, 10, 30, 0),
        on: Date.new(2027, 6, 30)
      )
      expect(normalized['at']).to eq('2026-08-14T10:30:00.000Z')
      expect(normalized['on']).to eq('2027-06-30')
    end

    it 'stringifies symbol values' do
      expect(described_class.normalize(status: :ok)).to eq('status' => 'ok')
    end

    it 'walks arrays' do
      expect(described_class.normalize([{ a_b: 1 }])).to eq([{ 'aB' => 1 }])
    end

    it 'round-trips through JSON unchanged (so cached and fresh payloads match)' do
      payload = { avg_price: BigDecimal('12.5'), buckets: [{ property_type: 'villa', count: 3 }] }
      once = described_class.normalize(payload)
      twice = described_class.normalize(JSON.parse(JSON.generate(once)))
      expect(twice).to eq(once)
    end
  end

  describe '.camelize' do
    it 'converts snake_case and kebab-case' do
      expect(described_class.camelize('avg_price_per_meter')).to eq('avgPricePerMeter')
      expect(described_class.camelize('down-payment')).to eq('downPayment')
    end

    it 'leaves single words and camelCase alone' do
      expect(described_class.camelize('price')).to eq('price')
      expect(described_class.camelize('avgPrice')).to eq('avgPrice')
    end
  end

  describe 'envelopes (CONTRACT §4)' do
    it 'builds the success envelope' do
      expect(described_class.success_envelope({ total_count: 3 }))
        .to eq('success' => true, 'data' => { 'totalCount' => 3 })
    end

    it 'includes meta only when present' do
      envelope = described_class.success_envelope([], meta: { page: 1, limit: 20, total: 0 })
      expect(envelope['meta']).to eq('page' => 1, 'limit' => 20, 'total' => 0)
    end

    it 'builds the error envelope with a SCREAMING_SNAKE code and details array' do
      envelope = described_class.error_envelope(
        code: 'PROPERTY_NOT_FOUND', message: 'Property not found.',
        details: [{ field: 'id', message: 'unknown' }]
      )
      expect(envelope).to eq(
        'success' => false,
        'error' => {
          'code' => 'PROPERTY_NOT_FOUND',
          'message' => 'Property not found.',
          'details' => [{ 'field' => 'id', 'message' => 'unknown' }]
        }
      )
    end

    it 'always emits an array of details' do
      expect(described_class.error_envelope(code: 'X', message: 'y')['error']['details']).to eq([])
    end
  end
end
