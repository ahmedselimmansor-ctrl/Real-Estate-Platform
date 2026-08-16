# frozen_string_literal: true

module Reports
  module Routes
    # CONTRACT §6: GET /api/reports/market/summary?areaId=&from=&to=
    module MarketRoutes
      RATE_LIMIT = 60
      RATE_WINDOW = 60

      def self.registered(app)
        app.get "#{Reports::MOUNT_PATH}/market/summary" do
          rate_limit!('reports:market', limit: RATE_LIMIT, window: RATE_WINDOW)

          area_id = coerce_uuid(params['areaId'], 'areaId')
          from, to = coerce_time_range(params['from'], params['to'])
          refresh = coerce_boolean(params['refresh'], default: false)

          summary = Reports::MarketReport.summary(area_id: area_id, from: from, to: to,
                                                  refresh: refresh)

          cache_for!(Reports::Config.market_cache_ttl)
          json_success(summary)
        end
      end
    end
  end
end
