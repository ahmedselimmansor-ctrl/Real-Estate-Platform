variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "vpc_cidr" { type = string }
variable "alb_ingress_cidrs" { type = list(string) }
variable "kms_deletion_window_days" { type = number }
variable "service_ports" { type = list(number) }
variable "tags" {
  type    = map(string)
  default = {}
}
