# =============================================================================
# Remote-state bootstrap. Run this ONCE per AWS account, before the main root.
#
#   cd infra/terraform/bootstrap
#   terraform init && terraform apply -var 'project_name=topchoice'
#
# It keeps its own state locally (and in the repo's .gitignore) because it is
# the thing that creates the remote backend everything else uses. That is the
# one chicken-and-egg case where local state is correct rather than sloppy.
# =============================================================================

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "topchoice"
      ManagedBy = "terraform"
      Component = "tf-backend"
    }
  }
}

variable "project_name" {
  type    = string
  default = "topchoice"
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

data "aws_caller_identity" "current" {}

locals {
  # The account id keeps the bucket name globally unique without the operator
  # having to invent one.
  bucket_name = "${var.project_name}-tfstate-${data.aws_caller_identity.current.account_id}"
  table_name  = "${var.project_name}-tfstate-lock"
}

resource "aws_s3_bucket" "state" {
  bucket = local.bucket_name

  # State is the one thing that must never be destroyed by a stray apply.
  lifecycle {
    prevent_destroy = true
  }

  tags = { Name = local.bucket_name }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

data "aws_iam_policy_document" "state" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state.json

  depends_on = [aws_s3_bucket_public_access_block.state]
}

resource "aws_dynamodb_table" "lock" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = { Name = local.table_name }
}

output "backend_config" {
  description = "Paste these into environments/<env>.backend.hcl"
  value = {
    bucket         = aws_s3_bucket.state.id
    dynamodb_table = aws_dynamodb_table.lock.name
    region         = var.aws_region
    encrypt        = true
  }
}
