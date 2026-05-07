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