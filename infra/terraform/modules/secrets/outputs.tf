output "secret_arns" {
  description = "Every secret this module owns, keyed by short name."
  value = merge(
    { for key, secret in aws_secretsmanager_secret.generated : key => secret.arn },
    { for key, secret in aws_secretsmanager_secret.operator : key => secret.arn },
  )
}

output "generated_credentials" {
  description = "Plaintext generated values. Consumed only by modules/database."
  sensitive   = true
  value       = { for key, password in random_password.generated : key => password.result }
}
