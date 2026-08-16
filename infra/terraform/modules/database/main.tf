# =============================================================================
# The four managed data stores, and the connection-string secrets that name
# them.
#
# This module builds the connection strings rather than the application,
# because only here are both halves known: the credential (from
# modules/secrets) and the endpoint (created below). The strings are written to
# Secrets Manager so a task reads one value and gets a working DSN, exactly the
# CONTRACT §7 names.
# =============================================================================

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

locals {
  db_name         = "nawy"
  rag_db_name     = "nawy_rag"
  master_username = "nawy"
}

# ------------------------------------------------------------------- rds ----

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-rds"
  subnet_ids = var.subnet_ids
  tags       = merge(var.tags, { Name = "${var.name_prefix}-rds" })
}

# pgvector lives in `shared_preload_libraries`-free territory (it is a plain
# extension), but rag-svc issues `CREATE EXTENSION vector`, which needs
# rds_superuser — the master user has it.
resource "aws_db_parameter_group" "this" {
  name        = "${var.name_prefix}-pg"
  family      = "postgres${split(".", var.postgres_engine_version)[0]}"
  description = "${var.name_prefix} PostgreSQL parameters"

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

data "aws_iam_policy_document" "rds_monitoring_assume" {
  count = var.rds_monitoring_interval > 0 ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["monitoring.rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_monitoring" {
  count              = var.rds_monitoring_interval > 0 ? 1 : 0
  name               = "${var.name_prefix}-rds-monitoring"
  assume_role_policy = data.aws_iam_policy_document.rds_monitoring_assume[0].json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  count      = var.rds_monitoring_interval > 0 ? 1 : 0
  role       = aws_iam_role.rds_monitoring[0].name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name_prefix}-postgres"
  engine         = "postgres"
  engine_version = var.postgres_engine_version
  instance_class = var.rds_instance_class

  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_name  = local.db_name
  username = local.master_username
  password = var.credentials["rds-password"]
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.rds_security_group_id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.rds_multi_az

  backup_retention_period = var.rds_backup_retention_days
  backup_window           = "02:00-03:00"
  maintenance_window      = "sun:03:30-sun:04:30"
  copy_tags_to_snapshot   = true

  performance_insights_enabled          = var.rds_performance_insights_retention_days > 0
  performance_insights_retention_period = var.rds_performance_insights_retention_days > 0 ? var.rds_performance_insights_retention_days : null
  performance_insights_kms_key_id       = var.rds_performance_insights_retention_days > 0 ? var.kms_key_arn : null

  monitoring_interval = var.rds_monitoring_interval
  monitoring_role_arn = var.rds_monitoring_interval > 0 ? aws_iam_role.rds_monitoring[0].arn : null

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  auto_minor_version_upgrade      = true
  deletion_protection             = var.deletion_protection
  skip_final_snapshot             = !var.deletion_protection
  final_snapshot_identifier       = var.deletion_protection ? "${var.name_prefix}-postgres-final" : null
  apply_immediately               = var.environment != "prod"

  tags = merge(var.tags, { Name = "${var.name_prefix}-postgres" })
}

# ----------------------------------------------------------------- docdb ----

resource "aws_docdb_subnet_group" "this" {
  name       = "${var.name_prefix}-docdb"
  subnet_ids = var.subnet_ids
  tags       = merge(var.tags, { Name = "${var.name_prefix}-docdb" })
}

# TLS on, and the Mongo driver in api-core is configured for it. Turning this
# off would silently downgrade every connection.
resource "aws_docdb_cluster_parameter_group" "this" {
  name        = "${var.name_prefix}-docdb"
  family      = "docdb5.0"
  description = "${var.name_prefix} DocumentDB parameters"

  parameter {
    name  = "tls"
    value = "enabled"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_docdb_cluster" "this" {
  cluster_identifier = "${var.name_prefix}-docdb"
  engine             = "docdb"
  engine_version     = "5.0.0"

  master_username = local.master_username
  master_password = var.credentials["docdb-password"]
  port            = 27017

  db_subnet_group_name            = aws_docdb_subnet_group.this.name
  vpc_security_group_ids          = [var.docdb_security_group_id]
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.this.name

  storage_encrypted = true
  kms_key_id        = var.kms_key_arn

  backup_retention_period      = var.docdb_backup_retention_days
  preferred_backup_window      = "02:00-03:00"
  preferred_maintenance_window = "sun:04:30-sun:05:30"

  enabled_cloudwatch_logs_exports = ["audit", "profiler"]
  deletion_protection             = var.deletion_protection
  skip_final_snapshot             = !var.deletion_protection
  final_snapshot_identifier       = var.deletion_protection ? "${var.name_prefix}-docdb-final" : null
  apply_immediately               = var.environment != "prod"

  tags = merge(var.tags, { Name = "${var.name_prefix}-docdb" })
}

resource "aws_docdb_cluster_instance" "this" {
  count = var.docdb_instance_count

  identifier         = "${var.name_prefix}-docdb-${count.index}"
  cluster_identifier = aws_docdb_cluster.this.id
  instance_class     = var.docdb_instance_class

  auto_minor_version_upgrade = true
  apply_immediately          = var.environment != "prod"

  tags = merge(var.tags, { Name = "${var.name_prefix}-docdb-${count.index}" })
}

# ----------------------------------------------------------------- redis ----

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name_prefix}-redis"
  subnet_ids = var.subnet_ids
  tags       = merge(var.tags, { Name = "${var.name_prefix}-redis" })
}

resource "aws_elasticache_parameter_group" "this" {
  name        = "${var.name_prefix}-redis"
  family      = "redis7"
  description = "${var.name_prefix} Redis parameters"

  # The cache is allowed to evict; the token denylist and rate limiters all
  # carry a TTL, so LRU on volatile keys is the correct policy.
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/elasticache/${var.name_prefix}/slow-log"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = "${var.name_prefix}-redis"
  description          = "${var.name_prefix} cache, sessions and rate limits"

  engine         = "redis"
  engine_version = var.redis_engine_version
  node_type      = var.redis_node_type
  port           = 6379

  num_cache_clusters         = var.redis_num_cache_clusters
  automatic_failover_enabled = var.redis_num_cache_clusters > 1
  multi_az_enabled           = var.redis_num_cache_clusters > 1

  subnet_group_name    = aws_elasticache_subnet_group.this.name
  security_group_ids   = [var.redis_security_group_id]
  parameter_group_name = aws_elasticache_parameter_group.this.name

  at_rest_encryption_enabled = true
  kms_key_id                 = var.kms_key_arn
  transit_encryption_enabled = true
  auth_token                 = var.credentials["redis-auth-token"]

  snapshot_retention_limit = var.redis_snapshot_retention_days
  snapshot_window          = "01:00-02:00"
  maintenance_window       = "sun:05:30-sun:06:30"
  apply_immediately        = var.environment != "prod"

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-redis" })
}

# ------------------------------------------------------------ opensearch ----

resource "aws_cloudwatch_log_group" "opensearch" {
  name              = "/opensearch/${var.name_prefix}/application"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

data "aws_iam_policy_document" "opensearch_logs" {
  statement {
    actions   = ["logs:PutLogEvents", "logs:CreateLogStream", "logs:PutLogEventsBatch"]
    resources = ["${aws_cloudwatch_log_group.opensearch.arn}:*"]
    principals {
      type        = "Service"
      identifiers = ["es.amazonaws.com"]
    }
  }
}

resource "aws_cloudwatch_log_resource_policy" "opensearch" {
  policy_name     = "${var.name_prefix}-opensearch-logs"
  policy_document = data.aws_iam_policy_document.opensearch_logs.json
}

resource "aws_opensearch_domain" "this" {
  domain_name    = "${var.name_prefix}-search"
  engine_version = var.opensearch_engine_version

  cluster_config {
    instance_type            = var.opensearch_instance_type
    instance_count           = var.opensearch_instance_count
    zone_awareness_enabled   = var.opensearch_instance_count > 1
    dedicated_master_enabled = var.opensearch_dedicated_master_enabled
    dedicated_master_type    = var.opensearch_dedicated_master_enabled ? var.opensearch_master_instance_type : null
    dedicated_master_count   = var.opensearch_dedicated_master_enabled ? 3 : null

    dynamic "zone_awareness_config" {
      for_each = var.opensearch_instance_count > 1 ? [1] : []
      content {
        availability_zone_count = min(var.opensearch_instance_count, length(var.subnet_ids))
      }
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = var.opensearch_ebs_volume_size
  }

  vpc_options {
    subnet_ids         = slice(var.subnet_ids, 0, var.opensearch_instance_count > 1 ? min(var.opensearch_instance_count, length(var.subnet_ids)) : 1)
    security_group_ids = [var.opensearch_security_group_id]
  }

  encrypt_at_rest {
    enabled    = true
    kms_key_id = var.kms_key_arn
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true

    master_user_options {
      master_user_name     = local.master_username
      master_user_password = var.credentials["opensearch-master-password"]
    }
  }

  log_publishing_options {
    log_type                 = "ES_APPLICATION_LOGS"
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch.arn
  }

  # The domain is VPC-only and fine-grained access control is on, so the
  # resource policy can be open: the security group and the master user are
  # what actually gate access.
  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "*" }
      Action    = "es:*"
      Resource  = "arn:${data.aws_partition.current.partition}:es:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:domain/${var.name_prefix}-search/*"
    }]
  })

  tags = merge(var.tags, { Name = "${var.name_prefix}-search" })

  depends_on = [aws_cloudwatch_log_resource_policy.opensearch]
}

# ------------------------------------------------- connection-string secrets -

locals {
  pg_credentials    = "${local.master_username}:${urlencode(var.credentials["rds-password"])}"
  docdb_credentials = "${local.master_username}:${urlencode(var.credentials["docdb-password"])}"

  connection_strings = {
    # api-core (Prisma) and reports-svc.
    "database-url" = "postgresql://${local.pg_credentials}@${aws_db_instance.this.endpoint}/${local.db_name}?schema=public&sslmode=require"

    # rag-svc keeps an async and a sync DSN against its own database: SQLAlchemy
    # uses asyncpg at runtime, Alembic uses psycopg2 for migrations.
    "rag-database-url"      = "postgresql+asyncpg://${local.pg_credentials}@${aws_db_instance.this.endpoint}/${local.rag_db_name}"
    "rag-database-url-sync" = "postgresql+psycopg2://${local.pg_credentials}@${aws_db_instance.this.endpoint}/${local.rag_db_name}?sslmode=require"

    # DocumentDB requires the RDS CA bundle, which the images already ship.
    "mongo-uri" = "mongodb://${local.docdb_credentials}@${aws_docdb_cluster.this.endpoint}:${aws_docdb_cluster.this.port}/${local.db_name}?tls=true&tlsCAFile=/etc/ssl/certs/global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false"

    "redis-url" = "rediss://:${urlencode(var.credentials["redis-auth-token"])}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"

    "elasticsearch-url" = "https://${local.master_username}:${urlencode(var.credentials["opensearch-master-password"])}@${aws_opensearch_domain.this.endpoint}:443"
  }
}

resource "aws_secretsmanager_secret" "connection" {
  for_each = local.connection_strings

  name                    = "${var.secret_prefix}/${each.key}"
  description             = "${var.name_prefix} ${each.key} (composed by Terraform from the endpoint + credential)"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_days

  tags = merge(var.tags, { Name = "${var.secret_prefix}/${each.key}", Managed = "terraform" })
}

resource "aws_secretsmanager_secret_version" "connection" {
  for_each = local.connection_strings

  secret_id     = aws_secretsmanager_secret.connection[each.key].id
  secret_string = each.value
}
