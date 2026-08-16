# frozen_string_literal: true

require 'uri'
require_relative 'version'
require_relative 'errors'

module Reports
  # Environment loading + validation.
  #
  # Every name here comes from CONTRACT §7 / .env.example. The only additional
  # names are the optional `REPORTS_*` tuning knobs, which all have defaults so
  # `docker compose up` works with an untouched `.env`.
  module Config
    DEFAULTS = {
      'APP_ENV' => 'development',
      'PORT' => '4567',
      'FRONTEND_URL' => 'https://localhost',
      'DATABASE_URL' => 'postgresql://nawy:nawy_password@postgres:5432/nawy?schema=public',
      'MONGO_URI' => 'mongodb://mongo:27017/nawy',
      'REDIS_URL' => 'redis://redis:6379',
      'REDIS_TTL_DEFAULT' => '300',
      'JWT_ISSUER' => 'nawy-api',
      'JWT_AUDIENCE' => 'nawy-clients',
      'LOG_LEVEL' => 'info',
      # --- service-local tuning (optional, documented in README) ---
      'REPORTS_MARKET_CACHE_TTL' => '300',
      'REPORTS_BROCHURE_CACHE_TTL' => '600',
      'REPORTS_MAINTENANCE_PERCENT' => '8',
      'REPORTS_EXPORT_MAX_ROWS' => '100000',
      'REPORTS_EXPORT_BATCH_SIZE' => '500',
      'REPORTS_IMAGE_TIMEOUT' => '4',
      'REPORTS_IMAGE_MAX_BYTES' => '4194304',
      'REPORTS_PG_POOL_SIZE' => '5',
      'REPORTS_RATE_LIMIT_ENABLED' => 'true'
    }.freeze

    # Present in every deployment; validated at boot so we fail loudly instead
    # of 500-ing on the first request.
    REQUIRED = %w[JWT_ACCESS_SECRET DATABASE_URL MONGO_URI REDIS_URL FRONTEND_URL].freeze

    MIN_SECRET_LENGTH = 32

    class << self
      def source
        @source ||= ENV
      end

      # Test seam: `Reports::Config.reset!(ENV.to_h.merge('APP_ENV' => 'test'))`
      def reset!(source = ENV)
        @source = source
        @cache = {}
        self
      end

      def cache
        @cache ||= {}
      end

      def fetch(key)
        cache.fetch(key) do
          raw = source[key]
          raw = DEFAULTS[key] if raw.nil? || raw.to_s.strip.empty?
          cache[key] = raw
        end
      end

      def fetch_int(key)
        value = fetch(key)
        Integer(value.to_s, 10)
      rescue ArgumentError, TypeError
        Integer(DEFAULTS.fetch(key, '0'), 10)
      end

      def fetch_bool(key)
        %w[1 true yes on].include?(fetch(key).to_s.strip.downcase)
      end

      # --- runtime ----------------------------------------------------------
      def app_env
        (source['APP_ENV'] || source['RACK_ENV'] || source['NODE_ENV'] || DEFAULTS['APP_ENV']).to_s
      end

      def production?  = app_env == 'production'
      def development? = app_env == 'development'
      def test?        = app_env == 'test'

      def port = fetch_int('PORT')
      def log_level = fetch('LOG_LEVEL').to_s.downcase

      # --- urls -------------------------------------------------------------
      def frontend_url  = fetch('FRONTEND_URL').to_s.sub(%r{/+\z}, '')
      def s3_public_base_url = source['S3_PUBLIC_BASE_URL'].to_s.sub(%r{/+\z}, '')

      def cors_origins
        extra = source['REPORTS_EXTRA_CORS_ORIGINS'].to_s.split(',').map { |o| o.strip.sub(%r{/+\z}, '') }
        ([frontend_url] + extra).reject(&:empty?).uniq
      end

      # Hosts allowed in the `Host` header. Sinatra 4 rejects anything not
      # listed with a bare "Host not permitted", which silently breaks every
      # container-to-container call: inside compose the other services reach
      # this one as `http://reports-svc:4567`, not through the frontend URL.
      def permitted_hosts
        extra = source['REPORTS_PERMITTED_HOSTS'].to_s.split(',').map(&:strip)
        frontend_host = begin
          URI(frontend_url).host
        rescue URI::InvalidURIError
          nil
        end

        # Rack::Test dials `example.org`, and a test run has no threat model
        # worth defending against; an empty list disables the check entirely.
        return [] if test?

        (%w[localhost 127.0.0.1 [::1] reports-svc] + [frontend_host] + extra)
          .compact.reject(&:empty?).uniq
      end

      # --- data stores ------------------------------------------------------
      def database_url = fetch('DATABASE_URL')
      def mongo_uri    = fetch('MONGO_URI')
      def redis_url    = fetch('REDIS_URL')
      def redis_ttl_default = fetch_int('REDIS_TTL_DEFAULT')
      def pg_pool_size = fetch_int('REPORTS_PG_POOL_SIZE')

      def mongo_database
        path = URI.parse(mongo_uri).path.to_s.delete_prefix('/')
        path.empty? ? 'nawy' : path.split('?').first
      rescue URI::InvalidURIError
        'nawy'
      end

      # --- auth -------------------------------------------------------------
      def jwt_access_secret = fetch('JWT_ACCESS_SECRET').to_s
      def jwt_issuer        = fetch('JWT_ISSUER').to_s
      def jwt_audience      = fetch('JWT_AUDIENCE').to_s
      def internal_service_token = source['INTERNAL_SERVICE_TOKEN'].to_s

      # --- report tuning ----------------------------------------------------
      def market_cache_ttl    = fetch_int('REPORTS_MARKET_CACHE_TTL')
      def brochure_cache_ttl  = fetch_int('REPORTS_BROCHURE_CACHE_TTL')
      def maintenance_percent = fetch('REPORTS_MAINTENANCE_PERCENT').to_s
      def export_max_rows     = fetch_int('REPORTS_EXPORT_MAX_ROWS')
      def export_batch_size   = fetch_int('REPORTS_EXPORT_BATCH_SIZE')
      def image_timeout       = fetch_int('REPORTS_IMAGE_TIMEOUT')
      def image_max_bytes     = fetch_int('REPORTS_IMAGE_MAX_BYTES')
      def rate_limit_enabled? = fetch_bool('REPORTS_RATE_LIMIT_ENABLED')

      # --- validation -------------------------------------------------------
      # Raises Errors::ConfigError listing *every* problem at once.
      def validate!
        problems = []

        REQUIRED.each do |key|
          value = key == 'JWT_ACCESS_SECRET' ? source[key] : fetch(key)
          problems << { field: key, message: 'is required' } if value.nil? || value.to_s.strip.empty?
        end

        secret = source['JWT_ACCESS_SECRET'].to_s
        if !secret.empty? && secret.length < MIN_SECRET_LENGTH
          problems << { field: 'JWT_ACCESS_SECRET',
                        message: "must be at least #{MIN_SECRET_LENGTH} characters" }
        end

        %w[DATABASE_URL MONGO_URI REDIS_URL].each do |key|
          value = fetch(key).to_s
          next if value.empty?

          begin
            URI.parse(value)
          rescue URI::InvalidURIError
            problems << { field: key, message: 'is not a valid URI' }
          end
        end

        return true if problems.empty?

        raise Errors::ConfigError.new(
          "Invalid configuration: #{problems.map { |p| "#{p[:field]} #{p[:message]}" }.join(', ')}",
          details: problems
        )
      end

      # Non-secret snapshot, safe to log at boot.
      def summary
        {
          service: Reports::SERVICE_NAME,
          version: Reports::VERSION,
          appEnv: app_env,
          port: port,
          frontendUrl: frontend_url,
          mongoDatabase: mongo_database,
          jwtIssuer: jwt_issuer,
          jwtAudience: jwt_audience,
          marketCacheTtl: market_cache_ttl,
          brochureCacheTtl: brochure_cache_ttl,
          rateLimitEnabled: rate_limit_enabled?
        }
      end
    end
  end
end
