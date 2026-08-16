# frozen_string_literal: true

require 'bigdecimal'

RSpec.describe Reports::Finance do
  describe '.mortgage' do
    # Textbook annuity: EGP 100,000 principal at 1% per month for 12 months
    # amortises at EGP 8,884.88 per month.
    subject(:result) do
      described_class.mortgage(price: 125_000, down_payment_percent: 20, years: 1,
                               annual_rate_percent: 12)
    end

    it 'derives the principal from the down payment' do
      expect(result[:summary][:down_payment]).to eq(25_000.0)
      expect(result[:summary][:principal]).to eq(100_000.0)
    end

    it 'computes the level monthly payment with the standard amortisation formula' do
      expect(result[:summary][:monthly_payment]).to eq(8884.88)
      expect(result[:summary][:months]).to eq(12)
      expect(result[:summary][:monthly_rate]).to eq(0.01)
    end

    it 'reports total interest and total paid consistently' do
      expect(result[:summary][:total_interest]).to eq(6618.53)
      expect(result[:summary][:total_paid]).to eq(106_618.53)
      expect(result[:summary][:total_paid]).to eq(
        (result[:summary][:principal] + result[:summary][:total_interest]).round(2)
      )
      expect(result[:summary][:total_cost]).to eq(131_618.53)
    end

    it 'produces one schedule row per month' do
      expect(result[:schedule].length).to eq(12)
      expect(result[:schedule].first).to include(month: 1, payment: 8884.88, interest: 1000.0,
                                                 principal: 7884.88, balance: 92_115.12)
    end

    it 'absorbs rounding in the final payment so the balance lands exactly on zero' do
      last = result[:schedule].last
      expect(last[:month]).to eq(12)
      expect(last[:balance]).to eq(0.0)
      expect(last[:payment]).to eq(8884.85)
    end

    it 'keeps the sum of principal components equal to the principal' do
      total_principal = result[:schedule].sum { |row| row[:principal] }
      expect(total_principal.round(2)).to eq(100_000.0)
    end

    it 'keeps the sum of payments equal to total paid' do
      total = result[:schedule].sum { |row| row[:payment] }
      expect(total.round(2)).to eq(result[:summary][:total_paid])
    end

    it 'rolls the schedule up by year' do
      expect(result[:yearly]).to eq(
        [{ year: 1, payments: 12, paid: 106_618.53, interest: 6618.53,
           principal: 100_000.0, closing_balance: 0.0 }]
      )
    end

    it 'rounds every money figure to piastres (2 decimals)' do
      values = result[:schedule].flat_map { |row| row.values_at(:payment, :interest, :principal, :balance) }
      values.each do |value|
        expect(BigDecimal(value.to_s).round(2)).to eq(BigDecimal(value.to_s))
      end
    end

    context 'with a 20 year Egyptian bank rate' do
      subject(:long) do
        described_class.mortgage(price: 5_000_000, down_payment_percent: 20, years: 20,
                                 annual_rate_percent: 18)
      end

      it 'amortises 240 months' do
        expect(long[:summary][:months]).to eq(240)
        expect(long[:schedule].length).to eq(240)
        expect(long[:yearly].length).to eq(20)
      end

      it 'computes the known-good monthly payment' do
        expect(long[:summary][:monthly_payment]).to eq(61_732.46)
      end

      it 'charges the first month r × principal in interest' do
        expect(long[:schedule].first[:interest]).to eq(60_000.0)
      end

      it 'closes at a zero balance' do
        expect(long[:schedule].last[:balance]).to eq(0.0)
        expect(long[:yearly].last[:closing_balance]).to eq(0.0)
      end
    end

    context 'with a 0% interest rate' do
      subject(:interest_free) do
        described_class.mortgage(price: 1_200_000, down_payment_percent: 0, years: 10,
                                 annual_rate_percent: 0)
      end

      it 'does not divide by zero and splits the principal evenly' do
        expect(interest_free[:summary][:monthly_payment]).to eq(10_000.0)
        expect(interest_free[:summary][:total_interest]).to eq(0.0)
        expect(interest_free[:summary][:total_paid]).to eq(1_200_000.0)
      end

      it 'still lands on a zero balance' do
        expect(interest_free[:schedule].last[:balance]).to eq(0.0)
        expect(interest_free[:schedule].length).to eq(120)
      end
    end

    context 'when a start date is supplied' do
      subject(:dated) do
        described_class.mortgage(price: 1_000_000, down_payment_percent: 0, years: 1,
                                 annual_rate_percent: 12, start_date: '2026-01-31')
      end

      it 'dates every instalment one month apart' do
        expect(dated[:schedule].first[:due_date]).to eq(Date.new(2026, 2, 28))
        expect(dated[:schedule].last[:due_date]).to eq(Date.new(2027, 1, 31))
      end
    end

    it 'accepts numeric strings' do
      from_strings = described_class.mortgage(price: '125000', down_payment_percent: '20',
                                              years: '1', annual_rate_percent: '12')
      expect(from_strings[:summary][:monthly_payment]).to eq(8884.88)
    end

    describe 'validation' do
      it 'rejects a negative price' do
        expect do
          described_class.mortgage(price: -1, down_payment_percent: 10, years: 5,
                                   annual_rate_percent: 10)
        end.to raise_error(Reports::Finance::CalculationError) { |error|
          expect(error.status).to eq(422)
          expect(error.code).to eq('VALIDATION_ERROR')
          expect(error.details).to eq([{ field: 'price', message: 'must be greater than zero' }])
        }
      end

      it 'rejects a zero price' do
        expect do
          described_class.mortgage(price: 0, down_payment_percent: 10, years: 5, annual_rate_percent: 10)
        end.to raise_error(Reports::Finance::CalculationError, /price must be greater than zero/)
      end

      it 'rejects a down payment above 100%' do
        expect do
          described_class.mortgage(price: 1_000_000, down_payment_percent: 101, years: 5,
                                   annual_rate_percent: 10)
        end.to raise_error(Reports::Finance::CalculationError, /downPaymentPercent/)
      end

      it 'rejects a down payment that leaves nothing to finance' do
        expect do
          described_class.mortgage(price: 1_000_000, down_payment_percent: 100, years: 5,
                                   annual_rate_percent: 10)
        end.to raise_error(Reports::Finance::CalculationError, /leaves nothing to finance/)
      end

      it 'rejects zero or negative years' do
        expect do
          described_class.mortgage(price: 1_000_000, down_payment_percent: 10, years: 0,
                                   annual_rate_percent: 10)
        end.to raise_error(Reports::Finance::CalculationError, /years must be greater than zero/)

        expect do
          described_class.mortgage(price: 1_000_000, down_payment_percent: 10, years: -3,
                                   annual_rate_percent: 10)
        end.to raise_error(Reports::Finance::CalculationError, /years must be greater than zero/)
      end

      it 'rejects a term beyond the supported ceiling' do
        expect do
          described_class.mortgage(price: 1_000_000, down_payment_percent: 10, years: 41,
                                   annual_rate_percent: 10)
        end.to raise_error(Reports::Finance::CalculationError, /must not exceed 40/)
      end

      it 'rejects a negative interest rate' do
        expect do
          described_class.mortgage(price: 1_000_000, down_payment_percent: 10, years: 5,
                                   annual_rate_percent: -1)
        end.to raise_error(Reports::Finance::CalculationError, /annualRatePercent must not be negative/)
      end

      it 'rejects non-numeric input' do
        expect do
          described_class.mortgage(price: 'a lot', down_payment_percent: 10, years: 5,
                                   annual_rate_percent: 10)
        end.to raise_error(Reports::Finance::CalculationError, /price must be a number/)
      end

      it 'rejects missing input' do
        expect do
          described_class.mortgage(price: nil, down_payment_percent: 10, years: 5,
                                   annual_rate_percent: 10)
        end.to raise_error(Reports::Finance::CalculationError, /price is required/)
      end

      it 'rejects fractional years' do
        expect do
          described_class.mortgage(price: 1_000_000, down_payment_percent: 10, years: 5.5,
                                   annual_rate_percent: 10)
        end.to raise_error(Reports::Finance::CalculationError, /whole number of years/)
      end
    end
  end

  describe '.level_payment' do
    it 'matches the annuity formula' do
      payment = described_class.level_payment(BigDecimal('100000'), BigDecimal('0.01'), 12)
      expect(payment.to_f).to eq(8884.88)
    end

    it 'divides evenly when the rate is zero' do
      payment = described_class.level_payment(BigDecimal('120000'), BigDecimal('0'), 12)
      expect(payment.to_f).to eq(10_000.0)
    end
  end

  describe '.installment_schedule' do
    subject(:plan) do
      described_class.installment_schedule(price: 8_500_000, down_payment_percent: 10, years: 8,
                                           delivery_date: '2027-06-30', start_date: '2026-08-14')
    end

    it 'defaults to quarterly instalments, the Egyptian primary-sale norm' do
      expect(plan[:input][:frequency]).to eq('quarterly')
      expect(plan[:summary][:installments_per_year]).to eq(4)
      expect(plan[:summary][:installments_count]).to eq(32)
    end

    it 'splits the balance into equal instalments' do
      expect(plan[:summary][:down_payment]).to eq(850_000.0)
      expect(plan[:summary][:remaining]).to eq(7_650_000.0)
      expect(plan[:summary][:installment_amount]).to eq(239_062.5)
      expect(plan[:summary][:monthly_equivalent]).to eq(79_687.5)
    end

    it 'adds an 8% maintenance deposit on the delivery date' do
      maintenance = plan[:schedule].find { |row| row[:type] == 'maintenance' }
      expect(maintenance[:amount]).to eq(680_000.0)
      expect(maintenance[:due_date]).to eq(Date.new(2027, 6, 30))
      expect(plan[:summary][:maintenance_percent]).to eq(8)
    end

    it 'dates the down payment at the contract date and instalments every three months' do
      down = plan[:schedule].first
      expect(down[:type]).to eq('down_payment')
      expect(down[:due_date]).to eq(Date.new(2026, 8, 14))

      first_installment = plan[:schedule].find { |row| row[:type] == 'installment' }
      expect(first_installment[:due_date]).to eq(Date.new(2026, 11, 14))
      expect(plan[:summary][:last_due_date]).to eq(Date.new(2034, 8, 14))
    end

    it 'tracks the cumulative percentage of the unit price' do
      expect(plan[:schedule].first[:cumulative_percent]).to eq(10.0)
      last_installment = plan[:schedule].select { |row| row[:type] == 'installment' }.last
      expect(last_installment[:cumulative_percent]).to eq(100.0)
    end

    it 'totals the unit price plus the maintenance deposit' do
      expect(plan[:summary][:total_paid]).to eq(9_180_000.0)
      expect(plan[:schedule].sum { |row| row[:amount] }.round(2)).to eq(9_180_000.0)
    end

    it 'rolls the plan up by calendar year' do
      expect(plan[:yearly].first).to eq(year: 2026, payments: 2, paid: 1_089_062.5,
                                        cumulative_percent: 12.81)
      expect(plan[:yearly].sum { |row| row[:paid] }.round(2)).to eq(9_180_000.0)
    end

    context 'when the balance does not divide evenly' do
      subject(:uneven) do
        described_class.installment_schedule(price: 1_000_000, down_payment_percent: 5, years: 1,
                                             delivery_date: '2027-01-31', frequency: 'monthly',
                                             start_date: '2026-01-01')
      end

      it 'absorbs the remainder in the final instalment' do
        installments = uneven[:schedule].select { |row| row[:type] == 'installment' }
        expect(installments.first[:amount]).to eq(79_166.67)
        expect(installments.last[:amount]).to eq(79_166.63)
        expect(installments.sum { |row| row[:amount] }.round(2)).to eq(950_000.0)
      end

      it 'still reaches exactly 100% of the unit price' do
        expect(uneven[:schedule].select { |r| r[:type] == 'installment' }.last[:cumulative_percent])
          .to eq(100.0)
      end
    end

    it 'supports semi-annual and annual frequencies' do
      semi = described_class.installment_schedule(price: 4_000_000, down_payment_percent: 20,
                                                  years: 5, frequency: 'semi_annual',
                                                  start_date: '2026-01-01')
      expect(semi[:summary][:installments_count]).to eq(10)
      expect(semi[:summary][:installment_amount]).to eq(320_000.0)

      annual = described_class.installment_schedule(price: 4_000_000, down_payment_percent: 20,
                                                    years: 5, frequency: 'annual',
                                                    start_date: '2026-01-01')
      expect(annual[:summary][:installments_count]).to eq(5)
      expect(annual[:summary][:installment_amount]).to eq(640_000.0)
    end

    it 'lets the maintenance percentage be overridden' do
      plan = described_class.installment_schedule(price: 1_000_000, down_payment_percent: 10,
                                                  years: 5, maintenance_percent: 10,
                                                  start_date: '2026-01-01')
      expect(plan[:summary][:maintenance_deposit]).to eq(100_000.0)
    end

    it 'omits the maintenance line when the percentage is zero' do
      plan = described_class.installment_schedule(price: 1_000_000, down_payment_percent: 10,
                                                  years: 5, maintenance_percent: 0,
                                                  start_date: '2026-01-01')
      expect(plan[:schedule].map { |row| row[:type] }).not_to include('maintenance')
      expect(plan[:summary][:total_paid]).to eq(1_000_000.0)
    end

    it 'falls back to the last instalment date when no delivery date is given' do
      plan = described_class.installment_schedule(price: 1_000_000, down_payment_percent: 10,
                                                  years: 2, start_date: '2026-01-01')
      maintenance = plan[:schedule].last
      expect(maintenance[:type]).to eq('maintenance')
      expect(maintenance[:due_date]).to eq(Date.new(2028, 1, 1))
    end

    describe 'validation' do
      it 'rejects an unknown frequency' do
        expect do
          described_class.installment_schedule(price: 1_000_000, down_payment_percent: 10,
                                               years: 5, frequency: 'weekly')
        end.to raise_error(Reports::Finance::CalculationError, /frequency must be one of/)
      end

      it 'rejects an unparseable delivery date' do
        expect do
          described_class.installment_schedule(price: 1_000_000, down_payment_percent: 10,
                                               years: 5, delivery_date: 'soon')
        end.to raise_error(Reports::Finance::CalculationError, /deliveryDate must be an ISO date/)
      end

      it 'rejects a negative price' do
        expect do
          described_class.installment_schedule(price: -5, down_payment_percent: 10, years: 5)
        end.to raise_error(Reports::Finance::CalculationError) { |error|
          expect(error.status).to eq(422)
          expect(error.code).to eq('VALIDATION_ERROR')
        }
      end

      it 'rejects a negative down payment' do
        expect do
          described_class.installment_schedule(price: 1_000_000, down_payment_percent: -1, years: 5)
        end.to raise_error(Reports::Finance::CalculationError, /downPaymentPercent/)
      end
    end
  end

  describe 'rounding helpers' do
    it 'rounds half up to piastres' do
      expect(described_class.round_money(BigDecimal('1.005')).to_f).to eq(1.01)
      expect(described_class.round_money(BigDecimal('1.004')).to_f).to eq(1.0)
      expect(described_class.round_money(BigDecimal('-1.005')).to_f).to eq(-1.01)
    end

    it 'renders whole percentages without a decimal tail' do
      expect(described_class.to_number(BigDecimal('10'))).to eq(10)
      expect(described_class.to_number(BigDecimal('12.5'))).to eq(12.5)
    end

    it 'guards against division by zero when computing shares' do
      expect(described_class.percent_of(BigDecimal('5'), BigDecimal('0'))).to eq(0.0)
      expect(described_class.ratio(BigDecimal('5'), BigDecimal('0'))).to eq(0.0)
    end
  end
end
