# terraform init -reconfigure -backend-config=environments/staging.backend.hcl
bucket         = "topchoice-tfstate-REPLACE_WITH_ACCOUNT_ID"
key            = "topchoice/staging/terraform.tfstate"
region         = "eu-central-1"
dynamodb_table = "topchoice-tfstate-lock"
encrypt        = true
