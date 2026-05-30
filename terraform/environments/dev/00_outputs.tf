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

output "postgres_endpoint" {
  description = "PostgreSQL RDS endpoint."
  value       = aws_db_instance.postgres.endpoint
}

output "postgres_address" {
  description = "PostgreSQL RDS hostname."
  value       = aws_db_instance.postgres.address
}

output "postgres_port" {
  description = "PostgreSQL RDS port."
  value       = aws_db_instance.postgres.port
}

output "postgres_master_user_secret_arn" {
  description = "Secrets Manager secret ARN for the RDS-managed PostgreSQL master password."
  value       = try(aws_db_instance.postgres.master_user_secret[0].secret_arn, null)
  sensitive   = true
}

output "grafana_workspace_endpoint" {
  description = "Amazon Managed Grafana 워크스페이스 접속 URL"
  value       = "https://${aws_grafana_workspace.main.endpoint}"
}

output "grafana_workspace_id" {
  description = "Amazon Managed Grafana 워크스페이스 ID"
  value       = aws_grafana_workspace.main.id
}
