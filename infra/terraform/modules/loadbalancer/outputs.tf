output "alb_arn" { value = aws_lb.this.arn }
output "alb_arn_suffix" { value = aws_lb.this.arn_suffix }
output "alb_dns_name" { value = aws_lb.this.dns_name }
output "alb_zone_id" { value = aws_lb.this.zone_id }
output "routing_listener_arn" { value = local.routing_listener_arn }

output "target_group_arns" {
  value = { for name, tg in aws_lb_target_group.this : name => tg.arn }
}

output "target_group_arn_suffixes" {
  value = { for name, tg in aws_lb_target_group.this : name => tg.arn_suffix }
}
