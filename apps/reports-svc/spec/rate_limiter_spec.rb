# frozen_string_literal: true

RSpec.describe Reports::RateLimiter do
  let(:redis) { instance_double(Redis) }

  before do
    allow(Reports::Config).to receive(:rate_limit_enabled?).and_return(true)
    allow(Reports::DB).to receive(:redis_safe) { |&block| block.call(redis) }
  end

  it 'uses the CONTRACT §2 ratelimit namespace' do
    expect(described_class.key('reports:brochure', '10.0.0.1'))
      .to eq('ratelimit:reports:brochure:10.0.0.1')
  end

  it 'allows a request under the limit and sets the window on the first hit' do
    expect(redis).to receive(:incr).with('ratelimit:reports:market:user-1').and_return(1)
    expect(redis).to receive(:expire).with('ratelimit:reports:market:user-1', 60)
    expect(redis).to receive(:ttl).and_return(60)

    result = described_class.check(scope: 'reports:market', identity: 'user-1', limit: 5, window: 60)

    expect(result.allowed?).to be(true)
    expect(result.remaining).to eq(4)
    expect(result.headers).to include('x-ratelimit-limit' => '5', 'x-ratelimit-remaining' => '4')
  end

  it 'does not reset the window on later hits' do
    allow(redis).to receive(:incr).and_return(3)
    expect(redis).not_to receive(:expire)
    allow(redis).to receive(:ttl).and_return(42)

    result = described_class.check(scope: 'reports:market', identity: 'user-1', limit: 5, window: 60)
    expect(result.remaining).to eq(2)
    expect(result.reset_in).to eq(42)
  end

  it 'raises 429 with retry headers once the limit is exceeded' do
    allow(redis).to receive(:incr).and_return(11)
    allow(redis).to receive(:ttl).and_return(17)

    expect do
      described_class.check!(scope: 'reports:export', identity: 'admin-1', limit: 10, window: 60)
    end.to raise_error(Reports::Errors::RateLimitedError) { |error|
      expect(error.status).to eq(429)
      expect(error.code).to eq('RATE_LIMITED')
      expect(error.headers['retry-after']).to eq('17')
      expect(error.headers['x-ratelimit-remaining']).to eq('0')
    }
  end

  it 'fails open when Redis is unavailable' do
    allow(Reports::DB).to receive(:redis_safe).and_return(nil)

    result = described_class.check(scope: 'reports:market', identity: 'user-1', limit: 1, window: 60)
    expect(result.allowed?).to be(true)
    expect(result.remaining).to eq(1)
  end

  it 'is a no-op when rate limiting is disabled' do
    allow(Reports::Config).to receive(:rate_limit_enabled?).and_return(false)
    expect(Reports::DB).not_to receive(:redis_safe)

    expect(described_class.check(scope: 'x', identity: 'y', limit: 1, window: 60).allowed?).to be(true)
  end
end
