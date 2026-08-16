variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }
variable "enable_container_insights" { type = bool }
variable "fargate_spot_weight" { type = number }
variable "fargate_base_count" { type = number }
variable "service_discovery_namespace" { type = string }

variable "services" {
  type = map(object({
    cpu                     = number
    memory                  = number
    desired_count           = number
    min_capacity            = number
    max_capacity            = number
    image                   = string
    container_port          = number
    health_check_command    = list(string)
    environment             = map(string)
    secrets                 = map(string)
    target_group_arn        = string
    target_group_arn_suffix = string
    execution_role_arn      = string
    task_role_arn           = string
  }))
}

variable "log_group_prefix" { type = string }
variable "log_retention_days" { type = number }
variable "kms_key_arn" { type = string }
variable "enable_execute_command" { type = bool }
variable "aws_region" { type = string }
variable "alb_arn_suffix" { type = string }
variable "alb_listener_arn" { type = string }
variable "cpu_target_utilization" { type = number }
variable "requests_per_target" { type = number }
variable "tags" {
  type    = map(string)
  default = {}
}
