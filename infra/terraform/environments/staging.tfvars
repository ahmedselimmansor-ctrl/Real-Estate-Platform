# Production-shaped but single-AZ data tier: catches wiring bugs, not load.
environment = "staging"
aws_region  = "eu-central-1"
owner       = "platform"

az_count           = 2
single_nat_gateway = true
enable_flow_logs   = true

rds_instance_class        = "db.t4g.small"
rds_allocated_storage     = 50
rds_max_allocated_storage = 200
rds_multi_az              = false
rds_backup_retention_days = 7

docdb_instance_class = "db.t4g.medium"
docdb_instance_count = 1

redis_node_type          = "cache.t4g.small"
redis_num_cache_clusters = 2

opensearch_instance_type            = "t3.medium.search"
opensearch_instance_count           = 2
opensearch_dedicated_master_enabled = false
opensearch_ebs_volume_size          = 20

database_deletion_protection = false
alb_deletion_protection      = false
force_destroy_buckets        = false
secret_recovery_window_days  = 7

fargate_spot_weight    = 50
fargate_base_count     = 1
enable_execute_command = true
log_retention_days     = 14

enable_waf             = true
enable_alb_access_logs = true
