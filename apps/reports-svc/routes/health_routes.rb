# frozen_string_literal: true

module Reports
  module Routes
    # CONTRACT §4:
    #   GET /health        -> {"status":"ok","service":"…","version":"1.0.0","deps":{…}}
    #   GET /health/ready
    #
    # Both are mounted at the root (docker-compose's healthcheck hits
    # `http://localhost:4567/health`) and under the /api/reports prefix (nginx
    # forwards the prefix untouched).
    module HealthRoutes
      PATHS = ['/health', "#{Reports::MOUNT_PATH}/health"].freeze
      READY_PATHS = ['/health/ready', "#{Reports::MOUNT_PATH}/health/ready"].freeze

      def self.registered(app)
        PATHS.each do |path|
          app.get path do
            no_store!
            # Liveness: the process is up. Dependency probes are reported but
            # never fail the check, so a Redis blip cannot restart the service.
            deps = Reports::DB.health
            json_body({
                        status: 'ok',
                        service: Reports::SERVICE_NAME,
                        version: Reports::VERSION,
                        uptime: Reports::Routes::HealthRoutes.uptime,
                        deps: deps
                      })
          end
        end

        READY_PATHS.each do |path|
          app.get path do
            no_store!
            deps = Reports::DB.health(ttl: 1)
            ready = Reports::DB.healthy?(deps)
            json_body(
              {
                status: ready ? 'ok' : 'degraded',
                service: Reports::SERVICE_NAME,
                version: Reports::VERSION,
                deps: deps
              },
              status: ready ? 200 : 503
            )
          end
        end
      end

      BOOTED_AT = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      def self.uptime
        (Process.clock_gettime(Process::CLOCK_MONOTONIC) - BOOTED_AT).round(2)
      end
    end
  end
end
