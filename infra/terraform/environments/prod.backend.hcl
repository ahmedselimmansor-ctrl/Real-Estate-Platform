# terraform init -reconfigure -backend-config=environments/prod.backend.hcl
bucket         = "topchoice-tfstate-REPLACE_WITH_ACCOUNT_ID"
key            = "topchoice/prod/terraform.tfstate"
region         = "eu-central-1"
dynamodb_table = "topchoice-tfstate-lock"
encrypt        = true

# The state bucket uses a customer-managed key (created by ./bootstrap), so the
# backend has to name it — `terraform output backend_config` prints the ARN.
kms_key_id     = "REPLACE_WITH_STATE_KMS_KEY_ARN"
