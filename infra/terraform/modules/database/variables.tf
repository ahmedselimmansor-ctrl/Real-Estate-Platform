variable "name_prefix" { type = string }
variable "secret_prefix" { type = string }
variable "environment" { type = string }
variable "subnet_ids" { type = list(string) }
variable "vpc_id" { type = string }
variable "kms_key_arn" { type = string }

variable "rds_security_group_id" { type = string }
variable "docdb_security_group_id" { type = string }
variable "redis_security_group_id" { type = string }
variable "opensearch_security_group_id" { type = string }

variable "credentials" {
  description = "Generated plaintext credentials from modules/secrets."
  type        = map(string)
  sensitive   = true
}

variable "postgres_engine_version" { type = string }
variable "rds_instance_class" { type = string }
variable "rds_allocated_storage" { type = number }
variable "rds_max_allocated_storage" { type = number }
variable "rds_multi_az" { type = bool }
variable "rds_backup_retention_days" { type = number }
variable "rds_performance_insights_retention_days" { type = number }
variable "rds_monitoring_interval" { type = number }

variable "docdb_instance_class" { type = string }
variable "docdb_instance_count" { type = number }
variable "docdb_backup_retention_days" { type = number }

variable "redis_node_type" { type = string }
variable "redis_engine_version" { type = string }
variable "redis_num_cache_clusters" { type = number }
variable "redis_snapshot_retention_days" { type = number }

variable "opensearch_engine_version" { type = string }
variable "opensearch_instance_type" { type = string }
variable "opensearch_instance_count" { type = number }
variable "opensearch_dedicated_master_enabled" { type = bool }
variable "opensearch_master_instance_type" { type = string }
variable "opensearch_ebs_volume_size" { type = number }

variable "deletion_protection" { type = bool }
variable "recovery_window_days" { type = number }
variable "log_retention_days" { type = number }

variable "tags" {
  type    = map(string)
  default = {}
}
