# Multi-AZ everywhere, no Spot below the baseline, deletion protection on.
#
# domain_name / route53_zone_id / acm_certificate_arn are intentionally left
# unset here: they are account-specific and belong in a private tfvars or on
# the command line. Without acm_certificate_arn the ALB serves plain HTTP,
# which is fine for a smoke test and NOT fine for real traffic.
environment = "prod"
aws_region  = "eu-central-1"
owner       = "platform"

az_count                = 3
single_nat_gateway      = false
enable_flow_logs        = true
flow_log_retention_days = 30

rds_instance_class                      = "db.m6g.large"
rds_allocated_storage                   = 100
rds_max_allocated_storage               = 1000
rds_multi_az                            = true
rds_backup_retention_days               = 30
rds_monitoring_interval                 = 60
rds_performance_insights_retention_days = 31

docdb_instance_class        = "db.r6g.large"
docdb_instance_count        = 2
docdb_backup_retention_days = 30

redis_node_type               = "cache.m6g.large"
redis_num_cache_clusters      = 2
redis_snapshot_retention_days = 7

opensearch_instance_type            = "m6g.large.search"
opensearch_instance_count           = 3
opensearch_dedicated_master_enabled = true
opensearch_master_instance_type     = "m6g.large.search"
opensearch_ebs_volume_size          = 100

database_deletion_protection = true
alb_deletion_protection      = true
force_destroy_buckets        = false
ecr_force_delete             = false
secret_recovery_window_days  = 30

services = {
  web         = { cpu = 512, memory = 1024, desired_count = 3, min_capacity = 3, max_capacity = 20, image_tag = "latest" }
  api-core    = { cpu = 1024, memory = 2048, desired_count = 3, min_capacity = 3, max_capacity = 20, image_tag = "latest" }
  search-svc  = { cpu = 512, memory = 1024, desired_count = 2, min_capacity = 2, max_capacity = 10, image_tag = "latest" }
  rag-svc     = { cpu = 1024, memory = 2048, desired_count = 2, min_capacity = 2, max_capacity = 10, image_tag = "latest" }
  reports-svc = { cpu = 512, memory = 1024, desired_count = 2, min_capacity = 2, max_capacity = 6, image_tag = "latest" }
}

fargate_spot_weight       = 0
fargate_base_count        = 2
enable_container_insights = true
enable_execute_command    = false
log_retention_days        = 90

enable_waf             = true
waf_rate_limit         = 2000
enable_alb_access_logs = true
logs_retention_days    = 90
