# 실제 ECR 레포지토리 생성
resource "aws_ecr_repository" "app" {

  # 레포지토리 이름
  name = "${var.project_name}-repo" 
  
  # MUTABLE은 같은 태그로 이미지를 여러 번 덮어씌울 수 있게 해줌
  # 개발 단계에서는 편의를 위해 보통 MUTABLE을 사용해.
  image_tag_mutability = "MUTABLE"

  # 이미지를 푸시할 때마다 AWS가 보안 취약점을 자동으로 스캔함
  # 위험한 라이브러리가 포함되어 있는지 알려줌
  image_scanning_configuration {
    scan_on_push = true
  }

  # 저장된 데이터를 AWS 기본 암호화 방식으로 보호함
  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name        = "${var.project_name}-ecr"
    Environment = var.environment
  }
}

# ECR 수명 주기 정책
# 이미지가 무한정 쌓이면 S3 저장 비용이 청구되므로, 지워줘야함
resource "aws_ecr_lifecycle_policy" "app_policy" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "최근 업로드된 5개의 이미지만 남기고 나머지는 자동으로 삭제함"
      selection = {
        tagStatus     = "any"                # 태그가 있든 없든 모든 이미지 대상
        countType     = "imageCountMoreThan" # 개수가 넘어가면 작동
        countNumber   = 5                    # 기준값은 5개
      }
      action = {
        type = "expire" # 삭제
      }
    }]
  })
}