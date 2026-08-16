# frozen_string_literal: true

module Reports
  module Routes
    # CONTRACT §6 (admin only):
    #   GET /api/reports/admin/export/leads.csv
    #   GET /api/reports/admin/export/properties.csv
    #
    # Filters: from, to (inclusive ISO dates), status, areaId — plus propertyId
    # for leads and propertyType / saleType / compoundId / developerId for
    # properties. Responses stream and start with a UTF-8 BOM.
    module ExportRoutes
      RATE_LIMIT = 10
      RATE_WINDOW = 60

      def self.registered(app)
        app.get "#{Reports::MOUNT_PATH}/admin/export/leads.csv" do
          require_admin!
          rate_limit!('reports:export', limit: RATE_LIMIT, window: RATE_WINDOW)

          from, to = coerce_time_range(params['from'], params['to'])
          filters = {
            from: from,
            to: to,
            status: coerce_enum(params['status'], 'status', Reports::Helpers::Params::LEAD_STATUSES),
            area_id: coerce_uuid(params['areaId'], 'areaId'),
            property_id: coerce_uuid(params['propertyId'], 'propertyId')
          }.compact

          # Fail fast (with a JSON error envelope) before the stream opens —
          # once the body starts flowing we can no longer send an error status.
          total = Reports::Repositories::LeadRepository.count(filters)

          attachment!(Reports::Exports.leads_filename(filters), Reports::Exports::CSV_CONTENT_TYPE)
          response.headers['x-total-rows'] = total.to_s
          no_store!

          stream do |out|
            Reports::Exports.stream_leads(filters, out)
          end
        end

        app.get "#{Reports::MOUNT_PATH}/admin/export/properties.csv" do
          require_admin!
          rate_limit!('reports:export', limit: RATE_LIMIT, window: RATE_WINDOW)

          from, to = coerce_time_range(params['from'], params['to'])
          filters = {
            from: from,
            to: to,
            status: coerce_enum(params['status'], 'status', Reports::Helpers::Params::STATUSES),
            area_id: coerce_uuid(params['areaId'], 'areaId'),
            property_type: coerce_enum(params['propertyType'], 'propertyType',
                                       Reports::Helpers::Params::PROPERTY_TYPES),
            sale_type: coerce_enum(params['saleType'], 'saleType',
                                   Reports::Helpers::Params::SALE_TYPES),
            compound_id: coerce_uuid(params['compoundId'], 'compoundId'),
            developer_id: coerce_uuid(params['developerId'], 'developerId')
          }.compact

          total = Reports::Repositories::PropertyRepository.count(filters)

          attachment!(Reports::Exports.properties_filename(filters),
                      Reports::Exports::CSV_CONTENT_TYPE)
          response.headers['x-total-rows'] = total.to_s
          no_store!

          stream do |out|
            Reports::Exports.stream_properties(filters, out)
          end
        end
      end
    end
  end
end
