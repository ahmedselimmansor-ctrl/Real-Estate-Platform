output "connection_secret_arns" {
  value = { for key, secret in aws_secretsmanager_secret.connection : key => secret.arn }
}

output "rds_instance_id" { value = aws_db_instance.this.id }
output "rds_endpoint" { value = aws_db_instance.this.endpoint }
output "docdb_cluster_id" { value = aws_docdb_cluster.this.cluster_identifier }
output "docdb_endpoint" { value = aws_docdb_cluster.this.endpoint }
output "redis_replication_group_id" { value = aws_elasticache_replication_group.this.replication_group_id }
output "redis_primary_endpoint" { value = aws_elasticache_replication_group.this.primary_endpoint_address }
output "opensearch_domain_arn" { value = aws_opensearch_domain.this.arn }
output "opensearch_domain_name" { value = aws_opensearch_domain.this.domain_name }
output "opensearch_endpoint" { value = aws_opensearch_domain.this.endpoint }
