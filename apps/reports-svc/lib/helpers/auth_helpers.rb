# frozen_string_literal: true

require_relative '../auth'
require_relative '../errors'
require_relative '../rate_limiter'

module Reports
  module Helpers
    # Sinatra-facing wrappers over Reports::Auth (CONTRACT §5).
    module AuthHelpers
      # Verified principal or nil — never raises.
      def current_user
        return @current_user if defined?(@current_user)

        @current_user = Auth.verify(Auth.extract_token(request.env['HTTP_AUTHORIZATION']))
        env['reports.user_id'] = @current_user&.id
        @current_user
      end

      # Verified principal or 401.
      def authenticate!
        token = Auth.extract_token(request.env['HTTP_AUTHORIZATION'])
        raise Errors::UnauthorizedError.new('An Authorization: Bearer <token> header is required.') if token.nil?

        @current_user = Auth.verify!(token)
        env['reports.user_id'] = @current_user.id
        @current_user
      end

      # Verified principal with one of `roles`, or 401/403.
      def require_role!(*roles)
        Auth.require_role!(authenticate!, *roles)
      end

      def require_admin!
        require_role!(*Auth::ADMIN_ROLES)
      end

      # Internal service-to-service calls (CONTRACT §5).
      def require_service_token!
        return true if Auth.valid_service_token?(request.env['HTTP_X_SERVICE_TOKEN'])

        raise Errors::ForbiddenError.new('A valid X-Service-Token header is required.')
      end

      # Rate-limit identity: the user id when authenticated, else the client IP.
      def rate_limit_identity
        current_user&.id || client_ip
      end

      def client_ip
        forwarded = request.env['HTTP_X_FORWARDED_FOR'].to_s.split(',').first.to_s.strip
        forwarded.empty? ? request.ip.to_s : forwarded
      end

      def rate_limit!(scope, limit:, window: 60)
        result = RateLimiter.check!(scope: scope, identity: rate_limit_identity,
                                    limit: limit, window: window)
        result.headers.each { |name, value| response.headers[name] = value }
        result
      end
    end
  end
end
