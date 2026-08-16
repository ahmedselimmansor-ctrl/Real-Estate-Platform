# =============================================================================
# Providers.
#
# `default_tags` guarantees the common tag map lands on every taggable resource
# even if a module forgets to merge `var.tags`. Modules ALSO merge the tag map
# explicitly so they stay correct when consumed from another root module.
#
# The `us_east_1` alias exists solely for ACM: CloudFront only accepts
# certificates issued in us-east-1, regardless of where the rest of the stack
# lives (eu-central-1 by default — see CONTRACT §7 AWS_REGION).
# =============================================================================

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}
