# =============================================================================
# ALB, listeners, target groups and the routing rules.
#
# This module owns routing end to end. modules/compute only consumes the target
# group ARNs; if compute owned the target groups instead, the ALB would depend
# on the ECS services while the services depend on the listener, which is a
# real Terraform cycle.
#
# Rule priorities come from locals.service_routing so the /docs redirects (50,
# 51) sit in front of the service rules (100-400), and `web` is the listener's
# default action rather than a rule.
# =============================================================================

locals {
  # Everything except the default service needs a routing rule.
  routed_services = {
    for name, cfg in var.service_routing : name => cfg
    if name != var.default_service && length(cfg.path_patterns) > 0
  }

  # HTTPS only when a certificate exists. Without one the ALB serves plain
  # HTTP, which is right for a scratch environment and wrong for anything real
  # — hence the variable validation on acm_certificate_arn upstream.
  https_enabled = var.acm_certificate_arn != ""
}

resource "aws_lb" "this" {
  name               = substr("${var.name_prefix}-alb", 0, 32)
  load_balancer_type = "application"
  internal           = false
  subnets            = var.public_subnet_ids
  security_groups    = [var.security_group_id]

  idle_timeout               = var.idle_timeout
  enable_deletion_protection = var.deletion_protection
  enable_http2               = true
  drop_invalid_header_fields = true

  dynamic "access_logs" {
    for_each = var.enable_access_logs && var.access_logs_bucket != "" ? [1] : []
    content {
      bucket  = var.access_logs_bucket
      prefix  = "alb"
      enabled = true
    }
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-alb" })
}

# --------------------------------------------------------- target groups ----

resource "aws_lb_target_group" "this" {
  for_each = var.service_routing

  name        = substr("${var.name_prefix}-${each.key}", 0, 32)
  port        = each.value.port
  protocol    = each.value.protocol
  target_type = "ip"
  vpc_id      = var.vpc_id

  # Fargate replaces tasks by IP; draining fast keeps deploys quick without
  # cutting in-flight requests.
  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = each.value.health_path
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # rag-svc streams SSE: a reconnect must land on the task holding the thread.
  dynamic "stickiness" {
    for_each = each.value.sticky ? [1] : []
    content {
      type            = "lb_cookie"
      cookie_duration = 3600
      enabled         = true
    }
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-${each.key}", Service = each.key })
}

# --------------------------------------------------------------- listeners --

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  # With a certificate, 80 exists only to redirect. Without one it serves.
  dynamic "default_action" {
    for_each = local.https_enabled ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = local.https_enabled ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.this[var.default_service].arn
    }
  }

  tags = var.tags
}

resource "aws_lb_listener" "https" {
  count = local.https_enabled ? 1 : 0

  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this[var.default_service].arn
  }

  tags = var.tags
}

locals {
  # Rules hang off whichever listener actually carries traffic.
  routing_listener_arn = local.https_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
}

# ------------------------------------------------------------------ rules ---

resource "aws_lb_listener_rule" "service" {
  for_each = local.routed_services

  listener_arn = local.routing_listener_arn
  priority     = each.value.priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this[each.key].arn
  }

  condition {
    path_pattern {
      values = each.value.path_patterns
    }
  }

  tags = merge(var.tags, { Service = each.key })
}

# /docs and /api-docs are edge-only conveniences that 301 to the Swagger UI,
# matching the nginx edge exactly.
resource "aws_lb_listener_rule" "docs" {
  for_each = var.docs_redirects

  listener_arn = local.routing_listener_arn
  priority     = each.value.priority

  action {
    type = "redirect"
    redirect {
      path        = var.swagger_path
      status_code = "HTTP_301"
    }
  }

  condition {
    path_pattern {
      values = each.value.path_patterns
    }
  }

  tags = var.tags
}

# -------------------------------------------------------------------- waf ---

resource "aws_wafv2_web_acl" "this" {
  count = var.enable_waf ? 1 : 0

  name        = "${var.name_prefix}-waf"
  description = "${var.name_prefix} edge protection"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "common-rules"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"

        # The chat endpoint posts long prose, which the size-restriction rule
        # flags; the RAG service does its own injection screening.
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "bad-inputs"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

resource "aws_wafv2_web_acl_association" "this" {
  count = var.enable_waf ? 1 : 0

  resource_arn = aws_lb.this.arn
  web_acl_arn  = aws_wafv2_web_acl.this[0].arn
}

# ------------------------------------------------------------------- dns ----

resource "aws_route53_record" "this" {
  count = var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
