variable "name_prefix" { type = string }
variable "repositories" { type = list(string) }
variable "image_tag_mutability" { type = string }
variable "keep_last_images" { type = number }
variable "kms_key_arn" { type = string }
variable "force_delete" { type = bool }
variable "tags" {
  type    = map(string)
  default = {}
}
