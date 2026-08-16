# frozen_string_literal: true

module Reports
  module Routes
    # CONTRACT §6:
    #   POST /api/reports/mortgage/calculate   {price, downPaymentPercent, years, annualRatePercent}
    #   POST /api/reports/installment/schedule {price, downPaymentPercent, years, deliveryDate}
    #
    # Both are public (a buyer uses the calculator before signing up) but rate
    # limited. All arithmetic lives in Reports::Finance.
    module CalculatorRoutes
      RATE_LIMIT = 120
      RATE_WINDOW = 60

      def self.registered(app)
        app.post "#{Reports::MOUNT_PATH}/mortgage/calculate" do
          rate_limit!('reports:mortgage', limit: RATE_LIMIT, window: RATE_WINDOW)
          body = json_request_body

          result = Reports::Finance.mortgage(
            price: body_value(body, 'price'),
            down_payment_percent: body_value(body, 'downPaymentPercent'),
            years: body_value(body, 'years'),
            annual_rate_percent: body_value(body, 'annualRatePercent'),
            start_date: body_value(body, 'startDate')
          )

          result = result.reject { |key, _| key == :schedule } unless
            coerce_boolean(body_value(body, 'includeSchedule'), default: true)

          cache_for!(60)
          json_success(result)
        end

        app.post "#{Reports::MOUNT_PATH}/installment/schedule" do
          rate_limit!('reports:installment', limit: RATE_LIMIT, window: RATE_WINDOW)
          body = json_request_body

          result = Reports::Finance.installment_schedule(
            price: body_value(body, 'price'),
            down_payment_percent: body_value(body, 'downPaymentPercent'),
            years: body_value(body, 'years'),
            delivery_date: body_value(body, 'deliveryDate'),
            frequency: body_value(body, 'frequency') || Reports::Finance::DEFAULT_FREQUENCY,
            start_date: body_value(body, 'startDate'),
            maintenance_percent: body_value(body, 'maintenancePercent') ||
                                 Reports::Config.maintenance_percent
          )

          cache_for!(60)
          json_success(result)
        end
      end
    end
  end
end
