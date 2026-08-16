# frozen_string_literal: true

module Reports
  # Typed application errors. Every one of them carries the SCREAMING_SNAKE
  # `code` and HTTP `status` demanded by CONTRACT §4:
  #
  #   { "success": false,
  #     "error": { "code": "...", "message": "...", "details": [] } }
  module Errors
    # Base class — never raised directly.
    class AppError < StandardError
      attr_reader :code, :status, :details, :headers

      def initialize(message = nil, code: nil, status: nil, details: [], headers: {})
        @code    = code   || self.class.default_code
        @status  = status || self.class.default_status
        @details = Array(details)
        @headers = headers
        super(message || self.class.default_message)
      end

      class << self
        def default_code    = 'INTERNAL_ERROR'
        def default_status  = 500
        def default_message = 'The server encountered an unexpected condition.'
      end

      def to_envelope
        { success: false, error: { code: code, message: message, details: details } }
      end
    end

    class BadRequestError < AppError
      def self.default_code    = 'BAD_REQUEST'
      def self.default_status  = 400
      def self.default_message = 'The request could not be understood.'
    end

    class InvalidJsonError < AppError
      def self.default_code    = 'INVALID_JSON'
      def self.default_status  = 400
      def self.default_message = 'Request body must be valid JSON.'
    end

    class UnauthorizedError < AppError
      def self.default_code    = 'UNAUTHORIZED'
      def self.default_status  = 401
      def self.default_message = 'Authentication is required.'
    end

    class ForbiddenError < AppError
      def self.default_code    = 'FORBIDDEN'
      def self.default_status  = 403
      def self.default_message = 'You do not have access to this resource.'
    end

    class NotFoundError < AppError
      def self.default_code    = 'NOT_FOUND'
      def self.default_status  = 404
      def self.default_message = 'Resource not found.'
    end

    class PropertyNotFoundError < NotFoundError
      def self.default_code    = 'PROPERTY_NOT_FOUND'
      def self.default_message = 'Property not found.'
    end

    class ValidationError < AppError
      def self.default_code    = 'VALIDATION_ERROR'
      def self.default_status  = 422
      def self.default_message = 'The submitted values are invalid.'

      # Convenience: ValidationError.field('price', 'must be positive')
      def self.field(field, message)
        new("#{field} #{message}", details: [{ field: field.to_s, message: message.to_s }])
      end
    end

    class RateLimitedError < AppError
      def self.default_code    = 'RATE_LIMITED'
      def self.default_status  = 429
      def self.default_message = 'Too many requests. Please retry shortly.'
    end

    class DependencyError < AppError
      def self.default_code    = 'SERVICE_UNAVAILABLE'
      def self.default_status  = 503
      def self.default_message = 'A downstream dependency is unavailable.'
    end

    class ConfigError < AppError
      def self.default_code    = 'CONFIG_ERROR'
      def self.default_status  = 500
      def self.default_message = 'The service is misconfigured.'
    end
  end
end
