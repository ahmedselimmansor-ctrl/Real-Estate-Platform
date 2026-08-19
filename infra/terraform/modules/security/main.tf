# =============================================================================
# The one customer-managed KMS key, and every security group in the stack.
#
# Groups reference each other by id rather than CIDR, so "who may talk to the
# database" is a statement about identity, not about a subnet range that might
# be reused later.
# =============================================================================

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

# ------------------------------------------------------------------- kms ----

data "aws_iam_policy_document" "kms" {
  statement {
    sid       = "AccountRoot"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*",
      "kms:GenerateDataKey*", "kms:Describe*",
    ]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.name}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:*"]
    }
  }
}

resource "aws_kms_key" "this" {
  description             = "${var.name_prefix} data at rest"
  deletion_window_in_days = var.kms_deletion_window_days
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.kms.json

  tags = merge(var.tags, { Name = "${var.name_prefix}-kms" })
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.name_prefix}"
  target_key_id = aws_kms_key.this.key_id
}

# ------------------------------------------------------------------- alb ----

resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb"
  description = "Public ingress to the application load balancer"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.name_prefix}-alb" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  for_each = toset(var.alb_ingress_cidrs)

  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from ${each.value}"
  cidr_ipv4         = each.value
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

# Port 80 exists only to 301 to HTTPS (see modules/loadbalancer).
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  for_each = toset(var.alb_ingress_cidrs)

  security_group_id = aws_security_group.alb.id
  description       = "HTTP from ${each.value}, redirected to HTTPS"
  cidr_ipv4         = each.value
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_tasks" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward to the ECS tasks"
  referenced_security_group_id = aws_security_group.ecs.id
  ip_protocol                  = "-1"
}

# ------------------------------------------------------------------ tasks ---

resource "aws_security_group" "ecs" {
  name        = "${var.name_prefix}-ecs-tasks"
  description = "Fargate tasks"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.name_prefix}-ecs-tasks" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  for_each = toset([for port in var.service_ports : tostring(port)])

  security_group_id            = aws_security_group.ecs.id
  description                  = "ALB to container port ${each.value}"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = tonumber(each.value)
  to_port                      = tonumber(each.value)
  ip_protocol                  = "tcp"
}

# Service-to-service over Cloud Map (api-core -> search-svc, rag-svc -> …).
resource "aws_vpc_security_group_ingress_rule" "ecs_self" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "Service to service inside the mesh"
  referenced_security_group_id = aws_security_group.ecs.id
  ip_protocol                  = "-1"
}

# Egress is split in two rather than one blanket 0.0.0.0/0 on every protocol.
# The tasks need exactly two things: the data tier, which is inside the VPC on
# assorted ports (5432, 27017, 6379, 443), and the public internet, which is
# only ever HTTPS — AWS service APIs, the model providers, and the RAG web
# search tool. Nothing here speaks plaintext or a non-TCP protocol outbound.
resource "aws_vpc_security_group_egress_rule" "ecs_vpc" {
  security_group_id = aws_security_group.ecs.id
  description       = "Data tier and service mesh, inside the VPC"
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "-1"
}

# The destination genuinely is the open internet: the RAG service calls a model
# provider and a web search API, and the tasks reach AWS service endpoints. Those
# addresses are not knowable in advance, so there is no narrower CIDR to write.
# What is narrowed is everything else — this is TCP 443, where the rule it
# replaced was every protocol on every port.
#trivy:ignore:AWS-0104
resource "aws_vpc_security_group_egress_rule" "ecs_https" {
  security_group_id = aws_security_group.ecs.id
  description       = "AWS APIs, model providers and web search, HTTPS only"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

# ------------------------------------------------------------- data tier ----
# One group per engine; each accepts only its own port, only from the tasks.

locals {
  data_stores = {
    rds        = { port = 5432, description = "PostgreSQL" }
    docdb      = { port = 27017, description = "DocumentDB" }
    redis      = { port = 6379, description = "ElastiCache Redis" }
    opensearch = { port = 443, description = "OpenSearch HTTPS" }
  }
}

resource "aws_security_group" "data" {
  for_each = local.data_stores

  name        = "${var.name_prefix}-${each.key}"
  description = each.value.description
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.name_prefix}-${each.key}" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "data_from_ecs" {
  for_each = local.data_stores

  security_group_id            = aws_security_group.data[each.key].id
  description                  = "${each.value.description} from the ECS tasks"
  referenced_security_group_id = aws_security_group.ecs.id
  from_port                    = each.value.port
  to_port                      = each.value.port
  ip_protocol                  = "tcp"
}
