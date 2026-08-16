# =============================================================================
# Remote state — S3 bucket for the state file, DynamoDB table for the lock.
#
# This is a *partial* backend configuration on purpose: backend blocks cannot
# interpolate variables, so the concrete bucket/key/table are supplied at init
# time from environments/<env>.backend.hcl:
#
#   terraform init -reconfigure -backend-config=environments/prod.backend.hcl
#
# The bucket and table themselves are created once, out of band, by the tiny
# root module in ./bootstrap (which uses local state). See README.md §"Remote
# state bootstrap".
#
# Every module in this repo is backend-agnostic, so
#   terraform init -backend=false && terraform validate
# works with no AWS credentials at all.
# =============================================================================

terraform {
  backend "s3" {}
}
