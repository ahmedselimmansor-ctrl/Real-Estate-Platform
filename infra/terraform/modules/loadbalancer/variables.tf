variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }

variable "service_routing" {
  type = map(object({
    port          = number
    health_path   = string
    path_patterns = list(string)
    priority      = number
    sticky        = bool
    protocol      = string
  }))
}

variable "default_service" { type = string }

variable "docs_redirects" {
  type = map(object({
    priority      = number
    path_patterns = list(string)
  }))
}

variable "swagger_path" { type = string }
variable "domain_name" { type = string }
variable "route53_zone_id" { type = string }
variable "acm_certificate_arn" { type = string }
variable "idle_timeout" { type = number }
variable "deletion_protection" { type = bool }
variable "enable_access_logs" { type = bool }
variable "access_logs_bucket" { type = string }
variable "enable_waf" { type = bool }
variable "waf_rate_limit" { type = number }
variable "tags" {
  type    = map(string)
  default = {}
}
