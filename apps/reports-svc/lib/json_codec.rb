# frozen_string_literal: true

require 'json'
require 'bigdecimal'
require 'date'
require 'time'

module Reports
  # The single JSON serialiser for the service.
  #
  # Rules (deliberately simple so a cached round-trip is byte-identical to a
  # freshly computed payload):
  #
  #   * Symbol keys are camelCased    (:avg_price      -> "avgPrice")
  #   * String keys are passed through untouched ("2026-01" stays "2026-01")
  #   * BigDecimal -> Float, Time/Date/DateTime -> ISO-8601 strings
  #   * Symbols in *values* become strings
  module JsonCodec
    module_function

    # Normalise into plain JSON-able Ruby (String keys everywhere).
    def normalize(value)
      case value
      when Hash
        value.each_with_object({}) do |(k, v), out|
          out[normalize_key(k)] = normalize(v)
        end
      when Array
        value.map { |v| normalize(v) }
      when BigDecimal, Rational
        value.to_f
      when Time
        value.utc.iso8601(3)
      when DateTime
        value.to_time.utc.iso8601(3)
      when Date
        value.iso8601
      when Symbol
        value.to_s
      else
        value
      end
    end

    def normalize_key(key)
      case key
      when Symbol then camelize(key.to_s)
      when String then key
      else key.to_s
      end
    end

    # snake_case / kebab-case -> camelCase. Already-camel strings survive.
    def camelize(string)
      head, *rest = string.split(/[_-]/)
      return string if rest.empty?

      ([head.to_s] + rest.map { |part| part.empty? ? '' : part[0].upcase + part[1..].to_s }).join
    end

    def encode(value)
      ::JSON.generate(normalize(value))
    end

    def decode(string)
      ::JSON.parse(string.to_s)
    end

    # --- envelopes (CONTRACT §4) --------------------------------------------
    def success_envelope(data, meta: nil)
      envelope = { 'success' => true, 'data' => normalize(data) }
      envelope['meta'] = normalize(meta) if meta
      envelope
    end

    def error_envelope(code:, message:, details: [])
      {
        'success' => false,
        'error' => {
          'code' => code.to_s,
          'message' => message.to_s,
          'details' => normalize(Array(details))
        }
      }
    end
  end
end
