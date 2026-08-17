# frozen_string_literal: true

require 'uri'
require 'cgi'

module Reports
  # DATABASE_URL is written for Prisma and carries `?schema=public`, which libpq
  # rejects ("invalid URI query parameter"). This turns the contract URL into a
  # libpq-safe connection hash plus an optional search_path.
  module PostgresUrl
    # Query parameters libpq understands and we are happy to forward.
    PASSTHROUGH_PARAMS = %w[
      sslmode sslrootcert sslcert sslkey connect_timeout application_name
      options target_session_attrs keepalives keepalives_idle
    ].freeze

    module_function

    # @return [Hash] { conn_opts: {...}, search_path: "public" | nil }
    def parse(url)
      uri = URI.parse(url.to_s)
      raise ArgumentError, "unsupported scheme: #{uri.scheme.inspect}" unless
        %w[postgres postgresql].include?(uri.scheme.to_s)

      params = CGI.parse(uri.query.to_s).transform_values(&:first)

      conn = {
        host: uri.host || 'localhost',
        port: uri.port || 5432,
        dbname: uri.path.to_s.delete_prefix('/').split('?').first,
        user: uri.user && CGI.unescape(uri.user),
        password: uri.password && CGI.unescape(uri.password),
        connect_timeout: 5,
        application_name: 'topchoice-reports-svc'
      }

      PASSTHROUGH_PARAMS.each do |key|
        value = params[key]
        conn[key.to_sym] = value unless value.nil? || value.empty?
      end

      conn[:connect_timeout] = begin
        Integer(conn[:connect_timeout].to_s, 10)
      rescue ArgumentError
        5
      end
      conn[:dbname] = 'topchoice' if conn[:dbname].to_s.empty?

      { conn_opts: conn.compact, search_path: params['schema'] || params['search_path'] }
    end
  end
end
