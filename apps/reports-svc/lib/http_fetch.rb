# frozen_string_literal: true

require 'net/http'
require 'uri'
require 'stringio'

require_relative 'config'
require_relative 'logging'

module Reports
  # Minimal, defensive HTTP GET used to pull the hero image into the brochure.
  # Never raises: a failure returns nil and the PDF falls back to a placeholder.
  module HttpFetch
    MAX_REDIRECTS   = 3
    ALLOWED_SCHEMES = %w[http https].freeze
    IMAGE_TYPES     = %w[image/jpeg image/jpg image/png].freeze

    module_function

    # @return [StringIO, nil] an IO Prawn can consume, or nil on any failure.
    def image(url, timeout: Config.image_timeout, max_bytes: Config.image_max_bytes)
      body = get(url, timeout: timeout, max_bytes: max_bytes, accept: IMAGE_TYPES)
      return nil if body.nil? || body.empty?
      return nil unless jpeg?(body) || png?(body)

      StringIO.new(body)
    end

    def get(url, timeout:, max_bytes:, accept: [], redirects_left: MAX_REDIRECTS)
      uri = URI.parse(url.to_s)
      return nil unless ALLOWED_SCHEMES.include?(uri.scheme) && uri.host

      response = perform(uri, timeout)
      return nil if response.nil?

      case response
      when Net::HTTPRedirection
        return nil if redirects_left <= 0

        location = response['location']
        return nil if location.to_s.empty?

        get(URI.join(uri, location).to_s, timeout: timeout, max_bytes: max_bytes,
                                          accept: accept, redirects_left: redirects_left - 1)
      when Net::HTTPSuccess
        content_type = response['content-type'].to_s.split(';').first.to_s.strip.downcase
        if accept.any? && !accept.include?(content_type)
          Logging.warn('http_fetch.unexpected_content_type', url: uri.to_s, contentType: content_type)
          return nil
        end

        body = response.body.to_s
        if body.bytesize > max_bytes
          Logging.warn('http_fetch.too_large', url: uri.to_s, bytes: body.bytesize)
          return nil
        end

        body
      else
        Logging.warn('http_fetch.bad_status', url: uri.to_s, status: response.code)
        nil
      end
    rescue StandardError => e
      Logging.warn('http_fetch.failed', url: url.to_s, error: e.class.name, errorMessage: e.message)
      nil
    end

    def perform(uri, timeout)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'
      http.open_timeout = timeout
      http.read_timeout = timeout
      http.ssl_timeout = timeout if http.use_ssl
      http.max_retries = 0

      request = Net::HTTP::Get.new(uri.request_uri)
      request['User-Agent'] = 'nawy-reports-svc/1.0 (+brochure-renderer)'
      request['Accept'] = 'image/jpeg,image/png;q=0.9,*/*;q=0.1'

      http.start { |session| session.request(request) }
    rescue StandardError => e
      Logging.warn('http_fetch.transport_error', url: uri.to_s, error: e.class.name,
                                                 errorMessage: e.message)
      nil
    end

    def jpeg?(body) = body.byteslice(0, 3) == "\xFF\xD8\xFF".b
    def png?(body)  = body.byteslice(0, 8) == "\x89PNG\r\n\x1A\n".b
  end
end
