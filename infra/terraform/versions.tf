# =============================================================================
# Terraform + provider version pins for the Nawy Clone production stack.
#
# Pinned deliberately conservatively: `~> 5.70` allows 5.71, 5.99 ... but never
# 6.x, which renamed several attributes we rely on (data.aws_region.name, the
# aws_s3_bucket sub-resources, ecs task definition defaults).
# =============================================================================

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
