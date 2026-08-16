# frozen_string_literal: true

require 'securerandom'

require_relative '../logging'

module Reports
  module Middleware
    # CONTRACT §4: "every service reads/propagates X-Request-Id (generate a UUID
    # if absent) and logs it".
    class RequestId
      HEADER   = 'X-Request-Id'
      RACK_KEY = 'HTTP_X_REQUEST_ID'
      ENV_KEY  = 'reports.request_id'

      UUID_RE = /\A[0-9a-zA-Z_.:-]{1,128}\z/

      def initialize(app)
        @app = app
      end

      def call(env)
        incoming = env[RACK_KEY].to_s.strip
        request_id = UUID_RE.match?(incoming) ? incoming : SecureRandom.uuid

        env[ENV_KEY] = request_id
        env[RACK_KEY] = request_id

        status, headers, body = Logging.with_request_id(request_id) { @app.call(env) }
        headers[HEADER.downcase] = request_id unless headers.key?(HEADER.downcase) || headers.key?(HEADER)
        [status, headers, body]
      end
    end
  end
end
