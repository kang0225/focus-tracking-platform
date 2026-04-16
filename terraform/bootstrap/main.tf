data "aws_caller_identity" "current" {}

# tfstate 파일 저장을 위한 S3 bucket 구성
resource "aws_s3_bucket" "state_bucket" {
  bucket = var.terraform_state_bucket_name
}

# 상태 파일 덮어쓰기 방지
resource "aws_s3_bucket_versioning" "state_versioning" {
  bucket = aws_s3_bucket.state_bucket.id

  versioning_configuration {
    status = "Enabled"
  }
} 

# 상태 파일 암호화
resource "aws_s3_bucket_server_side_encryption_configuration" "state_encryption" {
  bucket = aws_s3_bucket.state_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 버킷 접근 차단
resource "aws_s3_bucket_public_access_block" "state_access_block" {
  bucket = aws_s3_bucket.state_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 락을 위한 DynamoDB 테이블 생성
resource "aws_dynamodb_table" "terraform_lock_table" {
  name         = var.terraform_lock_table_name
  billing_mode = "PAY_PER_REQUEST" # On-Demand 청구
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# GitHub Actions를 위한 OIDC 인증 (변경금지)
data "aws_iam_openid_connect_provider" "github_oidc_provider" {
  url = "https://token.actions.githubusercontent.com"
}

# GitHub Actions의 OIDC토큰의 IAM 역할 정의
data "aws_iam_policy_document" "github_actions_assume_role_policy" {
  statement {
    effect = "Allow"

    actions = [
      "sts:AssumeRoleWithWebIdentity" # OI
    ]

    principals {
      type        = "Federated" # 외부 인증 (OIDC)
      identifiers = [data.aws_iam_openid_connect_provider.github_oidc_provider.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    } # 조건 1 : AWS STS 용으로만 발급된 토큰만 허용

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/${var.github_branch}"
      ]
    } # 조건 2 : 특정 레포지토리, 경로, 브랜치에서 온 토큰만 허용
  }
}

# IAM 정책을 연결할
resource "aws_iam_role" "github_actions_iam_role" {
  name               = var.github_actions_role_name
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role_policy.json
}

# Github Actions을 Terraform에서 사용하기 위한 IAM 정책
data "aws_iam_policy_document" "github_actions_permissions_policy_document" {
  statement {
    sid    = "AllowStateBucketAccess" # 임의의 상태 ID
    effect = "Allow"

    actions = [
      "s3:ListBucket", # 버킷 안 조회
      "s3:GetBucketVersioning" # 버저닝 활성화 여부 조회
    ]

    resources = [
      aws_s3_bucket.state_bucket.arn
    ] # 상태 파일 리소스 주소를 대상으로 지정
  }

  statement {
    sid    = "AllowStateObjectAccess"
    effect = "Allow"

    actions = [
      "s3:GetObject", # 상태 파일 읽기
      "s3:PutObject", # 상태 파일 생성
      "s3:DeleteObject" # 상태 파일 제거
    ]

    resources = [
      "${aws_s3_bucket.state_bucket.arn}/*" # 버킷 안의 모든 파일을 의미
    ]
  }

  statement {
    sid    = "AllowLockTableAccess"
    effect = "Allow"

    actions = [
      "dynamodb:DescribeTable", # 테이블을 조회
      "dynamodb:GetItem", # 락 상태 조회
      "dynamodb:PutItem", # 락을 생성하여 하나의 트랜잭션만 허용
      "dynamodb:DeleteItem" # 락을 제거하여 트랜잭션 완료 처리
    ]

    resources = [
      aws_dynamodb_table.terraform_lock_table.arn
    ]
  }

  statement {
    sid    = "AllowTerraformInfraManagement"
    effect = "Allow"

    actions = [
      "ec2:*",
      "elasticloadbalancing:*",
      "autoscaling:*",
      "ecr:*",
      "ecs:*",
      "logs:*",
      "cloudwatch:*",
      "route53:*",
      "acm:*",
      "s3:*",
      "iam:*",
      "rds:*",
      "secretsmanager:*",
      "kms:*",
      "ssm:*",
      "codedeploy:*"
    ]

    resources = ["*"]
  }
}

# aws에 github actions을 위한 실제 IAM 정책을 생성
resource "aws_iam_policy" "github_actions_permissions_policy" {
  name   = "${var.project_name}-${var.environment}-github-actions-terraform-policy"
  policy = data.aws_iam_policy_document.github_actions_permissions_policy_document.json # 위에서 만든 IAM 정책을 json 형태로 변환
}

# 만든 IAM 정책들을 ROLE에 연결
resource "aws_iam_role_policy_attachment" "github_actions_permissions_attachment" {
  role       = aws_iam_role.github_actions_iam_role.name
  policy_arn = aws_iam_policy.github_actions_permissions_policy.arn # 방금 생성한 IAM 정책의 주소
}