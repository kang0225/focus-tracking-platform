##############################################
#### 1. CW → Firehose → S3 IAM 역할        ####
##############################################
# Firehose가 S3에 쓸 권한
data "aws_iam_policy_document" "firehose_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["firehose.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "firehose" {
  name               = "${var.project_name}-${var.environment}-firehose-role"
  assume_role_policy = data.aws_iam_policy_document.firehose_assume.json
}

resource "aws_iam_role_policy" "firehose_s3" {
  name = "${var.project_name}-${var.environment}-firehose-s3"
  role = aws_iam_role.firehose.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:AbortMultipartUpload",
        "s3:GetBucketLocation",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads",
        "s3:PutObject"
      ]
      Resource = [
        aws_s3_bucket.logs.arn,
        "${aws_s3_bucket.logs.arn}/*"
      ]
    }]
  })
}

##############################################
#### 2. Kinesis Firehose Stream            ####
##############################################
# CloudWatch에서 받은 로그를 S3로 흘려보내는 파이프
resource "aws_kinesis_firehose_delivery_stream" "ecs_logs_to_s3" {
  name        = "${var.project_name}-${var.environment}-ecs-logs"
  destination = "extended_s3"

  extended_s3_configuration {
    role_arn   = aws_iam_role.firehose.arn
    bucket_arn = aws_s3_bucket.logs.arn
    prefix     = "ecs/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/"
    error_output_prefix = "ecs-errors/"

    buffering_size     = 5    # 5MB 모이면 flush
    buffering_interval = 300  # 또는 5분마다
    compression_format = "GZIP"

    cloudwatch_logging_options {
      enabled         = true
      log_group_name  = aws_cloudwatch_log_group.firehose.name
      log_stream_name = "S3Delivery"
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-logs-firehose"
  }
}

# Firehose 자체 로그 (디버깅용)
resource "aws_cloudwatch_log_group" "firehose" {
  name              = "/aws/kinesisfirehose/${var.project_name}-${var.environment}-ecs-logs"
  retention_in_days = 7
}

##############################################
#### 3. CloudWatch → Firehose Subscription ####
##############################################
# CloudWatch가 Firehose로 보낼 권한
data "aws_iam_policy_document" "cw_to_firehose_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["logs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cw_to_firehose" {
  name               = "${var.project_name}-${var.environment}-cw-firehose-role"
  assume_role_policy = data.aws_iam_policy_document.cw_to_firehose_assume.json
}

resource "aws_iam_role_policy" "cw_to_firehose" {
  name = "${var.project_name}-${var.environment}-cw-firehose"
  role = aws_iam_role.cw_to_firehose.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["firehose:PutRecord", "firehose:PutRecordBatch"]
      Resource = aws_kinesis_firehose_delivery_stream.ecs_logs_to_s3.arn
    }]
  })
}

# 13_ecs.tf의 aws_cloudwatch_log_group.app을 Firehose로 구독
resource "aws_cloudwatch_log_subscription_filter" "ecs_to_firehose" {
  name            = "${var.project_name}-${var.environment}-ecs-to-firehose"
  log_group_name  = aws_cloudwatch_log_group.app.name
  filter_pattern  = ""   # 모든 로그
  destination_arn = aws_kinesis_firehose_delivery_stream.ecs_logs_to_s3.arn
  role_arn        = aws_iam_role.cw_to_firehose.arn
}