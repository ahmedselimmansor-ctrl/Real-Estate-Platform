# frozen_string_literal: true

require 'json'
require_relative '../json_codec'
require_relative '../errors'

module Reports
  module Helpers
    # CONTRACT §4 envelopes. Every JSON body in this service goes through here.
    module Responses
      JSON_TYPE = 'application/json; charset=utf-8'

      def request_id
        env['reports.request_id']
      end

      def json_body(payload, status: 200, headers: {})
        self.status(status)
        content_type JSON_TYPE
        headers.each { |name, value| response.headers[name.to_s.downcase] = value.to_s }
        JsonCodec.encode(payload)
      end

      # { "success": true, "data": …, "meta": {…} }
      def json_success(data, status: 200, meta: nil, headers: {})
        json_body(JsonCodec.success_envelope(data, meta: meta), status: status, headers: headers)
      end

      # { "success": false, "error": { "code", "message", "details" } }
      def json_error(code:, message:, status: 400, details: [], headers: {})
        json_body(
          JsonCodec.error_envelope(code: code, message: message, details: details),
          status: status,
          headers: headers
        )
      end

      def error_from(error)
        json_error(
          code: error.code,
          message: error.message,
          status: error.status,
          details: error.details,
          headers: error.headers
        )
      end

      # meta block for paginated payloads (CONTRACT §4).
      def pagination_meta(page:, limit:, total:)
        {
          page: page,
          limit: limit,
          total: total,
          total_pages: limit.positive? ? (total.to_f / limit).ceil : 0
        }
      end

      # Attachment headers shared by the PDF and CSV endpoints. Includes the
      # RFC 5987 form so non-ASCII names survive.
      def attachment!(filename, type)
        ascii = filename.gsub(/[^A-Za-z0-9._-]/, '_')
        content_type type
        response.headers['content-disposition'] =
          %(attachment; filename="#{ascii}"; filename*=UTF-8''#{rfc5987_escape(filename)})
        response.headers['x-content-type-options'] = 'nosniff'
      end

      # Percent-encoding for RFC 5987 (`Rack::Utils.escape` is form encoding and
      # would turn spaces into "+").
      def rfc5987_escape(value)
        value.to_s.b.gsub(/[^A-Za-z0-9!#$&+.^_`|~-]/) do |char|
          char.bytes.map { |byte| format('%%%02X', byte) }.join
        end
      end

      def no_store!
        response.headers['cache-control'] = 'no-store'
      end

      def cache_for!(seconds)
        response.headers['cache-control'] = "private, max-age=#{seconds}"
      end
    end
  end
end
