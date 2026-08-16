# frozen_string_literal: true

require 'json'
require 'date'
require 'time'

require_relative '../errors'

module Reports
  module Helpers
    # Manual input validation (CONTRACT §10.3) — every coercion raises the
    # typed 422 error rather than returning nil surprises.
    module Params
      UUID_RE = /\A[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\z/
      MAX_BODY_BYTES = 64 * 1024

      PROPERTY_TYPES = %w[apartment villa townhouse twinhouse duplex penthouse studio chalet
                          office retail clinic].freeze
      SALE_TYPES     = %w[primary resale rent].freeze
      STATUSES       = %w[available reserved sold off_plan delivered].freeze
      FINISHINGS     = %w[core_shell semi_finished fully_finished furnished].freeze
      LEAD_STATUSES  = %w[new contacted qualified viewing negotiating won lost].freeze

      # --- body ---------------------------------------------------------------
      def json_request_body
        @json_request_body ||= begin
          request.body.rewind
          raw = request.body.read(MAX_BODY_BYTES + 1).to_s
          raise Errors::BadRequestError.new('Request body is too large.') if raw.bytesize > MAX_BODY_BYTES

          if raw.strip.empty?
            {}
          else
            parsed = JSON.parse(raw)
            raise Errors::InvalidJsonError.new('Request body must be a JSON object.') unless parsed.is_a?(Hash)

            parsed
          end
        rescue JSON::ParserError => e
          raise Errors::InvalidJsonError.new("Request body must be valid JSON: #{e.message}")
        end
      end

      # Accepts both camelCase and snake_case keys so the BFF and curl agree.
      def body_value(body, name)
        camel = name.to_s
        snake = camel.gsub(/([A-Z])/) { "_#{Regexp.last_match(1).downcase}" }
        return body[camel] if body.key?(camel)
        return body[snake] if body.key?(snake)

        nil
      end

      # --- coercions ----------------------------------------------------------
      def coerce_integer(value, field, default: nil, min: nil, max: nil, required: false)
        if blank?(value)
          raise Errors::ValidationError.field(field, 'is required') if required

          return default
        end

        integer = begin
          Integer(value.to_s.strip, 10)
        rescue ArgumentError, TypeError
          raise Errors::ValidationError.field(field, 'must be an integer')
        end

        raise Errors::ValidationError.field(field, "must be at least #{min}") if min && integer < min
        raise Errors::ValidationError.field(field, "must not exceed #{max}") if max && integer > max

        integer
      end

      def coerce_number(value, field, default: nil, required: false)
        if blank?(value)
          raise Errors::ValidationError.field(field, 'is required') if required

          return default
        end

        return value if value.is_a?(Numeric)

        raise Errors::ValidationError.field(field, 'must be a number') unless
          value.to_s.strip.match?(/\A-?\d+(\.\d+)?\z/)

        Float(value.to_s.strip)
      end

      def coerce_date(value, field, default: nil, required: false)
        if blank?(value)
          raise Errors::ValidationError.field(field, 'is required') if required

          return default
        end

        Date.parse(value.to_s.strip)
      rescue ArgumentError, TypeError
        raise Errors::ValidationError.field(field, 'must be an ISO date (YYYY-MM-DD)')
      end

      # Inclusive day boundaries in UTC: `from` snaps to 00:00:00Z, `to` to 23:59:59Z.
      def coerce_time_range(from_value, to_value)
        from = blank?(from_value) ? nil : utc_start_of_day(coerce_date(from_value, 'from'))
        to = blank?(to_value) ? nil : utc_end_of_day(coerce_date(to_value, 'to'))

        if from && to && from > to
          raise Errors::ValidationError.new(
            'The `from` date must not be after the `to` date.',
            details: [{ field: 'from', message: 'must be before `to`' }]
          )
        end

        [from, to]
      end

      def utc_start_of_day(date)
        Time.utc(date.year, date.month, date.day)
      end

      def utc_end_of_day(date)
        Time.utc(date.year, date.month, date.day, 23, 59, 59)
      end

      def coerce_uuid(value, field, required: false)
        if blank?(value)
          raise Errors::ValidationError.field(field, 'is required') if required

          return nil
        end

        string = value.to_s.strip
        raise Errors::ValidationError.field(field, 'must be a UUID') unless UUID_RE.match?(string)

        string
      end

      def coerce_enum(value, field, allowed, default: nil, required: false)
        if blank?(value)
          raise Errors::ValidationError.field(field, 'is required') if required

          return default
        end

        string = value.to_s.strip.downcase
        unless allowed.include?(string)
          raise Errors::ValidationError.field(field, "must be one of: #{allowed.join(', ')}")
        end

        string
      end

      def coerce_boolean(value, default: false)
        return default if blank?(value)

        %w[1 true yes on].include?(value.to_s.strip.downcase)
      end

      # CONTRACT §4 pagination: page (1-based, default 1), limit (default 20, max 100).
      def pagination
        page  = coerce_integer(params['page'], 'page', default: 1, min: 1, max: 100_000)
        limit = coerce_integer(params['limit'], 'limit', default: 20, min: 1, max: 100)
        [page, limit]
      end

      def blank?(value)
        value.nil? || (value.respond_to?(:strip) && value.to_s.strip.empty?)
      end
    end
  end
end
