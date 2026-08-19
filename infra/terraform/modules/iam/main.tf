# =============================================================================
# Two roles per service.
#
#   execution role - what the ECS *agent* needs to start the task: pull the
#                    image, read the secrets named in the task definition,
#                    write to the log group.
#   task role      - what the *application* may do once running: S3 for the
#                    services that upload media, OpenSearch for search-svc.
#
# Splitting them means a compromised container never inherits the ability to
# read another service's secrets, because only the agent ever holds that grant
# and it holds it per service.
# =============================================================================

locals {
  # Only these two write brochures and property media to S3.
  s3_writers = toset([for s in var.services : s if contains(["api-core", "reports-svc"], s)])

  # search-svc owns the index; api-core reindexes through it, not directly.
  opensearch_clients = toset([for s in var.services : s if contains(["search-svc"], s)])

  cdn_invalidators = toset([for s in var.services : s if contains(["api-core"], s)])
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

# --------------------------------------------------------- execution roles --

resource "aws_iam_role" "execution" {
  for_each = toset(var.services)

  name               = "${var.name_prefix}-${each.value}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = merge(var.tags, { Service = each.value, RoleType = "execution" })
}

data "aws_iam_policy_document" "execution" {
  for_each = toset(var.services)

  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]
    resources = var.ecr_repository_arns
  }

  statement {
    sid = "Logs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:CreateLogGroup",
    ]
    resources = [var.log_group_arn_pattern]
  }

  # Scoped to exactly the secrets this service's task definition names.
  dynamic "statement" {
    for_each = length(lookup(var.service_secret_arn_patterns, each.value, [])) > 0 ? [1] : []
    content {
      sid       = "ReadOwnSecrets"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = var.service_secret_arn_patterns[each.value]
    }
  }

  dynamic "statement" {
    for_each = length(lookup(var.service_secret_arn_patterns, each.value, [])) > 0 ? [1] : []
    content {
      sid       = "DecryptSecrets"
      actions   = ["kms:Decrypt"]
      resources = [var.kms_key_arn]
      condition {
        test     = "StringEquals"
        variable = "kms:ViaService"
        values   = ["secretsmanager.${var.region}.amazonaws.com"]
      }
    }
  }
}

resource "aws_iam_role_policy" "execution" {
  for_each = toset(var.services)

  name   = "${var.name_prefix}-${each.value}-execution"
  role   = aws_iam_role.execution[each.value].id
  policy = data.aws_iam_policy_document.execution[each.value].json
}

# -------------------------------------------------------------- task roles --

resource "aws_iam_role" "task" {
  for_each = toset(var.services)

  name               = "${var.name_prefix}-${each.value}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = merge(var.tags, { Service = each.value, RoleType = "task" })
}

data "aws_iam_policy_document" "task" {
  for_each = toset(var.services)

  # ECS Exec needs a channel to SSM. Off by default; on in non-prod for triage.
  dynamic "statement" {
    for_each = var.enable_execute_command ? [1] : []
    content {
      sid = "ExecuteCommand"
      actions = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel",
      ]
      resources = ["*"]
    }
  }

  dynamic "statement" {
    for_each = contains(local.s3_writers, each.value) ? [1] : []
    content {
      sid     = "MediaObjects"
      actions = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
      resources = [
        for prefix in var.media_bucket_prefixes : "${var.media_bucket_arn}/${prefix}*"
      ]
    }
  }

  dynamic "statement" {
    for_each = contains(local.s3_writers, each.value) ? [1] : []
    content {
      sid       = "MediaBucketList"
      actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
      resources = [var.media_bucket_arn]
    }
  }

  # The media bucket is encrypted with a customer-managed key, so s3:PutObject
  # alone is not enough — writing an object means asking KMS for a data key, and
  # reading one back means decrypting it. Scoped through S3 so this grant cannot
  # be used against the key directly.
  dynamic "statement" {
    for_each = contains(local.s3_writers, each.value) ? [1] : []
    content {
      sid       = "MediaObjectEncryption"
      actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
      resources = [var.media_kms_key_arn]
      condition {
        test     = "StringEquals"
        variable = "kms:ViaService"
        values   = ["s3.${var.region}.amazonaws.com"]
      }
    }
  }

  dynamic "statement" {
    for_each = contains(local.opensearch_clients, each.value) ? [1] : []
    content {
      sid       = "OpenSearch"
      actions   = ["es:ESHttpGet", "es:ESHttpPost", "es:ESHttpPut", "es:ESHttpDelete", "es:ESHttpHead"]
      resources = ["${var.opensearch_domain_arn}/*"]
    }
  }

  dynamic "statement" {
    for_each = contains(local.cdn_invalidators, each.value) ? [1] : []
    content {
      sid       = "InvalidateCdn"
      actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
      resources = [var.cdn_distribution_arn]
    }
  }

  # A role with no statements is invalid, so every task gets this harmless
  # read of its own identity.
  statement {
    sid       = "WhoAmI"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task" {
  for_each = toset(var.services)

  name   = "${var.name_prefix}-${each.value}-task"
  role   = aws_iam_role.task[each.value].id
  policy = data.aws_iam_policy_document.task[each.value].json
}
