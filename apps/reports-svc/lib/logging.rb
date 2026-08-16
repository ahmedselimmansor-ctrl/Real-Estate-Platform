# frozen_string_literal: true

require 'json'
require 'time'
require 'logger'
require_relative 'version'
require_relative 'config'

module Reports
  # Structured single-line JSON logging (CONTRACT §10.6). Every line carries the
  # X-Request-Id when one is in scope.
  module Logging
    LEVELS = { 'debug' => 0, 'info' => 1, 'warn' => 2, 'error' => 3 }.freeze

    class << self
      def output
        @output ||= $stdout
      end

      attr_writer :output

      def threshold
        @threshold ||= LEVELS.fetch(Config.log_level, 1)
      end

      def reset!
        @threshold = nil
        @output = nil
      end

      def with_request_id(request_id)
        previous = Thread.current[:reports_request_id]
        Thread.current[:reports_request_id] = request_id
        yield
      ensure
        Thread.current[:reports_request_id] = previous
      end

      def request_id
        Thread.current[:reports_request_id]
      end

      def log(level, message, **fields)
        return if LEVELS.fetch(level.to_s, 1) < threshold

        line = {
          ts: Time.now.utc.iso8601(3),
          level: level.to_s,
          service: Reports::SERVICE_NAME,
          version: Reports::VERSION,
          msg: message.to_s
        }
        line[:requestId] = request_id if request_id
        payload = line.merge(fields)
        output.puts(JSON.generate(payload))
      rescue StandardError
        # Logging must never take the request down.
        nil
      end

      def debug(message, **fields) = log('debug', message, **fields)
      def info(message,  **fields) = log('info',  message, **fields)
      def warn(message,  **fields) = log('warn',  message, **fields)
      def error(message, **fields) = log('error', message, **fields)

      def exception(message, error, **fields)
        error(
          message,
          **fields,
          error: error.class.name,
          errorMessage: error.message,
          backtrace: Config.production? ? nil : Array(error.backtrace).first(8)
        )
      end
    end
  end
end
