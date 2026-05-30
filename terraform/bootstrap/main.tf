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

# Github Actions IAM 정책 문서 (1/3) - 백엔드/네트워크/EC2/ELB
data "aws_iam_policy_document" "github_actions_permissions_policy_document" {
  statement {
    sid    = "AllowStateBucketAccess" # 임의의 상태 ID
    effect = "Allow"

    actions = [
      "s3:ListBucket",         # 버킷 안 조회
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
      "s3:GetObject",   # 상태 파일 읽기
      "s3:PutObject",   # 상태 파일 생성
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
      "dynamodb:GetItem",       # 락 상태 조회
      "dynamodb:PutItem",       # 락을 생성하여 하나의 트랜잭션만 허용
      "dynamodb:DeleteItem"     # 락을 제거하여 트랜잭션 완료 처리
    ]

    resources = [
      aws_dynamodb_table.terraform_lock_table.arn
    ]
  }

  statement {
    sid    = "AllowEC2Management"
    effect = "Allow"

    actions = [
      # 읽기 전용 액션은 와일드카드로 통합한다. Terraform refresh가 리소스마다
      # DescribeVolumes/DescribeInstanceCreditSpecifications/DescribeAddressesAttribute
      # 등 다양한 Describe* 를 호출하는데, 개별 나열 시 누락 하나마다 refresh 403 →
      # plan 중단이 반복되므로 ec2:Describe* 로 묶는다.
      "ec2:Describe*",
      # 쓰기/생성/삭제 액션은 최소권한 유지를 위해 명시적으로 나열한다.
      "ec2:CreateVpc", "ec2:DeleteVpc", "ec2:ModifyVpcAttribute",
      "ec2:CreateSubnet", "ec2:DeleteSubnet", "ec2:ModifySubnetAttribute",
      "ec2:CreateInternetGateway", "ec2:DeleteInternetGateway",
      "ec2:AttachInternetGateway", "ec2:DetachInternetGateway",
      "ec2:CreateRouteTable", "ec2:DeleteRouteTable",
      "ec2:CreateRoute", "ec2:DeleteRoute", "ec2:AssociateRouteTable", "ec2:DisassociateRouteTable",
      "ec2:AllocateAddress", "ec2:ReleaseAddress",
      "ec2:AssociateAddress", "ec2:DisassociateAddress",
      "ec2:CreateNatGateway", "ec2:DeleteNatGateway",
      "ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup",
      "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress",
      "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress",
      "ec2:CreateNetworkAcl", "ec2:DeleteNetworkAcl",
      "ec2:CreateNetworkAclEntry", "ec2:DeleteNetworkAclEntry",
      "ec2:ReplaceNetworkAclEntry", "ec2:ReplaceNetworkAclAssociation",
      "ec2:CreateVpcEndpoint", "ec2:DeleteVpcEndpoints", "ec2:ModifyVpcEndpoint",
      "ec2:RunInstances", "ec2:TerminateInstances", "ec2:ModifyInstanceAttribute",
      "ec2:CreateLaunchTemplate", "ec2:DeleteLaunchTemplate", "ec2:CreateLaunchTemplateVersion",
      "ec2:CreateFlowLogs", "ec2:DeleteFlowLogs",
      "ec2:CreateTags", "ec2:DeleteTags",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowELBManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용 액션은 와일드카드로 통합한다. refresh가 DescribeListenerAttributes/
      # DescribeLoadBalancerAttributes/DescribeTargetGroupAttributes 등을 호출하므로
      # 개별 나열 대신 elasticloadbalancing:Describe* 로 묶어 누락에 의한 403을 막는다.
      "elasticloadbalancing:Describe*",
      # 쓰기/생성/삭제 액션은 최소권한 유지를 위해 명시적으로 나열한다.
      "elasticloadbalancing:CreateLoadBalancer", "elasticloadbalancing:DeleteLoadBalancer",
      "elasticloadbalancing:ModifyLoadBalancerAttributes",
      "elasticloadbalancing:SetSecurityGroups", "elasticloadbalancing:SetSubnets",
      "elasticloadbalancing:SetIpAddressType",
      "elasticloadbalancing:CreateListener", "elasticloadbalancing:DeleteListener",
      "elasticloadbalancing:ModifyListener",
      "elasticloadbalancing:CreateTargetGroup", "elasticloadbalancing:DeleteTargetGroup",
      "elasticloadbalancing:ModifyTargetGroup", "elasticloadbalancing:ModifyTargetGroupAttributes",
      "elasticloadbalancing:RegisterTargets", "elasticloadbalancing:DeregisterTargets",
      "elasticloadbalancing:CreateRule", "elasticloadbalancing:DeleteRule",
      "elasticloadbalancing:ModifyRule",
      "elasticloadbalancing:AddTags", "elasticloadbalancing:RemoveTags",
    ]

    resources = ["*"]
  }
}

# Github Actions IAM 정책 문서 (2/3) - 컴퓨팅/스토리지/모니터링
# IAM 관리형 정책은 공백 제외 최대 6144자라 정책 문서를 3개로 분할한다.
data "aws_iam_policy_document" "github_actions_permissions_policy_document_2" {
  statement {
    sid    = "AllowAutoScalingManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Describe*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "autoscaling:Describe*",
      "autoscaling:CreateAutoScalingGroup", "autoscaling:DeleteAutoScalingGroup",
      "autoscaling:UpdateAutoScalingGroup",
      "autoscaling:CreateOrUpdateTags", "autoscaling:DeleteTags",
      "autoscaling:PutLifecycleHook", "autoscaling:DeleteLifecycleHook",
      "autoscaling:AttachLoadBalancerTargetGroups", "autoscaling:DetachLoadBalancerTargetGroups",
      "autoscaling:EnableMetricsCollection", "autoscaling:DisableMetricsCollection",
      "autoscaling:SuspendProcesses", "autoscaling:ResumeProcesses",
      "application-autoscaling:Describe*", "application-autoscaling:ListTagsForResource",
      "application-autoscaling:RegisterScalableTarget", "application-autoscaling:DeregisterScalableTarget",
      "application-autoscaling:PutScalingPolicy", "application-autoscaling:DeleteScalingPolicy",
      "application-autoscaling:TagResource", "application-autoscaling:UntagResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowECSManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Describe*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "ecs:Describe*", "ecs:List*",
      "ecs:CreateCluster", "ecs:DeleteCluster", "ecs:UpdateCluster",
      "ecs:RegisterTaskDefinition", "ecs:DeregisterTaskDefinition",
      "ecs:CreateService", "ecs:DeleteService", "ecs:UpdateService",
      "ecs:CreateCapacityProvider", "ecs:DeleteCapacityProvider", "ecs:UpdateCapacityProvider",
      "ecs:PutClusterCapacityProviders",
      "ecs:TagResource", "ecs:UntagResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowECRManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Describe*/Get*/List*/BatchGet*/BatchCheck*)은 와일드카드로 통합 (refresh 403 루프 방지)
      "ecr:Describe*", "ecr:Get*", "ecr:List*",
      "ecr:BatchGetImage", "ecr:BatchCheckLayerAvailability",
      "ecr:CreateRepository", "ecr:DeleteRepository",
      "ecr:SetRepositoryPolicy", "ecr:DeleteRepositoryPolicy",
      "ecr:PutLifecyclePolicy", "ecr:DeleteLifecyclePolicy",
      "ecr:PutImageTagMutability", "ecr:PutImageScanningConfiguration",
      "ecr:TagResource", "ecr:UntagResource",
      # Docker push (GitHub Actions CI/CD)
      "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload", "ecr:PutImage",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowCloudWatchManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Describe*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "logs:Describe*", "logs:ListTagsLogGroup", "logs:ListTagsForResource",
      "logs:CreateLogGroup", "logs:DeleteLogGroup",
      "logs:CreateLogStream", "logs:DeleteLogStream",
      "logs:PutSubscriptionFilter", "logs:DeleteSubscriptionFilter",
      "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy",
      "logs:TagLogGroup", "logs:UntagLogGroup",
      "logs:TagResource", "logs:UntagResource",
      "logs:PutResourcePolicy",
      "cloudwatch:Describe*", "cloudwatch:ListTagsForResource",
      "cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms",
      "cloudwatch:TagResource", "cloudwatch:UntagResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowRoute53ACMManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Get*/List*/Describe*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "route53:Get*", "route53:List*",
      "route53:ChangeResourceRecordSets", "route53:ChangeTagsForResource",
      "acm:Describe*", "acm:List*",
      "acm:RequestCertificate", "acm:DeleteCertificate",
      "acm:AddTagsToCertificate", "acm:RemoveTagsFromCertificate",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowS3Management"
    effect = "Allow"

    actions = [
      # 읽기 전용 액션은 와일드카드로 통합한다. Terraform이 버킷을 refresh할 때
      # GetBucketAcl/Cors/Website/Accelerate/RequestPayment/Replication/Notification
      # /ObjectLockConfiguration 등 다수의 Get* 를 호출하는데, 개별 나열 시
      # 누락 하나마다 refresh 403 → plan 중단이 반복되므로 s3:Get*/s3:List* 로 묶는다.
      "s3:Get*", "s3:List*",
      # 쓰기/생성/삭제 액션은 최소권한 유지를 위해 명시적으로 나열한다.
      "s3:CreateBucket", "s3:HeadBucket", "s3:DeleteBucket",
      "s3:PutBucketPolicy", "s3:DeleteBucketPolicy",
      "s3:PutBucketVersioning",
      "s3:PutEncryptionConfiguration",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketLifecycleConfiguration", "s3:DeleteBucketLifecycle",
      "s3:PutBucketLogging",
      "s3:PutBucketTagging",
      "s3:PutObject",
    ]

    resources = ["*"]
  }
}

# Github Actions IAM 정책 문서 (3/3) - IAM/배포/애플리케이션 서비스
data "aws_iam_policy_document" "github_actions_permissions_policy_document_3" {
  statement {
    sid    = "AllowIAMManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Get*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "iam:Get*", "iam:List*",
      "iam:CreateRole", "iam:DeleteRole", "iam:UpdateAssumeRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy",
      "iam:PutRolePolicy", "iam:DeleteRolePolicy",
      "iam:CreatePolicy", "iam:DeletePolicy",
      "iam:CreatePolicyVersion", "iam:DeletePolicyVersion",
      "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
      "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
      "iam:TagRole", "iam:UntagRole",
      "iam:TagPolicy", "iam:UntagPolicy",
      "iam:CreateServiceLinkedRole",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowPassRoleToAWSServices"
    effect = "Allow"

    actions = ["iam:PassRole"]

    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values = [
        "ec2.amazonaws.com",
        "ecs-tasks.amazonaws.com",
        "codedeploy.amazonaws.com",
        "firehose.amazonaws.com",
        "lambda.amazonaws.com",
        "logs.amazonaws.com",
        "scheduler.amazonaws.com",
        "grafana.amazonaws.com",
        "vpc-flow-logs.amazonaws.com", # aws_flow_log.main 의 deliver_logs_role_arn 전달용
      ]
    }
  }

  statement {
    sid    = "AllowRDSManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Describe*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "rds:Describe*", "rds:ListTagsForResource",
      "rds:CreateDBInstance", "rds:DeleteDBInstance", "rds:ModifyDBInstance",
      "rds:CreateDBSubnetGroup", "rds:DeleteDBSubnetGroup", "rds:ModifyDBSubnetGroup",
      "rds:AddTagsToResource", "rds:RemoveTagsFromResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowSecretsManagerManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Describe*/Get*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "secretsmanager:Describe*", "secretsmanager:Get*", "secretsmanager:List*",
      "secretsmanager:CreateSecret", "secretsmanager:DeleteSecret", "secretsmanager:RestoreSecret",
      "secretsmanager:PutSecretValue", "secretsmanager:UpdateSecret",
      "secretsmanager:TagResource", "secretsmanager:UntagResource",
      "secretsmanager:PutResourcePolicy", "secretsmanager:DeleteResourcePolicy",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowSSMAccess"
    effect = "Allow"

    actions = [
      # 읽기 전용(Get*/Describe*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "ssm:Get*", "ssm:Describe*",
      # ML EC2 배포 워크플로우에서 SSM으로 명령 실행
      "ssm:SendCommand",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowCodeDeployManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Get*/List*/BatchGet*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "codedeploy:Get*", "codedeploy:List*", "codedeploy:BatchGet*",
      "codedeploy:CreateApplication", "codedeploy:DeleteApplication",
      "codedeploy:CreateDeploymentGroup", "codedeploy:DeleteDeploymentGroup",
      "codedeploy:UpdateDeploymentGroup",
      "codedeploy:CreateDeployment", "codedeploy:StopDeployment",
      "codedeploy:TagResource", "codedeploy:UntagResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowSNSManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Get*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "sns:Get*", "sns:List*",
      "sns:CreateTopic", "sns:DeleteTopic", "sns:SetTopicAttributes",
      "sns:Subscribe", "sns:Unsubscribe",
      "sns:TagResource", "sns:UntagResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowFirehoseManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Describe*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "firehose:Describe*", "firehose:ListTagsForDeliveryStream",
      "firehose:CreateDeliveryStream", "firehose:DeleteDeliveryStream",
      "firehose:UpdateDestination",
      "firehose:TagDeliveryStream", "firehose:UntagDeliveryStream",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowLambdaManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Get*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "lambda:Get*", "lambda:List*",
      "lambda:CreateFunction", "lambda:DeleteFunction",
      "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration",
      "lambda:AddPermission", "lambda:RemovePermission",
      "lambda:TagResource", "lambda:UntagResource",
      "lambda:InvokeFunction", "lambda:PublishVersion",
      "lambda:PutFunctionEventInvokeConfig", "lambda:DeleteFunctionEventInvokeConfig",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowSchedulerManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Get*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "scheduler:Get*", "scheduler:List*",
      "scheduler:CreateSchedule", "scheduler:DeleteSchedule", "scheduler:UpdateSchedule",
      "scheduler:TagResource", "scheduler:UntagResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowGrafanaManagement"
    effect = "Allow"

    actions = [
      # 읽기 전용(Describe*/List*)은 와일드카드로 통합, 쓰기는 명시 (refresh 403 루프 방지)
      "grafana:Describe*", "grafana:List*",
      "grafana:CreateWorkspace", "grafana:DeleteWorkspace", "grafana:UpdateWorkspace",
      "grafana:UpdateWorkspaceAuthentication", "grafana:UpdateWorkspaceConfiguration",
      "grafana:TagResource", "grafana:UntagResource",
      # AWS_SSO 인증 워크스페이스 생성/삭제 시 AMG가 IAM Identity Center에
      # managed application instance를 등록하므로 호출자에게 sso 권한이 필요하다.
      # (AWS 관리형 AWSGrafanaAccountAdministrator 기준)
      "sso:CreateManagedApplicationInstance", "sso:DeleteManagedApplicationInstance",
      "sso:GetManagedApplicationInstance", "sso:DescribeRegisteredRegions",
      "sso:GetSharedSsoConfiguration", "sso:ListDirectoryAssociations",
    ]

    resources = ["*"]
  }
}

# aws에 github actions을 위한 실제 IAM 정책을 생성 (관리형 정책 6144자 한도로 3개 분할)
resource "aws_iam_policy" "github_actions_permissions_policy" {
  name   = "${var.project_name}-${var.environment}-github-actions-terraform-policy"
  policy = data.aws_iam_policy_document.github_actions_permissions_policy_document.json # 위에서 만든 IAM 정책을 json 형태로 변환
}

resource "aws_iam_policy" "github_actions_permissions_policy_2" {
  name   = "${var.project_name}-${var.environment}-github-actions-terraform-policy-2"
  policy = data.aws_iam_policy_document.github_actions_permissions_policy_document_2.json
}

resource "aws_iam_policy" "github_actions_permissions_policy_3" {
  name   = "${var.project_name}-${var.environment}-github-actions-terraform-policy-3"
  policy = data.aws_iam_policy_document.github_actions_permissions_policy_document_3.json
}

# 만든 IAM 정책들을 ROLE에 연결
resource "aws_iam_role_policy_attachment" "github_actions_permissions_attachment" {
  role       = aws_iam_role.github_actions_iam_role.name
  policy_arn = aws_iam_policy.github_actions_permissions_policy.arn # 방금 생성한 IAM 정책의 주소
}

resource "aws_iam_role_policy_attachment" "github_actions_permissions_attachment_2" {
  role       = aws_iam_role.github_actions_iam_role.name
  policy_arn = aws_iam_policy.github_actions_permissions_policy_2.arn
}

resource "aws_iam_role_policy_attachment" "github_actions_permissions_attachment_3" {
  role       = aws_iam_role.github_actions_iam_role.name
  policy_arn = aws_iam_policy.github_actions_permissions_policy_3.arn
}
