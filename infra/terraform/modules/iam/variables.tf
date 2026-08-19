variable "name_prefix" { type = string }
variable "services" { type = list(string) }
variable "account_id" { type = string }
variable "partition" { type = string }
variable "region" { type = string }
variable "log_group_arn_pattern" { type = string }
variable "ecr_repository_arns" { type = list(string) }
variable "service_secret_arn_patterns" { type = map(list(string)) }
variable "kms_key_arn" { type = string }
variable "media_bucket_arn" { type = string }
variable "media_kms_key_arn" { type = string }
variable "media_bucket_prefixes" { type = list(string) }
variable "opensearch_domain_arn" { type = string }
variable "cdn_distribution_arn" { type = string }
variable "enable_execute_command" { type = bool }
variable "tags" {
  type    = map(string)
  default = {}
}
