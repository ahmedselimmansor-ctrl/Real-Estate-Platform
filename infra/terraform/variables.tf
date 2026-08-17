# =============================================================================
# Root input variables.
#
# Everything that differs between dev and prod is a variable with a safe
# default; environments/*.tfvars only override what actually changes.
# Contract-fixed facts (ports, route prefixes, env var names, health paths)
# are NOT variables — they live in locals.tf so they cannot drift.
# =============================================================================

# ------------------------------------------------------------------ identity -

variable "project_name" {
  description = "Project slug used to name and tag every resource. Also the Secrets Manager path prefix (`<project>/<env>/<key>`)."
  type        = string
  default     = "topchoice"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.project_name))
    error_message = "project_name must be 3-25 chars, lowercase letters/digits/hyphens, starting with a letter."
  }
}

variable "environment" {
  description = "Deployment environment. Drives HA, sizing, deletion protection and image-tag immutability."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "AWS region for the whole stack. Matches CONTRACT §7 AWS_REGION."
  type        = string
  default     = "eu-central-1"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]$", var.aws_region))
    error_message = "aws_region must look like eu-central-1."
  }
}

variable "owner" {
  description = "Owner tag value (team or person accountable for the stack)."
  type        = string
  default     = "platform"
}

variable "extra_tags" {
  description = "Additional tags merged into the common tag map applied to every resource."
  type        = map(string)
  default     = {}
}

# ------------------------------------------------------------------- network -

variable "vpc_cidr" {
  description = "CIDR block for the VPC. Must be at least a /20 so the 3x az_count subnets fit."
  type        = string
  default     = "10.42.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && tonumber(split("/", var.vpc_cidr)[1]) <= 20
    error_message = "vpc_cidr must be a valid IPv4 CIDR with a prefix length of /20 or larger (numerically <= 20)."
  }
}

variable "az_count" {
  description = "Number of Availability Zones to spread the VPC across."
  type        = number
  default     = 3

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "single_nat_gateway" {
  description = "true = one shared NAT gateway for all private subnets (cheap, dev). false = one NAT gateway per AZ (HA, prod)."
  type        = bool
  default     = false
}

variable "enable_flow_logs" {
  description = "Publish VPC flow logs to CloudWatch Logs."
  type        = bool
  default     = true
}

variable "flow_log_retention_days" {
  description = "Retention for the VPC flow log group, in days."
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.flow_log_retention_days)
    error_message = "flow_log_retention_days must be one of the retention values CloudWatch Logs accepts."
  }
}

# ------------------------------------------------------------------ security -

variable "alb_ingress_cidrs" {
  description = "Source CIDRs allowed to reach the ALB on 80/443. Default is the whole internet, as the ALB is the public edge."
  type        = list(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition     = length(var.alb_ingress_cidrs) > 0 && alltrue([for c in var.alb_ingress_cidrs : can(cidrhost(c, 0))])
    error_message = "alb_ingress_cidrs must be a non-empty list of valid IPv4 CIDR blocks."
  }
}

variable "kms_deletion_window_days" {
  description = "Waiting period before a scheduled KMS key deletion completes."
  type        = number
  default     = 30

  validation {
    condition     = var.kms_deletion_window_days >= 7 && var.kms_deletion_window_days <= 30
    error_message = "kms_deletion_window_days must be between 7 and 30."
  }
}

# --------------------------------------------------------------------- dns ---

variable "domain_name" {
  description = "Apex/public hostname for the app, e.g. topchoice.example.com. Empty string = use the raw ALB DNS name and the default CloudFront certificate."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID used for ACM DNS validation and the app alias record. Empty string = bring your own certificate via acm_certificate_arn."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "Pre-existing regional ACM certificate ARN for the ALB HTTPS listener. Leave empty to have Terraform issue and DNS-validate one (requires domain_name + route53_zone_id)."
  type        = string
  default     = ""
}

variable "media_domain_name" {
  description = "Optional custom hostname for the CloudFront media distribution, e.g. cdn.topchoice.example.com. Empty = use the *.cloudfront.net domain."
  type        = string
  default     = ""
}

# ------------------------------------------------------------------ storage --

variable "media_transition_ia_days" {
  description = "Days before media objects transition to S3 Standard-IA."
  type        = number
  default     = 60

  validation {
    condition     = var.media_transition_ia_days >= 30
    error_message = "S3 requires at least 30 days before a Standard-IA transition."
  }
}

variable "media_transition_glacier_days" {
  description = "Days before non-current media object versions transition to Glacier Instant Retrieval."
  type        = number
  default     = 180

  validation {
    condition     = var.media_transition_glacier_days >= 90
    error_message = "media_transition_glacier_days should be at least 90 to be cheaper than Standard-IA."
  }
}

variable "logs_retention_days" {
  description = "Days before ALB/CloudFront access logs in the logs bucket expire."
  type        = number
  default     = 90

  validation {
    condition     = var.logs_retention_days >= 7
    error_message = "logs_retention_days must be at least 7."
  }
}

variable "cloudfront_price_class" {
  description = "CloudFront price class. PriceClass_100 = NA+EU only (cheapest, fine for an Egypt/EU audience served from eu-central-1)."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "cloudfront_price_class must be PriceClass_100, PriceClass_200 or PriceClass_All."
  }
}

variable "force_destroy_buckets" {
  description = "Allow Terraform to delete non-empty S3 buckets. NEVER enable in prod."
  type        = bool
  default     = false
}

# ------------------------------------------------------------------ secrets --

variable "secret_recovery_window_days" {
  description = "Secrets Manager recovery window. 0 = delete immediately (handy in dev, forbidden in prod because the name cannot be reused for 7 days otherwise)."
  type        = number
  default     = 30

  validation {
    condition     = var.secret_recovery_window_days == 0 || (var.secret_recovery_window_days >= 7 && var.secret_recovery_window_days <= 30)
    error_message = "secret_recovery_window_days must be 0, or between 7 and 30."
  }
}

# ---------------------------------------------------------------- databases --

variable "postgres_engine_version" {
  description = "RDS PostgreSQL engine version. A bare major ('16') lets RDS pick the newest supported minor."
  type        = string
  default     = "16"
}

variable "rds_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.medium"

  validation {
    condition     = can(regex("^db\\.", var.rds_instance_class))
    error_message = "rds_instance_class must start with 'db.'."
  }
}

variable "rds_allocated_storage" {
  description = "Initial gp3 storage for RDS, in GiB."
  type        = number
  default     = 50

  validation {
    condition     = var.rds_allocated_storage >= 20 && var.rds_allocated_storage <= 65536
    error_message = "rds_allocated_storage must be between 20 and 65536 GiB."
  }
}

variable "rds_max_allocated_storage" {
  description = "Upper bound for RDS storage autoscaling, in GiB. Must exceed rds_allocated_storage."
  type        = number
  default     = 500
}

variable "rds_multi_az" {
  description = "Run RDS as a Multi-AZ deployment (synchronous standby in a second AZ)."
  type        = bool
  default     = true
}

variable "rds_backup_retention_days" {
  description = "Automated backup retention for RDS, in days."
  type        = number
  default     = 14

  validation {
    condition     = var.rds_backup_retention_days >= 7 && var.rds_backup_retention_days <= 30
    error_message = "rds_backup_retention_days must be between 7 and 30 (CONTRACT-level requirement for this stack)."
  }
}

variable "rds_performance_insights_retention_days" {
  description = "Performance Insights retention. 7 is the free tier; 31/93/... are paid long-term retention."
  type        = number
  default     = 7

  validation {
    condition     = contains([7, 31, 93, 186, 372, 465, 558, 651, 731], var.rds_performance_insights_retention_days)
    error_message = "rds_performance_insights_retention_days must be 7 or a multiple-of-31 long-term value (31, 93, 186, 372, 465, 558, 651, 731)."
  }
}

variable "rds_monitoring_interval" {
  description = "Enhanced Monitoring granularity in seconds. 0 disables it."
  type        = number
  default     = 60

  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.rds_monitoring_interval)
    error_message = "rds_monitoring_interval must be one of 0, 1, 5, 10, 15, 30, 60."
  }
}

variable "docdb_instance_class" {
  description = "DocumentDB instance class (MongoDB-compatible tier, CONTRACT §2 Mongo ownership)."
  type        = string
  default     = "db.t4g.medium"
}

variable "docdb_instance_count" {
  description = "Number of DocumentDB instances (1 writer + N-1 readers)."
  type        = number
  default     = 2

  validation {
    condition     = var.docdb_instance_count >= 1 && var.docdb_instance_count <= 6
    error_message = "docdb_instance_count must be between 1 and 6."
  }
}

variable "docdb_backup_retention_days" {
  description = "DocumentDB automated backup retention, in days."
  type        = number
  default     = 14

  validation {
    condition     = var.docdb_backup_retention_days >= 1 && var.docdb_backup_retention_days <= 35
    error_message = "docdb_backup_retention_days must be between 1 and 35."
  }
}

variable "redis_node_type" {
  description = "ElastiCache node type for the Redis replication group."
  type        = string
  default     = "cache.t4g.small"

  validation {
    condition     = can(regex("^cache\\.", var.redis_node_type))
    error_message = "redis_node_type must start with 'cache.'."
  }
}

variable "redis_engine_version" {
  description = "ElastiCache Redis engine version (CONTRACT §1 uses Redis 7)."
  type        = string
  default     = "7.1"
}

variable "redis_num_cache_clusters" {
  description = "Total nodes in the replication group (1 primary + N-1 replicas). Must be >= 2 for automatic failover."
  type        = number
  default     = 2

  validation {
    condition     = var.redis_num_cache_clusters >= 1 && var.redis_num_cache_clusters <= 6
    error_message = "redis_num_cache_clusters must be between 1 and 6."
  }
}

variable "redis_snapshot_retention_days" {
  description = "Days of daily Redis snapshots to keep. 0 disables snapshots (t4g.micro and below cannot snapshot)."
  type        = number
  default     = 5
}

variable "opensearch_engine_version" {
  description = "Amazon OpenSearch Service engine version. Stands in for the self-hosted Elasticsearch 8.15 of the local stack — see README 'What this does NOT do'."
  type        = string
  default     = "OpenSearch_2.17"
}

variable "opensearch_instance_type" {
  description = "OpenSearch data node instance type."
  type        = string
  default     = "m6g.large.search"
}

variable "opensearch_instance_count" {
  description = "Number of OpenSearch data nodes. Use 2 with 2 AZs, 3 with 3 AZs, so shards spread evenly."
  type        = number
  default     = 3

  validation {
    condition     = var.opensearch_instance_count >= 2 && var.opensearch_instance_count <= 6
    error_message = "opensearch_instance_count must be between 2 and 6."
  }
}

variable "opensearch_dedicated_master_enabled" {
  description = "Run three dedicated master nodes (recommended in prod, wasteful in dev)."
  type        = bool
  default     = true
}

variable "opensearch_master_instance_type" {
  description = "OpenSearch dedicated master instance type (ignored unless opensearch_dedicated_master_enabled)."
  type        = string
  default     = "m6g.large.search"
}

variable "opensearch_ebs_volume_size" {
  description = "gp3 EBS volume size per OpenSearch data node, in GiB."
  type        = number
  default     = 100

  validation {
    condition     = var.opensearch_ebs_volume_size >= 10 && var.opensearch_ebs_volume_size <= 3584
    error_message = "opensearch_ebs_volume_size must be between 10 and 3584 GiB."
  }
}

variable "database_deletion_protection" {
  description = "Enable deletion protection on RDS, DocumentDB and the ALB. Must be true in prod."
  type        = bool
  default     = true
}

# --------------------------------------------------------------------- ecr ---

variable "ecr_image_tag_mutability" {
  description = "ECR tag mutability. IMMUTABLE in prod so a deployed digest can never be silently replaced."
  type        = string
  default     = "IMMUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.ecr_image_tag_mutability)
    error_message = "ecr_image_tag_mutability must be MUTABLE or IMMUTABLE."
  }
}

variable "ecr_keep_last_images" {
  description = "How many tagged images each ECR repository retains before the lifecycle policy expires the oldest."
  type        = number
  default     = 20

  validation {
    condition     = var.ecr_keep_last_images >= 1 && var.ecr_keep_last_images <= 1000
    error_message = "ecr_keep_last_images must be between 1 and 1000."
  }
}

variable "ecr_force_delete" {
  description = "Allow Terraform to delete ECR repositories that still contain images. NEVER enable in prod."
  type        = bool
  default     = false
}

# ------------------------------------------------------------------ compute --

variable "services" {
  description = <<-EOT
    Per-service sizing. Keys MUST be exactly the five services in CONTRACT §1:
    web, api-core, search-svc, rag-svc, reports-svc. Ports, health paths and
    route prefixes are contract-fixed and live in locals.tf, not here.

      cpu           - Fargate CPU units (256/512/1024/2048/4096)
      memory        - Fargate memory in MiB (must be legal for the CPU value)
      desired_count - baseline task count
      min_capacity  - Application Auto Scaling floor
      max_capacity  - Application Auto Scaling ceiling
      image_tag     - tag pulled from the service's ECR repository
  EOT
  type = map(object({
    cpu           = number
    memory        = number
    desired_count = number
    min_capacity  = number
    max_capacity  = number
    image_tag     = string
  }))
  default = {
    web         = { cpu = 512, memory = 1024, desired_count = 2, min_capacity = 2, max_capacity = 10, image_tag = "latest" }
    api-core    = { cpu = 1024, memory = 2048, desired_count = 2, min_capacity = 2, max_capacity = 12, image_tag = "latest" }
    search-svc  = { cpu = 512, memory = 1024, desired_count = 2, min_capacity = 2, max_capacity = 8, image_tag = "latest" }
    rag-svc     = { cpu = 1024, memory = 2048, desired_count = 2, min_capacity = 2, max_capacity = 8, image_tag = "latest" }
    reports-svc = { cpu = 512, memory = 1024, desired_count = 1, min_capacity = 1, max_capacity = 4, image_tag = "latest" }
  }

  validation {
    condition     = length(setsubtract(keys(var.services), ["web", "api-core", "search-svc", "rag-svc", "reports-svc"])) == 0
    error_message = "services may only contain the CONTRACT §1 keys: web, api-core, search-svc, rag-svc, reports-svc."
  }

  validation {
    condition     = length(setsubtract(["web", "api-core", "search-svc", "rag-svc", "reports-svc"], keys(var.services))) == 0
    error_message = "services must define all five CONTRACT §1 services."
  }

  validation {
    condition     = alltrue([for s in values(var.services) : contains([256, 512, 1024, 2048, 4096], s.cpu)])
    error_message = "Every service cpu must be one of 256, 512, 1024, 2048, 4096 (Fargate task sizes)."
  }

  validation {
    condition     = alltrue([for s in values(var.services) : s.memory >= 512 && s.memory % 128 == 0])
    error_message = "Every service memory must be >= 512 MiB and a multiple of 128."
  }

  validation {
    condition     = alltrue([for s in values(var.services) : s.min_capacity >= 1 && s.max_capacity >= s.min_capacity && s.desired_count >= s.min_capacity && s.desired_count <= s.max_capacity])
    error_message = "For every service: 1 <= min_capacity <= desired_count <= max_capacity."
  }

  validation {
    condition     = alltrue([for s in values(var.services) : length(trimspace(s.image_tag)) > 0])
    error_message = "Every service needs a non-empty image_tag."
  }
}

variable "enable_container_insights" {
  description = "Enable ECS Container Insights on the cluster (per-task CPU/memory/network metrics; costs extra)."
  type        = bool
  default     = true
}

variable "fargate_spot_weight" {
  description = "Weight of FARGATE_SPOT in the cluster capacity-provider strategy. 0 = on-demand only (prod), >0 = mostly Spot (dev)."
  type        = number
  default     = 0

  validation {
    condition     = var.fargate_spot_weight >= 0 && var.fargate_spot_weight <= 100
    error_message = "fargate_spot_weight must be between 0 and 100."
  }
}

variable "fargate_base_count" {
  description = "Number of tasks pinned to on-demand FARGATE before the weighted split applies."
  type        = number
  default     = 1

  validation {
    condition     = var.fargate_base_count >= 0
    error_message = "fargate_base_count must be >= 0."
  }
}

variable "log_retention_days" {
  description = "Retention for the per-service ECS CloudWatch log groups, in days."
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 3653], var.log_retention_days)
    error_message = "log_retention_days must be one of the retention values CloudWatch Logs accepts."
  }
}

variable "enable_execute_command" {
  description = "Enable ECS Exec (`aws ecs execute-command`) for interactive shells into running tasks."
  type        = bool
  default     = true
}

variable "cpu_target_utilization" {
  description = "Target average CPU utilisation (%) for the per-service target-tracking scaling policy."
  type        = number
  default     = 60

  validation {
    condition     = var.cpu_target_utilization > 10 && var.cpu_target_utilization <= 90
    error_message = "cpu_target_utilization must be between 11 and 90."
  }
}

variable "requests_per_target" {
  description = "Target ALBRequestCountPerTarget for the per-service request-based scaling policy."
  type        = number
  default     = 1000

  validation {
    condition     = var.requests_per_target >= 10
    error_message = "requests_per_target must be at least 10."
  }
}

# ----------------------------------------------------------- load balancer ---

variable "alb_idle_timeout" {
  description = "ALB idle timeout in seconds. Must exceed the RAG SSE stream lifetime (nginx uses proxy_read_timeout 600s for /api/chat/)."
  type        = number
  default     = 660

  validation {
    condition     = var.alb_idle_timeout >= 60 && var.alb_idle_timeout <= 4000
    error_message = "alb_idle_timeout must be between 60 and 4000 seconds."
  }
}

variable "enable_waf" {
  description = "Attach an AWS WAFv2 web ACL (managed common rule set + rate limiting) to the ALB."
  type        = bool
  default     = true
}

variable "waf_rate_limit" {
  description = "Requests per 5-minute window per source IP before the WAF rate-based rule blocks."
  type        = number
  default     = 3000

  validation {
    condition     = var.waf_rate_limit >= 100 && var.waf_rate_limit <= 2000000000
    error_message = "waf_rate_limit must be between 100 and 2000000000."
  }
}

variable "enable_alb_access_logs" {
  description = "Write ALB access logs to the logs bucket."
  type        = bool
  default     = true
}

variable "alb_deletion_protection" {
  description = "Protect the ALB from accidental `terraform destroy`."
  type        = bool
  default     = true
}

# ----------------------------------------------------------- observability ---

variable "alarm_email" {
  description = "Email address subscribed to the alarm SNS topic. Empty = create the topic but no subscription (wire it up manually or via another module)."
  type        = string
  default     = ""

  validation {
    condition     = var.alarm_email == "" || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alarm_email))
    error_message = "alarm_email must be empty or a valid email address."
  }
}

variable "alarm_5xx_threshold" {
  description = "Number of ALB 5xx responses in a 5-minute period that trips the error alarm."
  type        = number
  default     = 25
}

variable "alarm_latency_threshold_seconds" {
  description = "p95 target response time (seconds) that trips the latency alarm."
  type        = number
  default     = 2
}

variable "alarm_cpu_threshold" {
  description = "Average service CPU utilisation (%) that trips the CPU alarm."
  type        = number
  default     = 85
}

variable "alarm_db_connection_threshold" {
  description = "RDS DatabaseConnections count that trips the connection-saturation alarm."
  type        = number
  default     = 150
}
