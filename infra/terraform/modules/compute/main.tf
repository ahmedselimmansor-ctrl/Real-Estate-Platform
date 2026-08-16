# =============================================================================
# The ECS cluster, one Fargate service per application, and their autoscaling.
#
# Service discovery is a private Cloud Map namespace so the CONTRACT §7 URL
# shape (http://api-core:4000) stays meaningful in AWS as
# http://api-core.<namespace>:4000. That is why the services talk to each other
# without going back out through the ALB.
# =============================================================================

resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.enable_container_insights ? "enabled" : "disabled"
  }

  configuration {
    execute_command_configuration {
      kms_key_id = var.kms_key_arn
      logging    = "DEFAULT"
    }
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-cluster" })
}

# A base of on-demand tasks keeps the service alive through a Spot reclaim;
# everything above that base may be Spot.
resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = var.fargate_base_count
    weight            = 100 - var.fargate_spot_weight
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    base              = 0
    weight            = var.fargate_spot_weight
  }
}

# ------------------------------------------------------- service discovery --

resource "aws_service_discovery_private_dns_namespace" "this" {
  name        = var.service_discovery_namespace
  description = "${var.name_prefix} internal service discovery"
  vpc         = var.vpc_id

  tags = merge(var.tags, { Name = var.service_discovery_namespace })
}

resource "aws_service_discovery_service" "this" {
  for_each = var.services

  name = each.key

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.this.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  force_destroy = true

  tags = merge(var.tags, { Service = each.key })
}

# ------------------------------------------------------------------- logs ---

resource "aws_cloudwatch_log_group" "this" {
  for_each = var.services

  name              = "${var.log_group_prefix}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn

  tags = merge(var.tags, { Service = each.key })
}

# -------------------------------------------------------- task definitions --

resource "aws_ecs_task_definition" "this" {
  for_each = var.services

  family                   = "${var.name_prefix}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = each.value.execution_role_arn
  task_role_arn            = each.value.task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = each.value.image
      essential = true

      portMappings = [
        {
          name          = "${each.key}-${each.value.container_port}"
          containerPort = each.value.container_port
          hostPort      = each.value.container_port
          protocol      = "tcp"
          appProtocol   = "http"
        },
      ]

      environment = [
        for name, value in each.value.environment : { name = name, value = tostring(value) }
      ]

      secrets = [
        for name, arn in each.value.secrets : { name = name, valueFrom = arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.this[each.key].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = each.key
        }
      }

      healthCheck = {
        command     = each.value.health_check_command
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      # A container that exits should take the task with it rather than sit
      # half-dead behind a passing ALB health check.
      stopTimeout = 30
    },
  ])

  tags = merge(var.tags, { Service = each.key })
}

# --------------------------------------------------------------- services ---

resource "aws_ecs_service" "this" {
  for_each = var.services

  name            = each.key
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this[each.key].arn
  desired_count   = each.value.desired_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = var.fargate_base_count
    weight            = 100 - var.fargate_spot_weight
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    base              = 0
    weight            = var.fargate_spot_weight
  }

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = each.value.target_group_arn
    container_name   = each.key
    container_port   = each.value.container_port
  }

  service_registries {
    registry_arn = aws_service_discovery_service.this[each.key].arn
  }

  # Rolling deploy that can go to zero spare capacity but never below the
  # running count, so a bad image cannot take the service down entirely.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  health_check_grace_period_seconds = 120
  enable_execute_command            = var.enable_execute_command
  propagate_tags                    = "SERVICE"
  wait_for_steady_state             = false

  # The image tag moves with each deploy (CI pushes and calls update-service),
  # so Terraform must not fight the pipeline over desired_count or the task
  # definition revision.
  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }

  tags = merge(var.tags, { Service = each.key })

  depends_on = [aws_ecs_cluster_capacity_providers.this]
}

# ------------------------------------------------------------- autoscaling --

resource "aws_appautoscaling_target" "this" {
  for_each = var.services

  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.this[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = each.value.min_capacity
  max_capacity       = each.value.max_capacity

  tags = merge(var.tags, { Service = each.key })
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = var.services

  name               = "${var.name_prefix}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this[each.key].service_namespace
  resource_id        = aws_appautoscaling_target.this[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.this[each.key].scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value = var.cpu_target_utilization

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Request-count tracking reacts to a traffic spike before CPU has climbed.
resource "aws_appautoscaling_policy" "requests" {
  for_each = var.services

  name               = "${var.name_prefix}-${each.key}-requests"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this[each.key].service_namespace
  resource_id        = aws_appautoscaling_target.this[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.this[each.key].scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value = var.requests_per_target

    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${var.alb_arn_suffix}/${each.value.target_group_arn_suffix}"
    }

    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
