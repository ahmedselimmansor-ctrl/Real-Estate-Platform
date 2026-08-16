# Smallest thing that actually runs. Single NAT, single-AZ data tier, Spot-heavy.
environment = "dev"
aws_region  = "eu-central-1"
owner       = "platform"

az_count           = 2
single_nat_gateway = true
enable_flow_logs   = false

# --- data tier: burstable, no HA, short retention ---
rds_instance_class                      = "db.t4g.micro"
rds_allocated_storage                   = 20
rds_max_allocated_storage               = 50
rds_multi_az                            = false
rds_backup_retention_days               = 1
rds_monitoring_interval                 = 0
rds_performance_insights_retention_days = 0

docdb_instance_class        = "db.t4g.medium"
docdb_instance_count        = 1
docdb_backup_retention_days = 1

redis_node_type               = "cache.t4g.micro"
redis_num_cache_clusters      = 1
redis_snapshot_retention_days = 0

opensearch_instance_type            = "t3.small.search"
opensearch_instance_count           = 1
opensearch_dedicated_master_enabled = false
opensearch_ebs_volume_size          = 10

# Nothing here is precious; let `terraform destroy` actually work.
database_deletion_protection = false
alb_deletion_protection      = false
force_destroy_buckets        = true
ecr_force_delete             = true
secret_recovery_window_days  = 0

# --- compute ---
services = {
  web         = { cpu = 256, memory = 512, desired_count = 1, min_capacity = 1, max_capacity = 2, image_tag = "latest" }
  api-core    = { cpu = 512, memory = 1024, desired_count = 1, min_capacity = 1, max_capacity = 2, image_tag = "latest" }
  search-svc  = { cpu = 256, memory = 512, desired_count = 1, min_capacity = 1, max_capacity = 2, image_tag = "latest" }
  rag-svc     = { cpu = 512, memory = 1024, desired_count = 1, min_capacity = 1, max_capacity = 2, image_tag = "latest" }
  reports-svc = { cpu = 256, memory = 512, desired_count = 1, min_capacity = 1, max_capacity = 2, image_tag = "latest" }
}

fargate_spot_weight       = 100
fargate_base_count        = 0
enable_container_insights = false
enable_execute_command    = true
log_retention_days        = 7

enable_waf             = false
enable_alb_access_logs = false
