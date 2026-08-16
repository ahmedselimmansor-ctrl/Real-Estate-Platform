variable "name_prefix" { type = string }
variable "secret_prefix" { type = string }
variable "kms_key_arn" { type = string }
variable "recovery_window_days" { type = number }
variable "operator_managed_notes" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}
