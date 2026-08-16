# frozen_string_literal: true

require 'json'

# Puma configuration for reports-svc.
#   bundle exec puma -C config/puma.rb config.ru

app_env = ENV['APP_ENV'] || ENV['RACK_ENV'] || ENV['NODE_ENV'] || 'development'
port     = Integer(ENV['PORT'] || 4567)
threads_min = Integer(ENV['PUMA_MIN_THREADS'] || 2)
threads_max = Integer(ENV['PUMA_MAX_THREADS'] || 8)
workers_count = Integer(ENV['WEB_CONCURRENCY'] || 0)

environment app_env
rackup      'config.ru'

bind "tcp://0.0.0.0:#{port}"
threads threads_min, threads_max
workers workers_count if workers_count.positive?

# PDF rendering and CSV exports can take a moment; give requests room but never
# hang a worker forever.
worker_timeout Integer(ENV['PUMA_WORKER_TIMEOUT'] || 60) if workers_count.positive?
persistent_timeout Integer(ENV['PUMA_PERSISTENT_TIMEOUT'] || 25)
first_data_timeout Integer(ENV['PUMA_FIRST_DATA_TIMEOUT'] || 15)

# Structured, single-line logs — the request logger middleware emits JSON, this
# only covers Puma's own lifecycle chatter.
log_requests false
quiet false

preload_app! if workers_count.positive?

# --- graceful shutdown -------------------------------------------------------
lowlevel_error_handler do |error, _env, status|
  payload = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'The server encountered an unexpected condition.',
      details: []
    }
  }
  warn({ level: 'error', service: 'reports-svc', msg: 'puma.lowlevel_error',
         error: error.class.name, status: status }.to_json)
  [500, { 'content-type' => 'application/json; charset=utf-8' }, [payload.to_json]]
end

on_worker_shutdown do
  defined?(Reports::DB) && Reports::DB.shutdown!
end

on_restart do
  defined?(Reports::DB) && Reports::DB.shutdown!
end
