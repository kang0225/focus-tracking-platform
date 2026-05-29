##############################################
#### 1. 로그 저장용 S3 버킷                ####
##############################################
resource "aws_s3_bucket" "logs" {
  bucket        = "${var.project_name}-${var.environment}-logs"
  force_destroy = true # destroy 시 안에 파일 있어도 삭제 가능 (졸작 편의)

  tags = {
    Name = "${var.project_name}-${var.environment}-logs"
  }
}

# AES256 암호화
resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 외부 접근 차단
resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 생명 주기 — 30일 후 Glacier IR로, 90일 후 삭제 (비용 관리)
resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  # 오래된 로그 자동 정리 (기존 rule)
  rule {
    id     = "manage-old-logs"
    status = "Enabled"

    filter {}

    transition {
      days          = 30
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = 90
    }
  }

  # ★ 추가: 실패한 멀티파트 업로드 자동 정리 (CKV_AWS_300)
  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
##############################################
#### 2. ALB Access Logs 권한               ####
##############################################
resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ALB 로그 전달 서비스가 access log 객체를 지정된 S3 prefix에 업로드할 수 있게 허용
      {
        Sid       = "AllowALBLogDeliveryWrite"
        Effect    = "Allow"
        Principal = { Service = "logdelivery.elasticloadbalancing.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.logs.arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        # 현재 AWS 계정/리전의 Load Balancer에서 온 로그 전달 요청만 허용
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:elasticloadbalancing:${var.aws_region}:${data.aws_caller_identity.current.account_id}:loadbalancer/*"
          }
        }
      },
      # ALB 로그 전달 서비스가 로그 업로드 전에 버킷 ACL/소유권을 확인할 수 있게 허용
      {
        Sid       = "AllowALBLogDeliveryAclCheck"
        Effect    = "Allow"
        Principal = { Service = "logdelivery.elasticloadbalancing.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.logs.arn
      }
    ]
  })
}

data "aws_caller_identity" "current" {}

##############################################
#### 3. VPC Flow Logs (CloudWatch로)       ####
##############################################
# 거부된 트래픽(REJECT)만 기록 → 비용 절감 + 침해 탐지 핵심만
resource "aws_cloudwatch_log_group" "vpc_flow" {
  name              = "/aws/vpc/${var.project_name}-${var.environment}-flowlogs"
  retention_in_days = 30

  tags = {
    Name = "${var.project_name}-${var.environment}-vpc-flow-logs"
  }
}

data "aws_iam_policy_document" "flow_log_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "flow_log" {
  name               = "${var.project_name}-${var.environment}-flowlog-role"
  assume_role_policy = data.aws_iam_policy_document.flow_log_assume.json
}

resource "aws_iam_role_policy" "flow_log" {
  name = "${var.project_name}-${var.environment}-flowlog-policy"
  role = aws_iam_role.flow_log.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ]
      Resource = "${aws_cloudwatch_log_group.vpc_flow.arn}:*"
    }]
  })
}

resource "aws_flow_log" "main" {
  iam_role_arn    = aws_iam_role.flow_log.arn
  log_destination = aws_cloudwatch_log_group.vpc_flow.arn
  traffic_type    = "REJECT" # ACCEPT는 너무 많음. REJECT만 기록.
  vpc_id          = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-vpc-flow-log"
  }
}

# ★ 추가: S3 logs 버킷 versioning 활성화 (CKV_AWS_21)
resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id

  versioning_configuration {
    status = "Enabled"
  }
}
