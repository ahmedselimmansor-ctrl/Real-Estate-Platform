# frozen_string_literal: true

require 'bundler/setup'
require_relative 'app'

# Close pooled connections on a clean interpreter exit (Puma sends SIGTERM,
# finishes in-flight requests, then unwinds — this is the last hook we get).
at_exit { Reports::DB.shutdown! }

run Reports::App
