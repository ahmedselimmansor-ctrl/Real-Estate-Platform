# frozen_string_literal: true

require 'pg'
require 'mongo'
require 'redis'
require 'connection_pool'
require 'digest'
require 'json'

require_relative 'config'
require_relative 'errors'
require_relative 'logging'
require_relative 'postgres_url'
require_relative 'json_codec'

module Reports
  # Lazily-connected, retrying data-store clients.
  #
  #   Reports::DB.postgres { |conn| conn.exec_params(...) }
  #   Reports::DB.mongo[:properties].find(...)
  #   Reports::DB.redis.get('...')
  #   Reports::DB.cache('cache:list:abc', 300) { expensive_hash }
  #
  # reports-svc is a READ-ONLY consumer of Postgres and Mongo (CONTRACT §2) —
  # nothing here writes business data.
  module DB
    CONNECT_ATTEMPTS = 3
    RETRY_BACKOFF    = [0.2, 0.6, 1.4].freeze

    class << self
      # --- Postgres -------------------------------------------------------
      def pg_pool
        @pg_pool ||= begin
          parsed = PostgresUrl.parse(Config.database_url)
          opts        = parsed[:conn_opts]
          search_path = parsed[:search_path]

          ConnectionPool.new(size: Config.pg_pool_size, timeout: 10) do
            with_retry('postgres') do
              conn = PG::Connection.new(**opts)
              # Decode the common types (timestamps, numerics, json) and leave
              # anything else — Prisma enums, citext, … — as a plain string
              # instead of warning about it.
              type_map = PG::BasicTypeMapForResults.new(conn)
              type_map.default_type_map = PG::TypeMapAllStrings.new
              conn.type_map_for_results = type_map
              if search_path && search_path.match?(/\A[a-zA-Z0-9_, ]+\z/)
                conn.exec("SET search_path TO #{search_path}")
              end
              conn
            end
          end
        end
      end

      # Checks the connection out, revives it if the socket died, and always
      # returns it to the pool.
      def postgres
        pg_pool.with do |conn|
          reset_if_broken!(conn)
          yield conn
        end
      rescue PG::Error => e
        raise Errors::DependencyError.new("PostgreSQL is unavailable: #{e.message}")
      end

      # --- MongoDB ---------------------------------------------------------
      def mongo_client
        @mongo_client ||= with_retry('mongo') do
          Mongo::Logger.logger.level = ::Logger::WARN
          Mongo::Client.new(
            Config.mongo_uri,
            server_selection_timeout: 5,
            connect_timeout: 5,
            socket_timeout: 30,
            max_pool_size: Config.pg_pool_size,
            app_name: 'nawy-reports-svc',
            read: { mode: :primary_preferred }
          )
        end
      end

      def mongo
        mongo_client.database
      end

      def properties_collection
        mongo[:properties]
      end

      # --- Redis -----------------------------------------------------------
      def redis
        @redis ||= with_retry('redis') do
          client = Redis.new(
            url: Config.redis_url,
            timeout: 2.0,
            connect_timeout: 2.0,
            reconnect_attempts: 2,
            id: 'nawy-reports-svc'
          )
          client.ping
          client
        end
      end

      # Redis is a cache, never a hard dependency: swallow failures and let the
      # caller fall through to the source of truth. A short circuit breaker
      # keeps a dead Redis from adding reconnect latency to every request.
      REDIS_BREAKER_SECONDS = 5

      def redis_safe
        return nil if redis_breaker_open?

        yield redis
      rescue StandardError => e
        @redis = nil
        @redis_failed_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        Logging.warn('redis.unavailable', error: e.class.name, errorMessage: e.message)
        nil
      end

      def redis_breaker_open?
        return false if @redis_failed_at.nil?

        elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - @redis_failed_at
        return true if elapsed < REDIS_BREAKER_SECONDS

        @redis_failed_at = nil
        false
      end

      # --- caching (CONTRACT §2 key namespaces) ----------------------------
      # Caches the *normalised* JSON payload, so a cache hit and a cache miss
      # serialise to exactly the same bytes.
      def cache(key, ttl)
        cached = redis_safe { |r| r.get(key) }
        if cached
          Logging.debug('cache.hit', key: key)
          return JsonCodec.decode(cached)
        end

        value = JsonCodec.normalize(yield)
        redis_safe { |r| r.set(key, ::JSON.generate(value), ex: ttl) }
        Logging.debug('cache.miss', key: key, ttl: ttl)
        value
      rescue ::JSON::ParserError
        JsonCodec.normalize(yield)
      end

      # Binary-safe variant used for rendered PDFs.
      def cache_bytes(key, ttl)
        cached = redis_safe { |r| r.get(key) }
        if cached && !cached.empty?
          Logging.debug('cache.hit', key: key)
          return cached.dup.force_encoding(Encoding::BINARY)
        end

        bytes = yield
        redis_safe { |r| r.set(key, bytes, ex: ttl) }
        Logging.debug('cache.miss', key: key, ttl: ttl)
        bytes
      end

      def cache_key(namespace, *parts)
        digest = Digest::SHA256.hexdigest(parts.map(&:to_s).join('|'))[0, 24]
        "#{namespace}:#{digest}"
      end

      def delete_cache(*keys)
        redis_safe { |r| r.del(*keys) }
      end

      # --- health ----------------------------------------------------------
      # Shallow ping of each dependency; results memoised briefly so a 15s
      # compose healthcheck never turns into a load test.
      def health(ttl: 5)
        now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        cached = @health_cache
        return cached[:value] if cached && (now - cached[:at]) < ttl

        value = {
          postgres: probe { postgres { |conn| conn.exec('SELECT 1') } },
          mongo: probe { mongo_client.database.command(ping: 1) },
          redis: probe { redis.ping }
        }
        @health_cache = { at: now, value: value }
        value
      end

      def healthy?(deps = health)
        deps.values.all? { |dep| dep[:status] == 'ok' }
      end

      def shutdown!
        @pg_pool&.shutdown { |conn| safely { conn.close } }
        safely { @mongo_client&.close }
        safely { @redis&.close }
      ensure
        @pg_pool = nil
        @mongo_client = nil
        @redis = nil
        @health_cache = nil
        @redis_failed_at = nil
      end

      # Test seam.
      def reset!
        @pg_pool = nil
        @mongo_client = nil
        @redis = nil
        @health_cache = nil
        @redis_failed_at = nil
      end

      private

      def probe
        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        yield
        { status: 'ok', latencyMs: elapsed_ms(started) }
      rescue StandardError => e
        Logging.warn('dependency.probe_failed', error: e.class.name, errorMessage: e.message)
        { status: 'down', error: e.class.name }
      end

      def elapsed_ms(started)
        ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(2)
      end

      def reset_if_broken!(conn)
        return if conn.status == PG::CONNECTION_OK

        Logging.warn('postgres.connection_reset')
        conn.reset
      rescue PG::Error => e
        raise Errors::DependencyError.new("PostgreSQL connection could not be revived: #{e.message}")
      end

      def with_retry(label)
        attempt = 0
        begin
          attempt += 1
          yield
        rescue StandardError => e
          if attempt < CONNECT_ATTEMPTS
            sleep(RETRY_BACKOFF[attempt - 1] || 1.0)
            Logging.warn('dependency.connect_retry', dependency: label, attempt: attempt,
                                                     error: e.class.name)
            retry
          end
          Logging.error('dependency.connect_failed', dependency: label,
                                                     error: e.class.name, errorMessage: e.message)
          raise Errors::DependencyError.new("#{label} is unavailable: #{e.message}")
        end
      end

      def safely
        yield
      rescue StandardError
        nil
      end
    end
  end
end
