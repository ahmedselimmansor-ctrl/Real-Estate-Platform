variable "name_prefix" { type = string }
variable "aws_region" { type = string }
variable "alarm_email" { type = string }
variable "kms_key_arn" { type = string }
variable "ecs_cluster_name" { type = string }
variable "service_names" { type = list(string) }
variable "log_group_names" { type = map(string) }
variable "alb_arn_suffix" { type = string }
variable "target_group_arn_suffixes" { type = map(string) }
variable "rds_instance_id" { type = string }
variable "redis_replication_group" { type = string }
variable "docdb_cluster_id" { type = string }
variable "opensearch_domain_name" { type = string }
variable "alarm_5xx_threshold" { type = number }
variable "alarm_latency_threshold_seconds" { type = number }
variable "alarm_cpu_threshold" { type = number }
variable "alarm_db_connection_threshold" { type = number }
variable "tags" {
  type    = map(string)
  default = {}
}
