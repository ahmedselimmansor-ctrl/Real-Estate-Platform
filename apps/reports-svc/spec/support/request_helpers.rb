# frozen_string_literal: true

module SpecSupport
  # Rack::Test plumbing for the request specs.
  module RequestHelpers
    def app
      Reports::App
    end

    def json_response
      JSON.parse(last_response.body)
    end

    def post_json(path, payload, headers = {})
      post path, JSON.generate(payload), headers.merge('CONTENT_TYPE' => 'application/json')
    end

    def error_code
      json_response.dig('error', 'code')
    end
  end
end
