# frozen_string_literal: true

require 'jwt'

RSpec.describe Reports::Auth do
  let(:secret) { ENV.fetch('JWT_ACCESS_SECRET') }

  describe '.extract_token' do
    it 'pulls the token out of an Authorization header' do
      expect(described_class.extract_token('Bearer abc.def.ghi')).to eq('abc.def.ghi')
    end

    it 'is case insensitive on the scheme' do
      expect(described_class.extract_token('bearer abc')).to eq('abc')
    end

    it 'returns nil for anything else' do
      expect(described_class.extract_token('Basic abc')).to be_nil
      expect(described_class.extract_token('')).to be_nil
      expect(described_class.extract_token(nil)).to be_nil
    end
  end

  describe '.verify!' do
    it 'accepts a well-formed access token and exposes the CONTRACT §5 claims' do
      token = access_token(role: 'agent', sub: '11111111-1111-1111-1111-111111111111',
                           email: 'agent@topchoice.test', name: 'Agent TopChoice')
      user = described_class.verify!(token)

      expect(user.id).to eq('11111111-1111-1111-1111-111111111111')
      expect(user.email).to eq('agent@topchoice.test')
      expect(user.role).to eq('agent')
      expect(user.name).to eq('Agent TopChoice')
      expect(user.jti).to be_a(String)
      expect(user.agent?).to be(true)
      expect(user.admin?).to be(false)
      expect(user.to_h).to include(role: 'agent')
    end

    it 'treats superadmin as an admin' do
      expect(described_class.verify!(access_token(role: 'superadmin')).admin?).to be(true)
    end

    it 'rejects a missing token' do
      expect { described_class.verify!(nil) }
        .to raise_error(Reports::Errors::UnauthorizedError) { |error|
          expect(error.status).to eq(401)
          expect(error.code).to eq('UNAUTHORIZED')
        }
    end

    it 'rejects a token signed with the wrong secret' do
      token = access_token(secret: 'a-completely-different-secret-value-000')
      expect { described_class.verify!(token) }
        .to raise_error(Reports::Errors::UnauthorizedError) { |error|
          expect(error.code).to eq('INVALID_TOKEN')
        }
    end

    it 'rejects an expired token' do
      token = access_token(exp: Time.now.to_i - 60)
      expect { described_class.verify!(token) }
        .to raise_error(Reports::Errors::UnauthorizedError) { |error|
          expect(error.code).to eq('TOKEN_EXPIRED')
          expect(error.status).to eq(401)
        }
    end

    it 'rejects a foreign issuer' do
      token = access_token(iss: 'someone-else')
      expect { described_class.verify!(token) }
        .to raise_error(Reports::Errors::UnauthorizedError, /issuer/)
    end

    it 'rejects a foreign audience' do
      token = access_token(aud: 'someone-elses-clients')
      expect { described_class.verify!(token) }
        .to raise_error(Reports::Errors::UnauthorizedError, /audience/)
    end

    it 'rejects an unsigned (alg=none) token' do
      payload = { 'sub' => 'x', 'iss' => 'topchoice-api', 'aud' => 'topchoice-clients',
                  'exp' => Time.now.to_i + 60 }
      token = JWT.encode(payload, nil, 'none')
      expect { described_class.verify!(token) }.to raise_error(Reports::Errors::UnauthorizedError)
    end

    it 'rejects garbage' do
      expect { described_class.verify!('not-a-jwt') }
        .to raise_error(Reports::Errors::UnauthorizedError)
    end

    it 'rejects a token without a subject' do
      payload = { 'iss' => 'topchoice-api', 'aud' => 'topchoice-clients', 'exp' => Time.now.to_i + 60,
                  'sub' => '' }
      token = JWT.encode(payload, secret, 'HS256')
      expect { described_class.verify!(token) }.to raise_error(Reports::Errors::UnauthorizedError)
    end
  end

  describe '.verify' do
    it 'returns nil instead of raising' do
      expect(described_class.verify('nope')).to be_nil
      expect(described_class.verify(access_token)).to be_a(described_class::User)
    end
  end

  describe '.require_role!' do
    let(:user) { described_class.verify!(access_token(role: 'agent')) }

    it 'passes a matching role through' do
      expect(described_class.require_role!(user, 'agent', 'admin')).to eq(user)
    end

    it 'raises 403 for a role mismatch' do
      expect { described_class.require_role!(user, 'admin') }
        .to raise_error(Reports::Errors::ForbiddenError) { |error|
          expect(error.status).to eq(403)
          expect(error.code).to eq('FORBIDDEN')
        }
    end

    it 'raises 401 when nobody is authenticated' do
      expect { described_class.require_role!(nil, 'admin') }
        .to raise_error(Reports::Errors::UnauthorizedError)
    end
  end

  describe '.valid_service_token?' do
    before { allow(Reports::Config).to receive(:internal_service_token).and_return('internal-token-value') }

    it 'accepts the configured token' do
      expect(described_class.valid_service_token?('internal-token-value')).to be(true)
    end

    it 'rejects anything else' do
      expect(described_class.valid_service_token?('internal-token-valuf')).to be(false)
      expect(described_class.valid_service_token?('short')).to be(false)
      expect(described_class.valid_service_token?(nil)).to be(false)
    end

    it 'rejects everything when no token is configured' do
      allow(Reports::Config).to receive(:internal_service_token).and_return('')
      expect(described_class.valid_service_token?('anything')).to be(false)
    end
  end
end
