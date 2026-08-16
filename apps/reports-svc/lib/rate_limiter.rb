# frozen_string_literal: true

require_relative 'config'
require_relative 'db'
require_relative 'errors'

module Reports
  # Fixed-window limiter on the CONTRACT §2 namespace `ratelimit:{scope}:{ip|userId}`.
  # Fails OPEN: if Redis is unreachable the request is served rather than dropped.
  module RateLimiter
    Result = Struct.new(:allowed, :limit, :remaining, :reset_in, keyword_init: true) do
      def allowed? = allowed

      def headers
        {
          'x-ratelimit-limit' => limit.to_s,
          'x-ratelimit-remaining' => remaining.to_s,
          'x-ratelimit-reset' => reset_in.to_s
        }
      end
    end

    module_function

    def key(scope, identity)
      "ratelimit:#{scope}:#{identity}"
    end

    def check(scope:, identity:, limit:, window:)
      return Result.new(allowed: true, limit: limit, remaining: limit, reset_in: window) unless
        Config.rate_limit_enabled?

      redis_key = key(scope, identity)
      count = nil
      ttl = window

      DB.redis_safe do |redis|
        count = redis.incr(redis_key)
        redis.expire(redis_key, window) if count == 1
        ttl = redis.ttl(redis_key)
        ttl = window if ttl.nil? || ttl.negative?
      end

      # Redis down -> fail open.
      return Result.new(allowed: true, limit: limit, remaining: limit, reset_in: window) if count.nil?

      Result.new(
        allowed: count <= limit,
        limit: limit,
        remaining: [limit - count, 0].max,
        reset_in: ttl
      )
    end

    def check!(scope:, identity:, limit:, window:)
      result = check(scope: scope, identity: identity, limit: limit, window: window)
      return result if result.allowed?

      raise Errors::RateLimitedError.new(
        "Rate limit exceeded for #{scope}. Retry in #{result.reset_in}s.",
        headers: result.headers.merge('retry-after' => result.reset_in.to_s)
      )
    end
  end
end
