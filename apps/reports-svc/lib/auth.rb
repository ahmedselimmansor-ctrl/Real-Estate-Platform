# frozen_string_literal: true

require 'jwt'
require_relative 'config'
require_relative 'errors'

module Reports
  # CONTRACT §5 — access tokens are HS256, signed with JWT_ACCESS_SECRET and
  # verified locally (no network call to api-core), checking `iss` and `aud`.
  #
  # Claims: sub, email, role, name, jti, iss, aud, iat, exp
  module Auth
    ALGORITHM = 'HS256'
    ROLES     = %w[user agent admin superadmin].freeze
    ADMIN_ROLES = %w[admin superadmin].freeze
    BEARER_RE = /\ABearer\s+(?<token>[^\s]+)\z/i

    # Immutable view of the authenticated principal.
    class User
      attr_reader :id, :email, :role, :name, :jti, :issued_at, :expires_at, :claims

      def initialize(claims)
        @claims = claims
        @id     = claims['sub']
        @email  = claims['email']
        @role   = claims['role'].to_s
        @name   = claims['name']
        @jti    = claims['jti']
        @issued_at  = claims['iat'] && Time.at(claims['iat']).utc
        @expires_at = claims['exp'] && Time.at(claims['exp']).utc
      end

      def role?(*roles)     = roles.flatten.map(&:to_s).include?(role)
      def admin?            = ADMIN_ROLES.include?(role)
      def agent?            = role == 'agent'
      def to_h = { id: id, email: email, role: role, name: name }
    end

    class << self
      # Pull "Bearer <token>" out of a Rack env or a header string.
      def extract_token(header)
        match = BEARER_RE.match(header.to_s.strip)
        match && match[:token]
      end

      # Decode + verify. Raises Errors::UnauthorizedError with a specific code
      # so the frontend can distinguish "expired" from "malformed".
      def verify!(token)
        raise Errors::UnauthorizedError.new('Missing bearer token.', code: 'UNAUTHORIZED') if token.to_s.empty?

        payload, = JWT.decode(
          token,
          Config.jwt_access_secret,
          true,
          algorithm: ALGORITHM,
          verify_expiration: true,
          verify_iat: false,
          verify_iss: true,
          iss: Config.jwt_issuer,
          verify_aud: true,
          aud: Config.jwt_audience,
          required_claims: %w[sub exp iss aud]
        )

        raise Errors::UnauthorizedError.new('Token payload is invalid.') unless payload.is_a?(Hash)
        raise Errors::UnauthorizedError.new('Token is missing a subject.') if payload['sub'].to_s.empty?

        User.new(payload)
      rescue JWT::ExpiredSignature
        raise Errors::UnauthorizedError.new('Access token has expired.', code: 'TOKEN_EXPIRED')
      rescue JWT::InvalidIssuerError
        raise Errors::UnauthorizedError.new('Access token issuer is not trusted.', code: 'INVALID_TOKEN')
      rescue JWT::InvalidAudError
        raise Errors::UnauthorizedError.new('Access token audience is not trusted.', code: 'INVALID_TOKEN')
      rescue JWT::DecodeError, JWT::VerificationError
        raise Errors::UnauthorizedError.new('Access token is invalid.', code: 'INVALID_TOKEN')
      end

      # Non-raising variant used by endpoints that merely personalise output.
      def verify(token)
        verify!(token)
      rescue Errors::UnauthorizedError
        nil
      end

      def require_role!(user, *roles)
        wanted = roles.flatten.map(&:to_s)
        raise Errors::UnauthorizedError.new('Authentication is required.') if user.nil?
        return user if wanted.empty? || user.role?(wanted)

        raise Errors::ForbiddenError.new(
          "This endpoint requires one of the following roles: #{wanted.join(', ')}."
        )
      end

      # Constant-time comparison for the X-Service-Token header (CONTRACT §5).
      def valid_service_token?(candidate)
        expected = Config.internal_service_token.to_s
        return false if expected.empty? || candidate.to_s.empty?
        return false unless candidate.to_s.bytesize == expected.bytesize

        candidate.to_s.bytes.zip(expected.bytes).reduce(0) { |acc, (a, b)| acc | (a ^ b) }.zero?
      end
    end
  end
end
