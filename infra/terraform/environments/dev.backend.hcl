# terraform init -reconfigure -backend-config=environments/dev.backend.hcl
bucket         = "nawy-tfstate-REPLACE_WITH_ACCOUNT_ID"
key            = "nawy-clone/dev/terraform.tfstate"
region         = "eu-central-1"
dynamodb_table = "nawy-tfstate-lock"
encrypt        = true
