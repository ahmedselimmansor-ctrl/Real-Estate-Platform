# terraform init -reconfigure -backend-config=environments/staging.backend.hcl
bucket         = "nawy-tfstate-REPLACE_WITH_ACCOUNT_ID"
key            = "nawy-clone/staging/terraform.tfstate"
region         = "eu-central-1"
dynamodb_table = "nawy-tfstate-lock"
encrypt        = true
