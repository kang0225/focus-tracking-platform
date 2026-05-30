##########################################
### 신뢰 관계 정의 (Assume Role Policies) ###
##########################################

# EC2 서비스가 이 역할을 빌려 쓸 수 있게 허용
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# ECS Task 서비스가 이 역할을 빌려 쓸 수 있게 허용
data "aws_iam_policy_document" "ecs_tasks_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# CodeDeploy 서비스가 이 역할을 빌려 쓸 수 있게 허용
data "aws_iam_policy_document" "codedeploy_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["codedeploy.amazonaws.com"]
    }
  }
}

# Grafana 서비스가 이 역할을 빌려 CloudWatch를 조회할 수 있게 허용
data "aws_iam_policy_document" "grafana_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["grafana.amazonaws.com"]
    }
  }
}

# Fargate로 전환하여 웹 EC2 Role은 제거됨.

################################
### ML 서버 역할 (ML EC2 Role) ###
################################

resource "aws_iam_role" "ml_ec2_role" {
  name               = "${var.project_name}-${var.environment}-ml-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ml_ec2_ssm" {
  role       = aws_iam_role.ml_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ml_ec2_ecr_readonly" {
  role       = aws_iam_role.ml_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
} # ECS을 사용하지 않아 직접 ECR에서 Pull 작업 필요

resource "aws_iam_instance_profile" "ml_ec2_profile" {
  name = aws_iam_role.ml_ec2_role.name
  role = aws_iam_role.ml_ec2_role.name
}


########################
### ECS 태스크 실행 역할 ###
########################

# ECS 에이전트가 ECR에서 이미지를 긁어오고 로그를 보낼 때 쓰는 역할입니다.
resource "aws_iam_role" "ecs_task_execution_role" {
  name               = "${var.project_name}-${var.environment}-ecs-task-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_standard" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_task_execution_postgres_secret" {
  name = "${var.project_name}-${var.environment}-postgres-secret-read"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AllowReadPostgresMasterSecret"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = try(aws_db_instance.postgres.master_user_secret[0].secret_arn, "*")
      }
    ]
  })
}

####################
### ECS 태스크 역할 ###
####################

# 컨테이너 안의 '앱 코드'가 S3나 DynamoDB 등 AWS 자원을 직접 쓸 때 쓰는 역할입니다.
resource "aws_iam_role" "ecs_task_role" {
  name               = "${var.project_name}-${var.environment}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

###########################
### CodeDeploy 서비스 역할 ###
###########################

# CodeDeploy가 로드밸런서를 조절하고 ECS 배포를 관리하기 위해 쓰는 역할입니다.
resource "aws_iam_role" "codedeploy_role" {
  name               = "${var.project_name}-${var.environment}-codedeploy-role"
  assume_role_policy = data.aws_iam_policy_document.codedeploy_assume_role.json
}

# AWS가 제공하는 ECS 블루-그린 배포 전용 정책 연결
resource "aws_iam_role_policy_attachment" "codedeploy_ecs" {
  role       = aws_iam_role.codedeploy_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSCodeDeployRoleForECS"
}

################################
### ML EC2 Bedrock 권한 추가 ###
################################

# ml-service가 boto3로 Bedrock Claude Sonnet 4.5 global inference profile을 호출하기 위한 권한
resource "aws_iam_role_policy" "ml_ec2_bedrock" {
  name = "${var.project_name}-${var.environment}-bedrock-invoke"
  role = aws_iam_role.ml_ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowBedrockInvokeClaudeSonnetGlobalProfile"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/global.anthropic.claude-sonnet-4-5-20250929-v1:0"
        ]
      },
      {
        Sid    = "AllowBedrockInvokeClaudeSonnetRegionalModel"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:aws:bedrock:${var.aws_region}::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0"
        ]
      },
      {
        Sid    = "AllowBedrockInvokeClaudeSonnetGlobalModel"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:aws:bedrock:::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0"
        ]
      }
    ]
  })
}

##########################################
### Grafana 서비스 역할 (Amazon Managed Grafana) ###
##########################################

# Amazon Managed Grafana 워크스페이스(27_grafana.tf)가 사용하는 서비스 역할
resource "aws_iam_role" "grafana" {
  name               = "${var.project_name}-${var.environment}-grafana-role"
  assume_role_policy = data.aws_iam_policy_document.grafana_assume_role.json
}

# CloudWatch 데이터 소스용 읽기 권한 (지표 + 로그 + 태그)
data "aws_iam_policy_document" "grafana_cloudwatch" {
  statement {
    sid    = "AllowReadingMetricsFromCloudWatch"
    effect = "Allow"
    actions = [
      "cloudwatch:DescribeAlarmsForMetric",
      "cloudwatch:DescribeAlarmHistory",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:ListMetrics",
      "cloudwatch:GetMetricData",
      "cloudwatch:GetInsightRuleReport",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "AllowReadingLogsFromCloudWatch"
    effect = "Allow"
    actions = [
      "logs:DescribeLogGroups",
      "logs:GetLogGroupFields",
      "logs:StartQuery",
      "logs:StopQuery",
      "logs:GetQueryResults",
      "logs:GetLogEvents",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "AllowReadingTagsInstancesRegionsFromEC2"
    effect = "Allow"
    actions = [
      "ec2:DescribeTags",
      "ec2:DescribeInstances",
      "ec2:DescribeRegions",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "AllowReadingResourcesForTags"
    effect    = "Allow"
    actions   = ["tag:GetResources"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "grafana_cloudwatch" {
  name   = "${var.project_name}-${var.environment}-grafana-cloudwatch"
  role   = aws_iam_role.grafana.id
  policy = data.aws_iam_policy_document.grafana_cloudwatch.json
}
