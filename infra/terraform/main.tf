# =============================================================================
# Root composition.
#
# Dependency order (strictly one-directional, no cycles):
#
#   network ──► security ──► secrets ──► database ──┐
#        │           │           │                  │
#        │           └──────────►│                  ├──► iam ──► compute
#        │                       │                  │      ▲        │
#        └──► storage ──► loadbalancer ─────────────┘      │        │
#                              └────────────────────────────┘        │
#                                                                    ▼
#                                                            observability
#
# Target groups live in modules/loadbalancer (it owns routing end to end:
# ALB, listeners, rules, stickiness, health-check paths). modules/compute
# consumes their ARNs. Doing it the other way round would make the ALB depend
# on the ECS services *and* the services depend on the listener, which is a
# genuine Terraform cycle.
# =============================================================================

# ---------------------------------------------------------------- network ---

module "network" {
  source = "./modules/network"

  name_prefix             = local.name_prefix
  vpc_cidr                = var.vpc_cidr
  az_count                = var.az_count
  single_nat_gateway      = var.single_nat_gateway
  enable_flow_logs        = var.enable_flow_logs
  flow_log_retention_days = var.flow_log_retention_days
  kms_key_arn             = module.security.kms_key_arn
  tags                    = local.common_tags
}

# --------------------------------------------------------------- security ---

module "security" {
  source = "./modules/security"

  name_prefix              = local.name_prefix
  vpc_id                   = module.network.vpc_id
  vpc_cidr                 = var.vpc_cidr
  alb_ingress_cidrs        = var.alb_ingress_cidrs
  kms_deletion_window_days = var.kms_deletion_window_days
  service_ports            = [for s in values(local.service_routing) : s.port]
  tags                     = local.common_tags
}

# ---------------------------------------------------------------- secrets ---

module "secrets" {
  source = "./modules/secrets"

  name_prefix            = local.name_prefix
  secret_prefix          = local.secret_prefix
  kms_key_arn            = module.security.kms_key_arn
  recovery_window_days   = var.secret_recovery_window_days
  operator_managed_notes = "Set the real value with: aws secretsmanager put-secret-value --secret-id <name> --secret-string <value>"
  tags                   = local.common_tags
}

# ---------------------------------------------------------------- storage ---

module "storage" {
  source = "./modules/storage"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix                   = local.name_prefix
  media_bucket_name             = "${local.name_prefix}-media"
  logs_bucket_name              = "${local.name_prefix}-logs"
  cors_allowed_origins          = [local.web_cors_origin]
  media_transition_ia_days      = var.media_transition_ia_days
  media_transition_glacier_days = var.media_transition_glacier_days
  logs_retention_days           = var.logs_retention_days
  cloudfront_price_class        = var.cloudfront_price_class
  cdn_domain_name               = var.media_domain_name
  route53_zone_id               = var.route53_zone_id
  force_destroy                 = var.force_destroy_buckets
  kms_deletion_window_days      = var.kms_deletion_window_days
  tags                          = local.common_tags
}

# --------------------------------------------------------------- database ---

module "database" {
  source = "./modules/database"

  name_prefix   = local.name_prefix
  secret_prefix = local.secret_prefix
  environment   = var.environment

  subnet_ids  = module.network.private_data_subnet_ids
  vpc_id      = module.network.vpc_id
  kms_key_arn = module.security.kms_key_arn

  rds_security_group_id        = module.security.rds_security_group_id
  docdb_security_group_id      = module.security.docdb_security_group_id
  redis_security_group_id      = module.security.redis_security_group_id
  opensearch_security_group_id = module.security.opensearch_security_group_id

  # Values, not ARNs: modules/secrets generates them, modules/database is the
  # only consumer. They are never surfaced at the root (see outputs.tf).
  credentials = module.secrets.generated_credentials

  postgres_engine_version                 = var.postgres_engine_version
  rds_instance_class                      = var.rds_instance_class
  rds_allocated_storage                   = var.rds_allocated_storage
  rds_max_allocated_storage               = var.rds_max_allocated_storage
  rds_multi_az                            = var.rds_multi_az
  rds_backup_retention_days               = var.rds_backup_retention_days
  rds_performance_insights_retention_days = var.rds_performance_insights_retention_days
  rds_monitoring_interval                 = var.rds_monitoring_interval

  docdb_instance_class        = var.docdb_instance_class
  docdb_instance_count        = var.docdb_instance_count
  docdb_backup_retention_days = var.docdb_backup_retention_days

  redis_node_type               = var.redis_node_type
  redis_engine_version          = var.redis_engine_version
  redis_num_cache_clusters      = var.redis_num_cache_clusters
  redis_snapshot_retention_days = var.redis_snapshot_retention_days

  opensearch_engine_version           = var.opensearch_engine_version
  opensearch_instance_type            = var.opensearch_instance_type
  opensearch_instance_count           = var.opensearch_instance_count
  opensearch_dedicated_master_enabled = var.opensearch_dedicated_master_enabled
  opensearch_master_instance_type     = var.opensearch_master_instance_type
  opensearch_ebs_volume_size          = var.opensearch_ebs_volume_size

  deletion_protection  = var.database_deletion_protection
  recovery_window_days = var.secret_recovery_window_days
  log_retention_days   = var.log_retention_days

  tags = local.common_tags
}

# -------------------------------------------------------------------- ecr ---

module "ecr" {
  source = "./modules/ecr"

  name_prefix          = local.name_prefix
  repositories         = local.service_names
  image_tag_mutability = var.ecr_image_tag_mutability
  keep_last_images     = var.ecr_keep_last_images
  kms_key_arn          = module.security.kms_key_arn
  force_delete         = var.ecr_force_delete
  tags                 = local.common_tags
}

# -------------------------------------------------------------------- iam ---

module "iam" {
  source = "./modules/iam"

  name_prefix           = local.name_prefix
  services              = local.service_names
  account_id            = local.account_id
  partition             = local.partition
  region                = local.region
  log_group_arn_pattern = "arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:${local.ecs_log_group_prefix}/*"

  ecr_repository_arns         = values(module.ecr.repository_arns)
  service_secret_arn_patterns = local.service_secret_arn_patterns
  kms_key_arn                 = module.security.kms_key_arn
  media_bucket_arn            = module.storage.media_bucket_arn
  media_bucket_prefixes       = ["properties/", "developers/", "compounds/", "brochures/", "uploads/"]
  opensearch_domain_arn       = module.database.opensearch_domain_arn
  cdn_distribution_arn        = module.storage.cdn_distribution_arn
  enable_execute_command      = var.enable_execute_command

  tags = local.common_tags
}

# ----------------------------------------------------------- loadbalancer ---

module "loadbalancer" {
  source = "./modules/loadbalancer"

  name_prefix       = local.name_prefix
  vpc_id            = module.network.vpc_id
  public_subnet_ids = module.network.public_subnet_ids
  security_group_id = module.security.alb_security_group_id

  service_routing = local.service_routing
  default_service = "web"
  docs_redirects  = local.docs_redirects
  swagger_path    = local.swagger_path

  domain_name         = var.domain_name
  route53_zone_id     = var.route53_zone_id
  acm_certificate_arn = var.acm_certificate_arn

  idle_timeout        = var.alb_idle_timeout
  deletion_protection = var.alb_deletion_protection
  enable_access_logs  = var.enable_alb_access_logs
  access_logs_bucket  = module.storage.logs_bucket_id
  enable_waf          = var.enable_waf
  waf_rate_limit      = var.waf_rate_limit

  tags = local.common_tags
}

# ---------------------------------------------------------------- compute ---

module "compute" {
  source = "./modules/compute"

  name_prefix               = local.name_prefix
  vpc_id                    = module.network.vpc_id
  subnet_ids                = module.network.private_app_subnet_ids
  security_group_id         = module.security.ecs_service_security_group_id
  enable_container_insights = var.enable_container_insights
  fargate_spot_weight       = var.fargate_spot_weight
  fargate_base_count        = var.fargate_base_count

  service_discovery_namespace = local.service_discovery_namespace
  services                    = local.ecs_services

  log_group_prefix       = local.ecs_log_group_prefix
  log_retention_days     = var.log_retention_days
  kms_key_arn            = module.security.kms_key_arn
  enable_execute_command = var.enable_execute_command
  aws_region             = var.aws_region

  alb_arn_suffix         = module.loadbalancer.alb_arn_suffix
  alb_listener_arn       = module.loadbalancer.routing_listener_arn
  cpu_target_utilization = var.cpu_target_utilization
  requests_per_target    = var.requests_per_target

  tags = local.common_tags
}

# ---------------------------------------------------------- observability ---

module "observability" {
  source = "./modules/observability"

  name_prefix = local.name_prefix
  aws_region  = var.aws_region
  alarm_email = var.alarm_email
  kms_key_arn = module.security.kms_key_arn

  ecs_cluster_name = module.compute.cluster_name
  service_names    = local.service_names
  log_group_names  = module.compute.log_group_names

  alb_arn_suffix            = module.loadbalancer.alb_arn_suffix
  target_group_arn_suffixes = module.loadbalancer.target_group_arn_suffixes

  rds_instance_id         = module.database.rds_instance_id
  redis_replication_group = module.database.redis_replication_group_id
  docdb_cluster_id        = module.database.docdb_cluster_id
  opensearch_domain_name  = module.database.opensearch_domain_name

  alarm_5xx_threshold             = var.alarm_5xx_threshold
  alarm_latency_threshold_seconds = var.alarm_latency_threshold_seconds
  alarm_cpu_threshold             = var.alarm_cpu_threshold
  alarm_db_connection_threshold   = var.alarm_db_connection_threshold

  tags = local.common_tags
}
