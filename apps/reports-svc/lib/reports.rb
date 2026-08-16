# frozen_string_literal: true

# Single entry point for the reports-svc library. `app.rb` requires only this.
require_relative 'version'
require_relative 'errors'
require_relative 'config'
require_relative 'json_codec'
require_relative 'logging'
require_relative 'formatting'
require_relative 'postgres_url'
require_relative 'pg_introspect'
require_relative 'auth'
require_relative 'db'
require_relative 'rate_limiter'
require_relative 'http_fetch'
require_relative 'finance'

require_relative 'middleware/request_id'
require_relative 'middleware/request_logger'

require_relative 'helpers/responses'
require_relative 'helpers/params'
require_relative 'helpers/auth_helpers'

require_relative 'repositories/property_repository'
require_relative 'repositories/lead_repository'
require_relative 'repositories/reference_repository'

require_relative 'pdf/theme'
require_relative 'pdf/brochure_document'

require_relative 'reports/market_report'
require_relative 'reports/brochure'
require_relative 'reports/exports'

module Reports
  # Root namespace. See:
  #   lib/finance.rb                — mortgage + developer instalment engine
  #   lib/reports/market_report.rb  — GET /api/reports/market/summary
  #   lib/reports/brochure.rb       — GET /api/reports/property/:id/brochure.pdf
  #   lib/reports/exports.rb        — GET /api/reports/admin/export/*.csv
  MOUNT_PATH = '/api/reports'
end
