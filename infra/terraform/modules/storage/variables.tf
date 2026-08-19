variable "name_prefix" { type = string }
variable "media_bucket_name" { type = string }
variable "logs_bucket_name" { type = string }
variable "cors_allowed_origins" { type = list(string) }
variable "media_transition_ia_days" { type = number }
variable "media_transition_glacier_days" { type = number }
variable "logs_retention_days" { type = number }
variable "cloudfront_price_class" { type = string }
variable "cdn_domain_name" { type = string }
variable "route53_zone_id" { type = string }
variable "force_destroy" { type = bool }
variable "kms_deletion_window_days" { type = number }

variable "web_acl_arn" {
  description = "Optional AWS WAFv2 web ACL ARN (us-east-1) to attach to the media distribution. Empty means none."
  type        = string
  default     = ""
}
variable "tags" {
  type    = map(string)
  default = {}
}
