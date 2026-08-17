# =============================================================================
# Locals — the contract-fixed facts.
#
# Ports, health paths, ALB route prefixes, env var names and secret names come
# straight out of docs/CONTRACT.md and infra/nginx/conf.d/topchoice.conf. They are
# deliberately NOT variables: if they were, an operator could silently break
# the routing contract from a tfvars file.
# =============================================================================

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_region" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  account_id  = data.aws_caller_identity.current.account_id
  partition   = data.aws_partition.current.partition
  region      = data.aws_region.current.name

  is_prod = var.environment == "prod"

  common_tags = merge(
    {
      Project     = "topchoice"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = var.owner
      Repository  = "Real-Estate-Platform"
    },
    var.extra_tags,
  )

  # ---------------------------------------------------------------- routing --
  # Mirrors CONTRACT §1 and the nginx edge exactly. Lower ALB rule priority
  # numbers are evaluated first, so the /docs redirects sit in front of the
  # service rules and the catch-all for `web` is the listener default action.
  service_routing = {
    api-core = {
      port          = 4000
      health_path   = "/health"
      path_patterns = ["/api/v1", "/api/v1/*"]
      priority      = 100
      sticky        = false
      protocol      = "HTTP"
    }
    search-svc = {
      port          = 8000
      health_path   = "/health"
      path_patterns = ["/api/search", "/api/search/*"]
      priority      = 200
      sticky        = false
      protocol      = "HTTP"
    }
    rag-svc = {
      port          = 8001
      health_path   = "/health"
      path_patterns = ["/api/chat", "/api/chat/*"]
      priority      = 300
      sticky        = true # SSE: pin a stream to the task that opened it
      protocol      = "HTTP"
    }
    reports-svc = {
      port          = 4567
      health_path   = "/health"
      path_patterns = ["/api/reports", "/api/reports/*"]
      priority      = 400
      sticky        = false
      protocol      = "HTTP"
    }
    web = {
      port        = 3000
      health_path = "/" # Next.js has no /health route; the nginx edge probes `/`
      # `web` is the listener default action, so it needs no path rule.
      path_patterns = []
      priority      = 500
      sticky        = false
      protocol      = "HTTP"
    }
  }

  # /docs and /api-docs are edge-only paths that 301 to the Swagger UI served
  # by api-core at SWAGGER_PATH (/api/v1/docs). Same behaviour as nginx.
  swagger_path = "/api/v1/docs"

  docs_redirects = {
    docs = {
      priority      = 50
      path_patterns = ["/docs"]
    }
    api-docs = {
      priority      = 51
      path_patterns = ["/api-docs"]
    }
  }

  # ----------------------------------------------------------------- naming --
  service_names = keys(local.service_routing)

  # Public origin. When no custom domain is supplied we fall back to the ALB
  # DNS name; note that CORS on the media bucket cannot use that value (it
  # would create a storage <-> loadbalancer dependency cycle), so it falls
  # back to "*" instead — see modules/storage/README.md.
  public_base_url = var.domain_name != "" ? "https://${var.domain_name}" : "https://${module.loadbalancer.alb_dns_name}"
  web_cors_origin = var.domain_name != "" ? "https://${var.domain_name}" : "*"

  # Cloud Map namespace keeps CONTRACT §7's internal URL shape
  # (http://api-core:4000) valid in AWS: http://api-core.<namespace>:4000
  service_discovery_namespace = "${local.name_prefix}.internal"

  internal_urls = {
    API_CORE_URL    = "http://api-core.${local.service_discovery_namespace}:4000"
    SEARCH_SVC_URL  = "http://search-svc.${local.service_discovery_namespace}:8000"
    RAG_SVC_URL     = "http://rag-svc.${local.service_discovery_namespace}:8001"
    REPORTS_SVC_URL = "http://reports-svc.${local.service_discovery_namespace}:4567"
  }

  # ---------------------------------------------------------------- secrets --
  # Secrets Manager path prefix. IAM policies are scoped with
  # "<prefix>/<key>-*" (Secrets Manager appends a 6-char random suffix), which
  # keeps the grants tight without creating an iam <-> secrets cycle.
  secret_prefix = "${var.project_name}/${var.environment}"

  # Secrets created by modules/secrets (generated or operator-managed).
  static_secret_keys = [
    "jwt-access-secret",
    "jwt-refresh-secret",
    "internal-service-token",
    "rds-password",
    "docdb-password",
    "redis-auth-token",
    "opensearch-master-password",
    "google-client-id",
    "google-client-secret",
    "dashscope-api-key",
    "openai-api-key",
  ]

  # Secrets created by modules/database (they need endpoints + credentials).
  connection_secret_keys = [
    "database-url",
    "rag-database-url",
    "rag-database-url-sync",
    "mongo-uri",
    "redis-url",
    "elasticsearch-url",
  ]

  all_secret_arns = merge(module.secrets.secret_arns, module.database.connection_secret_arns)

  # Which secret keys each task may read — least privilege, by service.
  service_secret_keys = {
    web = []
    api-core = [
      "database-url", "mongo-uri", "redis-url",
      "jwt-access-secret", "jwt-refresh-secret", "internal-service-token",
      "google-client-id", "google-client-secret",
    ]
    search-svc = [
      "elasticsearch-url", "mongo-uri", "redis-url",
      "jwt-access-secret", "internal-service-token",
    ]
    rag-svc = [
      "rag-database-url", "rag-database-url-sync", "mongo-uri", "redis-url",
      "jwt-access-secret", "internal-service-token",
      "dashscope-api-key", "openai-api-key",
    ]
    reports-svc = [
      "database-url", "mongo-uri", "redis-url",
      "jwt-access-secret", "internal-service-token",
    ]
  }

  # Env var name -> secret key. The container sees the CONTRACT §7 name.
  secret_env_mapping = {
    "database-url"           = "DATABASE_URL"
    "rag-database-url"       = "RAG_DATABASE_URL"
    "rag-database-url-sync"  = "RAG_DATABASE_URL_SYNC"
    "mongo-uri"              = "MONGO_URI"
    "redis-url"              = "REDIS_URL"
    "elasticsearch-url"      = "ELASTICSEARCH_URL"
    "jwt-access-secret"      = "JWT_ACCESS_SECRET"
    "jwt-refresh-secret"     = "JWT_REFRESH_SECRET"
    "internal-service-token" = "INTERNAL_SERVICE_TOKEN"
    "google-client-id"       = "GOOGLE_CLIENT_ID"
    "google-client-secret"   = "GOOGLE_CLIENT_SECRET"
    "dashscope-api-key"      = "DASHSCOPE_API_KEY"
    "openai-api-key"         = "OPENAI_API_KEY"
  }

  # ARN patterns (string-built, so no module cycles) used by modules/iam.
  service_secret_arn_patterns = {
    for svc, keys in local.service_secret_keys :
    svc => [
      for key in keys :
      "arn:${local.partition}:secretsmanager:${local.region}:${local.account_id}:secret:${local.secret_prefix}/${key}-*"
    ]
  }

  ecs_log_group_prefix = "/ecs/${local.name_prefix}"

  # ------------------------------------------------------------------- env --
  # Values common to every container. Names are verbatim CONTRACT §7.
  common_env = merge(
    {
      NODE_ENV        = "production"
      APP_ENV         = var.environment
      AWS_REGION      = var.aws_region
      FRONTEND_URL    = local.public_base_url
      PUBLIC_API_URL  = "${local.public_base_url}/api/v1"
      JWT_ACCESS_TTL  = "15m"
      JWT_REFRESH_TTL = "30d"
      JWT_ISSUER      = "topchoice-api"
      JWT_AUDIENCE    = "topchoice-clients"
    },
    local.internal_urls,
  )

  service_env = {
    web = merge(local.common_env, {
      PORT                    = "3000"
      NEXT_PUBLIC_API_URL     = "/api/v1"
      NEXT_PUBLIC_SEARCH_URL  = "/api/search"
      NEXT_PUBLIC_CHAT_URL    = "/api/chat"
      NEXT_PUBLIC_REPORTS_URL = "/api/reports"
      NEXT_PUBLIC_SITE_URL    = local.public_base_url
      NEXT_TELEMETRY_DISABLED = "1"
    })

    api-core = merge(local.common_env, {
      PORT                = "4000"
      REDIS_TTL_DEFAULT   = "300"
      GOOGLE_CALLBACK_URL = "${local.public_base_url}/api/v1/auth/google/callback"
      S3_BUCKET           = module.storage.media_bucket_id
      S3_PUBLIC_BASE_URL  = "https://${module.storage.cdn_domain_name}"
      CLOUDFRONT_DOMAIN   = module.storage.cdn_domain_name
    })

    search-svc = merge(local.common_env, {
      PORT              = "8000"
      ES_INDEX          = "properties"
      ES_INDEX_VERSION  = "properties_v1"
      REDIS_TTL_DEFAULT = "300"
    })

    rag-svc = merge(local.common_env, {
      PORT                      = "8001"
      DASHSCOPE_BASE_URL        = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
      DASHSCOPE_NATIVE_BASE_URL = "https://dashscope-intl.aliyuncs.com/api/v1"
      EMBEDDING_MODEL           = "tongyi-embedding-vision-flash"
      EMBEDDING_DIM             = "1024"
      RERANK_MODEL              = "qwen3-rerank"
      OPENAI_BASE_URL           = "https://api.openai.com/v1"
      GENERATION_MODEL          = "gpt-5.6-luna"
      RAG_TOP_K                 = "20"
      RAG_RERANK_TOP_N          = "6"
      RAG_MAX_CONTEXT_TOKENS    = "6000"
      RAG_MEMORY_WINDOW         = "10"
    })

    reports-svc = merge(local.common_env, {
      PORT               = "4567"
      REDIS_TTL_DEFAULT  = "300"
      S3_BUCKET          = module.storage.media_bucket_id
      S3_PUBLIC_BASE_URL = "https://${module.storage.cdn_domain_name}"
    })
  }

  # ------------------------------------------------- container health checks -
  # Same probes as docker-compose.yml, so a container that is healthy locally
  # is healthy on Fargate. `web` has no /health route, so it probes `/`.
  container_healthchecks = {
    web = [
      "CMD-SHELL",
      "node -e \"fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
    ]
    api-core = [
      "CMD-SHELL",
      "node -e \"fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
    ]
    search-svc = [
      "CMD-SHELL",
      "python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)\"",
    ]
    rag-svc = [
      "CMD-SHELL",
      "python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8001/health').status==200 else 1)\"",
    ]
    reports-svc = [
      "CMD-SHELL",
      "ruby -e \"require 'net/http'; exit(Net::HTTP.get_response(URI('http://localhost:4567/health')).code == '200' ? 0 : 1)\"",
    ]
  }

  # ------------------------------------------------------- composed services -
  # One object per service, handed to modules/compute.
  ecs_services = {
    for name, cfg in var.services :
    name => {
      cpu                     = cfg.cpu
      memory                  = cfg.memory
      desired_count           = cfg.desired_count
      min_capacity            = cfg.min_capacity
      max_capacity            = cfg.max_capacity
      image                   = "${module.ecr.repository_urls[name]}:${cfg.image_tag}"
      container_port          = local.service_routing[name].port
      health_check_command    = local.container_healthchecks[name]
      environment             = local.service_env[name]
      secrets                 = { for key in local.service_secret_keys[name] : local.secret_env_mapping[key] => local.all_secret_arns[key] }
      target_group_arn        = module.loadbalancer.target_group_arns[name]
      target_group_arn_suffix = module.loadbalancer.target_group_arn_suffixes[name]
      execution_role_arn      = module.iam.execution_role_arns[name]
      task_role_arn           = module.iam.task_role_arns[name]
    }
  }
}
