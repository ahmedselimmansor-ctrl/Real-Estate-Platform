# frozen_string_literal: true

require_relative '../logging'

module Reports
  module Middleware
    # Emits one structured JSON line per request:
    #   {"ts":"…","level":"info","service":"reports-svc","requestId":"…",
    #    "msg":"http.request","method":"GET","path":"/api/reports/health",
    #    "status":200,"durationMs":3.41,"ip":"172.18.0.5","ua":"curl/8.5.0"}
    class RequestLogger
      SKIP_PATHS = ['/health', '/health/ready', '/api/reports/health',
                    '/api/reports/health/ready'].freeze

      def initialize(app)
        @app = app
      end

      def call(env)
        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        status, headers, body = @app.call(env)
        log(env, status, headers, started)
        [status, headers, body]
      rescue StandardError => e
        log(env, 500, {}, started, error: e)
        raise
      end

      private

      def log(env, status, headers, started, error: nil)
        path = env['PATH_INFO'].to_s
        duration = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(2)

        # Health probes fire every 15s in compose — only log them when slow or
        # failing, so the log stays readable.
        return if SKIP_PATHS.include?(path) && status < 400 && duration < 1000 && error.nil?

        fields = {
          method: env['REQUEST_METHOD'],
          path: path,
          query: env['QUERY_STRING'].to_s.empty? ? nil : truncate(env['QUERY_STRING'], 512),
          status: status,
          durationMs: duration,
          ip: client_ip(env),
          ua: truncate(env['HTTP_USER_AGENT'], 160),
          userId: env['reports.user_id'],
          bytes: content_length(headers)
        }.compact

        if error
          Logging.exception('http.request_failed', error, **fields)
        elsif status >= 500
          Logging.error('http.request', **fields)
        elsif status >= 400
          Logging.warn('http.request', **fields)
        else
          Logging.info('http.request', **fields)
        end
      end

      def content_length(headers)
        value = headers['content-length'] || headers['Content-Length']
        value && Integer(value, 10)
      rescue ArgumentError, TypeError
        nil
      end

      def client_ip(env)
        forwarded = env['HTTP_X_FORWARDED_FOR'].to_s.split(',').first.to_s.strip
        forwarded.empty? ? env['REMOTE_ADDR'] : forwarded
      end

      def truncate(value, limit)
        return nil if value.nil?

        string = value.to_s
        string.length > limit ? "#{string[0, limit]}…" : string
      end
    end
  end
end
