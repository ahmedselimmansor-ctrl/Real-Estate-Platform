output "kms_key_arn" { value = aws_kms_key.this.arn }
output "kms_key_id" { value = aws_kms_key.this.key_id }
output "alb_security_group_id" { value = aws_security_group.alb.id }
output "ecs_service_security_group_id" { value = aws_security_group.ecs.id }
output "rds_security_group_id" { value = aws_security_group.data["rds"].id }
output "docdb_security_group_id" { value = aws_security_group.data["docdb"].id }
output "redis_security_group_id" { value = aws_security_group.data["redis"].id }
output "opensearch_security_group_id" { value = aws_security_group.data["opensearch"].id }
