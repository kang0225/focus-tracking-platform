# 깃허브 액션에서 이미지를 푸시할 때 사용할 주소
output "ecr_repository_url" {
  value       = aws_ecr_repository.app.repository_url
  description = "도커 이미지를 업로드할 ECR 저장소의 전체 URL 주소"
}

# ARN
output "ecr_repository_arn" {
  value       = aws_ecr_repository.app.arn
  description = "이 ECR 레포지토리의 ARN"
}

output "site_url" {
  description = "사이트 접속 URL"
  value       = "https://${var.domain_name}"
}

output "alb_dns_name" {
  description = "ALB DNS (디버깅용)"
  value       = aws_lb.app.dns_name
}

output "route53_zone_id" {
  description = "Hosted Zone ID"
  value       = data.aws_route53_zone.main.zone_id
}

output "acm_certificate_arn" {
  description = "발급된 ACM 인증서 ARN"
  value       = aws_acm_certificate_validation.main.certificate_arn
}

output "s3_endpoint_id" {
  value = aws_vpc_endpoint.s3.id
}

output "dynamodb_endpoint_id" {
  value = aws_vpc_endpoint.dynamodb.id
}

/*
output "cloudfront_distribution_id" {
  description = "CloudFront Distribution ID"
  value       = aws_cloudfront_distribution.this.id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront Distribution ARN"
  value       = aws_cloudfront_distribution.this.arn
}

output "cloudfront_domain_name" {
  description = "CloudFront Distribution Domain Name"
  value       = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_hosted_zone_id" {
  description = "CloudFront Distribution Hosted Zone ID (Route53 Alias용)"
  value       = aws_cloudfront_distribution.this.hosted_zone_id
}
이건 나중에 다시*/ 