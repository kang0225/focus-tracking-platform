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