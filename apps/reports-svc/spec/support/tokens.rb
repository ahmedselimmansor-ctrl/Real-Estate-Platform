# frozen_string_literal: true

require 'jwt'
require 'securerandom'

module SpecSupport
  # Mints access tokens exactly as api-core does (CONTRACT §5).
  module Tokens
    def access_token(role: 'user', sub: SecureRandom.uuid, email: 'buyer@nawy.test',
                     name: 'Test Buyer', exp: Time.now.to_i + 900, iss: 'nawy-api',
                     aud: 'nawy-clients', secret: ENV.fetch('JWT_ACCESS_SECRET'))
      payload = {
        'sub' => sub,
        'email' => email,
        'role' => role,
        'name' => name,
        'jti' => SecureRandom.uuid,
        'iss' => iss,
        'aud' => aud,
        'iat' => Time.now.to_i,
        'exp' => exp
      }
      JWT.encode(payload, secret, 'HS256')
    end

    def bearer(role: 'user', **options)
      { 'HTTP_AUTHORIZATION' => "Bearer #{access_token(role: role, **options)}" }
    end

    def admin_headers
      bearer(role: 'admin', email: 'admin@nawy.test', name: 'Nawy Admin')
    end
  end
end
