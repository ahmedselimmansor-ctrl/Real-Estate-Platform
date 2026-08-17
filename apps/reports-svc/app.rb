# frozen_string_literal: true

# =============================================================================
# topchoice / reports-svc
#
# Ruby 3.3 + Sinatra. Mounted behind nginx at /api/reports (CONTRACT §1).
# JSON in, JSON (or PDF / CSV) out; envelopes per CONTRACT §4; JWT verification
# per CONTRACT §5.
# =============================================================================

require 'sinatra/base'
require 'rack/deflater'
require 'rack/cors'
require 'json'

begin
  require 'dotenv'
  # Only used for local `bundle exec puma` runs — in docker compose the values
  # arrive through env_file.
  Dotenv.load(File.expand_path('.env', __dir__), File.expand_path('../../.env', __dir__))
rescue LoadError, StandardError
  nil
end

require_relative 'lib/reports'

require_relative 'routes/health_routes'
require_relative 'routes/calculator_routes'
require_relative 'routes/market_routes'
require_relative 'routes/brochure_routes'
require_relative 'routes/export_routes'

module Reports
  class App < Sinatra::Base
    # --- settings ---------------------------------------------------------
    set :environment, Reports::Config.app_env.to_sym
    set :root, __dir__
    set :show_exceptions, false
    set :raise_errors, false
    set :dump_errors, false
    set :logging, false
    set :static, false
    set :sessions, false
    # Our errors carry a SCREAMING_SNAKE `code`; Sinatra must not mistake it for
    # an HTTP status.
    set :use_code, false
    set :default_content_type, 'application/json'
    # rack-protection: keep the origin check but let the configured frontend
    # talk to the service directly (the BFF normally proxies through nginx).
    set :protection, except: %i[json_csrf], origin_whitelist: Reports::Config.cors_origins
    # Sinatra 4 host authorization: without this the internal hostname other
    # containers dial (`reports-svc`) is answered with 403 "Host not permitted".
    set :host_authorization, { permitted_hosts: Reports::Config.permitted_hosts }
    set :add_charset, [%r{^text/}, 'application/json']

    # --- middleware -------------------------------------------------------
    # PDFs are already compressed and CSV exports are streamed, so both skip
    # the deflater.
    use Rack::Deflater, if: lambda { |_env, _status, headers, _body|
      type = (headers['content-type'] || headers['Content-Type']).to_s
      !type.start_with?('application/pdf') && !type.start_with?('text/csv')
    }

    use Rack::Cors do
      allow do
        origins(*Reports::Config.cors_origins)
        resource '*',
                 headers: :any,
                 methods: %i[get post options head],
                 expose: ['X-Request-Id', 'Content-Disposition', 'X-Total-Rows', 'X-Cache',
                          'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
                 max_age: 600
      end
    end

    use Reports::Middleware::RequestId
    use Reports::Middleware::RequestLogger

    # --- helpers ----------------------------------------------------------
    helpers Reports::Helpers::Responses
    helpers Reports::Helpers::Params
    helpers Reports::Helpers::AuthHelpers

    before do
      # Security headers (CONTRACT §10.5 — helmet-equivalent for a JSON API).
      headers 'x-content-type-options' => 'nosniff',
              'x-frame-options' => 'DENY',
              'referrer-policy' => 'no-referrer',
              'x-request-id' => request_id.to_s
    end

    # --- routes -----------------------------------------------------------
    register Reports::Routes::HealthRoutes
    register Reports::Routes::CalculatorRoutes
    register Reports::Routes::MarketRoutes
    register Reports::Routes::BrochureRoutes
    register Reports::Routes::ExportRoutes

    # Service descriptor — handy when poking the container directly.
    get Reports::MOUNT_PATH do
      json_success({
        service: Reports::SERVICE_NAME,
        version: Reports::VERSION,
        endpoints: [
          'GET  /api/reports/property/:id/brochure.pdf',
          'GET  /api/reports/market/summary?areaId=&from=&to=',
          'POST /api/reports/mortgage/calculate',
          'POST /api/reports/installment/schedule',
          'GET  /api/reports/admin/export/leads.csv',
          'GET  /api/reports/admin/export/properties.csv',
          'GET  /api/reports/health'
        ]
      })
    end

    # --- error handling (CONTRACT §4) -------------------------------------
    not_found do
      # Sinatra runs `not_found` for 404s raised by the router.
      json_error(
        code: 'NOT_FOUND',
        message: "No route matches #{request.request_method} #{request.path_info}.",
        status: 404
      )
    end

    error Reports::Errors::AppError do
      error = env['sinatra.error']
      if error.status >= 500
        Reports::Logging.exception('request.app_error', error, path: request.path_info)
      else
        Reports::Logging.warn('request.rejected', code: error.code, status: error.status,
                                                  path: request.path_info, message: error.message)
      end
      error_from(error)
    end

    error JSON::ParserError do
      json_error(code: 'INVALID_JSON', message: 'Request body must be valid JSON.', status: 400)
    end

    error Mongo::Error do
      error = env['sinatra.error']
      Reports::Logging.exception('request.mongo_error', error, path: request.path_info)
      json_error(code: 'SERVICE_UNAVAILABLE', message: 'The listings database is unavailable.',
                 status: 503)
    end

    error PG::Error do
      error = env['sinatra.error']
      Reports::Logging.exception('request.postgres_error', error, path: request.path_info)
      json_error(code: 'SERVICE_UNAVAILABLE', message: 'The relational database is unavailable.',
                 status: 503)
    end

    # Catch-all: never leak a backtrace or an internal message in production.
    error StandardError do
      error = env['sinatra.error']
      Reports::Logging.exception('request.unhandled_error', error, path: request.path_info)

      details = if Reports::Config.production?
                  []
                else
                  [{ field: error.class.name, message: error.message.to_s[0, 500] }]
                end

      json_error(
        code: 'INTERNAL_ERROR',
        message: 'The server encountered an unexpected condition.',
        status: 500,
        details: details
      )
    end

    # --- boot -------------------------------------------------------------
    configure do
      Reports::Config.validate!
      Reports::Logging.info('service.boot', **Reports::Config.summary)
    rescue Reports::Errors::ConfigError => e
      Reports::Logging.error('service.misconfigured', errorMessage: e.message, details: e.details)
      raise
    end
  end
end
