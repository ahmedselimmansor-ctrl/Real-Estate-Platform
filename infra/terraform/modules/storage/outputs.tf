output "media_bucket_id" { value = aws_s3_bucket.media.id }
output "media_bucket_arn" { value = aws_s3_bucket.media.arn }
output "logs_bucket_id" { value = aws_s3_bucket.logs.id }
output "logs_bucket_arn" { value = aws_s3_bucket.logs.arn }
output "cdn_distribution_arn" { value = aws_cloudfront_distribution.media.arn }
output "cdn_distribution_id" { value = aws_cloudfront_distribution.media.id }

output "cdn_domain_name" {
  description = "Custom domain when one is configured, else the CloudFront hostname."
  value       = var.cdn_domain_name != "" ? var.cdn_domain_name : aws_cloudfront_distribution.media.domain_name
}
