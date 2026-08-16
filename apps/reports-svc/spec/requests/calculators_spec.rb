# frozen_string_literal: true

RSpec.describe 'Calculator endpoints', type: :request do
  describe 'POST /api/reports/mortgage/calculate' do
    it 'returns the amortisation in the success envelope' do
      post_json '/api/reports/mortgage/calculate',
                { price: 125_000, downPaymentPercent: 20, years: 1, annualRatePercent: 12 }

      expect(last_response.status).to eq(200)
      expect(last_response.headers['content-type']).to include('application/json')
      expect(json_response['success']).to be(true)

      data = json_response['data']
      expect(data['currency']).to eq('EGP')
      expect(data.dig('summary', 'monthlyPayment')).to eq(8884.88)
      expect(data.dig('summary', 'principal')).to eq(100_000.0)
      expect(data.dig('summary', 'totalInterest')).to eq(6618.53)
      expect(data['schedule'].length).to eq(12)
      expect(data['schedule'].first).to include('month' => 1, 'payment' => 8884.88)
      expect(data['yearly'].first).to include('year' => 1, 'payments' => 12)
    end

    it 'accepts snake_case keys as well' do
      post_json '/api/reports/mortgage/calculate',
                { price: 125_000, down_payment_percent: 20, years: 1, annual_rate_percent: 12 }

      expect(last_response.status).to eq(200)
      expect(json_response.dig('data', 'summary', 'monthlyPayment')).to eq(8884.88)
    end

    it 'can omit the schedule' do
      post_json '/api/reports/mortgage/calculate',
                { price: 125_000, downPaymentPercent: 20, years: 1, annualRatePercent: 12,
                  includeSchedule: false }

      expect(json_response['data']).not_to have_key('schedule')
      expect(json_response['data']).to have_key('yearly')
    end

    it 'handles a 0% rate without dividing by zero' do
      post_json '/api/reports/mortgage/calculate',
                { price: 1_200_000, downPaymentPercent: 0, years: 10, annualRatePercent: 0 }

      expect(last_response.status).to eq(200)
      expect(json_response.dig('data', 'summary', 'monthlyPayment')).to eq(10_000.0)
      expect(json_response.dig('data', 'summary', 'totalInterest')).to eq(0.0)
    end

    it 'maps a validation failure to 422 / VALIDATION_ERROR' do
      post_json '/api/reports/mortgage/calculate',
                { price: -5, downPaymentPercent: 20, years: 1, annualRatePercent: 12 }

      expect(last_response.status).to eq(422)
      expect(json_response['success']).to be(false)
      expect(error_code).to eq('VALIDATION_ERROR')
      expect(json_response.dig('error', 'details')).to eq(
        [{ 'field' => 'price', 'message' => 'must be greater than zero' }]
      )
    end

    it 'rejects a down payment over 100%' do
      post_json '/api/reports/mortgage/calculate',
                { price: 1_000_000, downPaymentPercent: 150, years: 5, annualRatePercent: 10 }

      expect(last_response.status).to eq(422)
      expect(json_response.dig('error', 'details', 0, 'field')).to eq('downPaymentPercent')
    end

    it 'rejects years <= 0' do
      post_json '/api/reports/mortgage/calculate',
                { price: 1_000_000, downPaymentPercent: 10, years: 0, annualRatePercent: 10 }

      expect(last_response.status).to eq(422)
      expect(json_response.dig('error', 'details', 0, 'field')).to eq('years')
    end

    it 'rejects a malformed JSON body' do
      post '/api/reports/mortgage/calculate', '{not json', 'CONTENT_TYPE' => 'application/json'

      expect(last_response.status).to eq(400)
      expect(error_code).to eq('INVALID_JSON')
    end

    it 'rejects a missing body' do
      post '/api/reports/mortgage/calculate', '', 'CONTENT_TYPE' => 'application/json'

      expect(last_response.status).to eq(422)
      expect(error_code).to eq('VALIDATION_ERROR')
    end
  end

  describe 'POST /api/reports/installment/schedule' do
    it 'returns the developer plan with a maintenance deposit' do
      post_json '/api/reports/installment/schedule',
                { price: 8_500_000, downPaymentPercent: 10, years: 8,
                  deliveryDate: '2027-06-30', startDate: '2026-08-14' }

      expect(last_response.status).to eq(200)
      data = json_response['data']

      expect(data.dig('summary', 'downPayment')).to eq(850_000.0)
      expect(data.dig('summary', 'installmentsCount')).to eq(32)
      expect(data.dig('summary', 'installmentAmount')).to eq(239_062.5)
      expect(data.dig('summary', 'maintenanceDeposit')).to eq(680_000.0)
      expect(data.dig('summary', 'totalPaid')).to eq(9_180_000.0)
      expect(data.dig('input', 'frequency')).to eq('quarterly')

      first = data['schedule'].first
      expect(first).to include('type' => 'down_payment', 'dueDate' => '2026-08-14',
                               'cumulativePercent' => 10.0)
      expect(data['schedule'].map { |row| row['type'] }).to include('maintenance')
      expect(data['yearly'].first).to include('year' => 2026)
    end

    it 'supports a monthly frequency' do
      post_json '/api/reports/installment/schedule',
                { price: 1_000_000, downPaymentPercent: 5, years: 1, deliveryDate: '2027-01-31',
                  frequency: 'monthly', startDate: '2026-01-01' }

      expect(json_response.dig('data', 'summary', 'installmentsCount')).to eq(12)
      expect(json_response.dig('data', 'summary', 'installmentAmount')).to eq(79_166.67)
    end

    it 'rejects an unsupported frequency with 422' do
      post_json '/api/reports/installment/schedule',
                { price: 1_000_000, downPaymentPercent: 10, years: 5, deliveryDate: '2027-01-01',
                  frequency: 'weekly' }

      expect(last_response.status).to eq(422)
      expect(json_response.dig('error', 'details', 0, 'field')).to eq('frequency')
    end

    it 'rejects an unparseable delivery date' do
      post_json '/api/reports/installment/schedule',
                { price: 1_000_000, downPaymentPercent: 10, years: 5, deliveryDate: 'someday' }

      expect(last_response.status).to eq(422)
      expect(json_response.dig('error', 'details', 0, 'field')).to eq('deliveryDate')
    end
  end
end
