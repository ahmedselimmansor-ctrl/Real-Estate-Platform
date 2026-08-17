# syntax=docker/dockerfile:1
# =============================================================================
# topchoice / reports-svc — Ruby 3.3 + Sinatra + Puma
# Multi-stage: native gems (pg, prawn/ttfunk, bson) compile in the builder,
# the runtime image ships only the built bundle and runs as a non-root user.
# =============================================================================

# ------------------------------------------------------------------ builder --
FROM ruby:4.0-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    BUNDLE_PATH=/usr/local/bundle \
    BUNDLE_APP_CONFIG=/usr/local/bundle \
    BUNDLE_JOBS=4 \
    BUNDLE_RETRY=3 \
    BUNDLE_WITHOUT=development:test

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      libpq-dev \
      libyaml-dev \
      pkg-config \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# No Gemfile.lock is committed (see README) — resolve here, then ship the lock
# that the build produced so the runtime never has to re-resolve or write.
COPY Gemfile ./
# The gem path is version-scoped (`/usr/local/bundle/ruby/<abi>/gems`), so the
# cleanup searches BUNDLE_PATH as a whole rather than assuming a fixed layout —
# `find` on a missing directory exits non-zero and would fail the build even
# though `bundle install` succeeded.
RUN bundle install \
 && rm -rf /usr/local/bundle/cache \
 && find /usr/local/bundle -name '*.c' -delete \
 && find /usr/local/bundle -name '*.o' -delete

# ------------------------------------------------------------------ runtime --
FROM ruby:4.0-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    BUNDLE_PATH=/usr/local/bundle \
    BUNDLE_APP_CONFIG=/usr/local/bundle \
    BUNDLE_WITHOUT=development:test \
    RUBY_YJIT_ENABLE=1 \
    LANG=C.UTF-8 \
    APP_ENV=production \
    PORT=4567

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libpq5 \
      fonts-dejavu-core \
      tzdata \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 topchoice \
 && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin topchoice

WORKDIR /app

COPY --from=builder /usr/local/bundle /usr/local/bundle
COPY --from=builder /app/Gemfile.lock /app/Gemfile.lock
COPY Gemfile        /app/Gemfile
COPY config.ru      /app/config.ru
COPY app.rb         /app/app.rb
COPY config         /app/config
COPY lib            /app/lib
COPY routes         /app/routes

RUN mkdir -p /app/tmp && chown -R topchoice:topchoice /app

USER topchoice

EXPOSE 4567

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=10 \
  CMD ruby -e "require 'net/http'; exit(Net::HTTP.get_response(URI(\"http://localhost:#{ENV.fetch('PORT', '4567')}/health\")).code == '200' ? 0 : 1)"

CMD ["bundle", "exec", "puma", "-C", "config/puma.rb", "config.ru"]
