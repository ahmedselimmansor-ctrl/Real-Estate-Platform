# frozen_string_literal: true

require 'stringio'

# The app validates its configuration at load time (CONTRACT §10.1), so the
# environment has to be in place before `app.rb` is required.
ENV['APP_ENV'] = 'test'
ENV['RACK_ENV'] = 'test'
ENV['LOG_LEVEL'] = 'error'
ENV['JWT_ACCESS_SECRET'] ||= 'test-access-secret-min-32-chars-long-000'
ENV['JWT_ISSUER'] = 'topchoice-api'
ENV['JWT_AUDIENCE'] = 'topchoice-clients'
ENV['FRONTEND_URL'] = 'https://localhost'
ENV['DATABASE_URL'] ||= 'postgresql://topchoice:topchoice_password@localhost:5432/topchoice?schema=public'
ENV['MONGO_URI'] ||= 'mongodb://localhost:27017/topchoice'
ENV['REDIS_URL'] ||= 'redis://localhost:6379'
ENV['REPORTS_RATE_LIMIT_ENABLED'] = 'false'

require 'rspec'
require 'rack/test'
require 'json'

require_relative '../app'

Dir[File.expand_path('support/**/*.rb', __dir__)].each { |file| require file }

RSpec.configure do |config|
  config.expect_with(:rspec) { |expectations| expectations.include_chain_clauses_in_custom_matcher_descriptions = true }
  config.mock_with(:rspec) { |mocks| mocks.verify_partial_doubles = true }
  config.shared_context_metadata_behavior = :apply_to_host_groups
  config.disable_monkey_patching!
  config.order = :random
  Kernel.srand config.seed

  config.include Rack::Test::Methods, type: :request
  config.include SpecSupport::RequestHelpers, type: :request
  config.include SpecSupport::Tokens
  config.include SpecSupport::Fixtures

  # Keep the structured logger out of the spec output.
  config.before(:suite) { Reports::Logging.output = StringIO.new }

  # No spec is allowed to touch Postgres, Mongo or Redis: the data layer is
  # stubbed wholesale and each example opts into the behaviour it needs.
  config.before do
    allow(Reports::DB).to receive(:health).and_return(
      postgres: { status: 'ok', latencyMs: 0.5 },
      mongo: { status: 'ok', latencyMs: 0.4 },
      redis: { status: 'ok', latencyMs: 0.2 }
    )
    allow(Reports::DB).to receive(:healthy?).and_call_original
    allow(Reports::DB).to receive(:redis_safe).and_return(nil)
    allow(Reports::DB).to receive(:delete_cache).and_return(nil)
    allow(Reports::DB).to receive(:cache) { |_key, _ttl, &block| Reports::JsonCodec.normalize(block.call) }
    allow(Reports::DB).to receive(:cache_bytes) { |_key, _ttl, &block| block.call }
  end
end
