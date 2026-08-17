# frozen_string_literal: true

module Reports
  module Routes
    # CONTRACT §6: GET /api/reports/property/:id/brochure.pdf
    #
    # `:id` accepts the property UUID, its Mongo ObjectId, its slug or its
    # reference number (TC-1042) — whatever the caller has to hand.
    module BrochureRoutes
      RATE_LIMIT = 30
      RATE_WINDOW = 60

      def self.registered(app)
        app.get "#{Reports::MOUNT_PATH}/property/:id/brochure.pdf" do
          rate_limit!('reports:brochure', limit: RATE_LIMIT, window: RATE_WINDOW)

          identifier = params['id'].to_s
          if identifier.strip.empty? || identifier.length > 128
            raise Reports::Errors::ValidationError.field('id', 'must be a property id, slug or reference')
          end

          refresh = coerce_boolean(params['refresh'], default: false)
          result = Reports::Brochure.generate(identifier, refresh: refresh)

          attachment!(result.filename, 'application/pdf')
          response.headers['x-property-id'] = result.property_id.to_s
          response.headers['x-cache'] = result.cached ? 'HIT' : 'MISS'
          cache_for!(Reports::Config.brochure_cache_ttl)
          etag result.etag

          result.bytes
        end
      end
    end
  end
end
