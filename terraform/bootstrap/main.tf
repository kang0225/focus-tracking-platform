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
      "ec2:CreateVpc", "ec2:DescribeVpcs", "ec2:DeleteVpc",
      "ec2:ModifyVpcAttribute", "ec2:DescribeVpcAttribute",
      "ec2:CreateSubnet", "ec2:DescribeSubnets", "ec2:DeleteSubnet", "ec2:ModifySubnetAttribute",
      "ec2:CreateInternetGateway", "ec2:DescribeInternetGateways", "ec2:DeleteInternetGateway",
      "ec2:AttachInternetGateway", "ec2:DetachInternetGateway",
      "ec2:CreateRouteTable", "ec2:DescribeRouteTables", "ec2:DeleteRouteTable",
      "ec2:CreateRoute", "ec2:DeleteRoute", "ec2:AssociateRouteTable", "ec2:DisassociateRouteTable",
      "ec2:AllocateAddress", "ec2:DescribeAddresses", "ec2:ReleaseAddress",
      "ec2:AssociateAddress", "ec2:DisassociateAddress",
      "ec2:CreateNatGateway", "ec2:DescribeNatGateways", "ec2:DeleteNatGateway",
      "ec2:CreateSecurityGroup", "ec2:DescribeSecurityGroups", "ec2:DeleteSecurityGroup",
      "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress",
      "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress",
      "ec2:DescribeSecurityGroupRules",
      "ec2:CreateNetworkAcl", "ec2:DescribeNetworkAcls", "ec2:DeleteNetworkAcl",
      "ec2:CreateNetworkAclEntry", "ec2:DeleteNetworkAclEntry",
      "ec2:ReplaceNetworkAclEntry", "ec2:ReplaceNetworkAclAssociation",
      "ec2:CreateVpcEndpoint", "ec2:DescribeVpcEndpoints", "ec2:DeleteVpcEndpoints",
      "ec2:ModifyVpcEndpoint", "ec2:DescribePrefixLists",
      "ec2:RunInstances", "ec2:DescribeInstances", "ec2:TerminateInstances",
      "ec2:ModifyInstanceAttribute", "ec2:DescribeInstanceStatus",
      "ec2:CreateLaunchTemplate", "ec2:DescribeLaunchTemplates", "ec2:DeleteLaunchTemplate",
      "ec2:CreateLaunchTemplateVersion", "ec2:DescribeLaunchTemplateVersions",
      "ec2:CreateFlowLogs", "ec2:DescribeFlowLogs", "ec2:DeleteFlowLogs",
      "ec2:CreateTags", "ec2:DeleteTags", "ec2:DescribeTags",
      "ec2:DescribeAvailabilityZones", "ec2:DescribeImages",
      "ec2:DescribeInstanceTypes", "ec2:DescribeAccountAttributes",
      "ec2:DescribeNetworkInterfaces",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowELBManagement"
    effect = "Allow"

    actions = [
      "elasticloadbalancing:CreateLoadBalancer", "elasticloadbalancing:DescribeLoadBalancers",
      "elasticloadbalancing:DeleteLoadBalancer", "elasticloadbalancing:ModifyLoadBalancerAttributes",
      "elasticloadbalancing:DescribeLoadBalancerAttributes",
      "elasticloadbalancing:SetSecurityGroups", "elasticloadbalancing:SetSubnets",
      "elasticloadbalancing:SetIpAddressType",
      "elasticloadbalancing:CreateListener", "elasticloadbalancing:DescribeListeners",
      "elasticloadbalancing:DeleteListener", "elasticloadbalancing:ModifyListener",
      "elasticloadbalancing:CreateTargetGroup", "elasticloadbalancing:DescribeTargetGroups",
      "elasticloadbalancing:DeleteTargetGroup", "elasticloadbalancing:ModifyTargetGroup",
      "elasticloadbalancing:ModifyTargetGroupAttributes", "elasticloadbalancing:DescribeTargetGroupAttributes",
      "elasticloadbalancing:RegisterTargets", "elasticloadbalancing:DeregisterTargets",
      "elasticloadbalancing:DescribeTargetHealth",
      "elasticloadbalancing:CreateRule", "elasticloadbalancing:DescribeRules",
      "elasticloadbalancing:DeleteRule", "elasticloadbalancing:ModifyRule",
      "elasticloadbalancing:AddTags", "elasticloadbalancing:RemoveTags",
      "elasticloadbalancing:DescribeTags",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowAutoScalingManagement"
    effect = "Allow"

    actions = [
      "autoscaling:CreateAutoScalingGroup", "autoscaling:DescribeAutoScalingGroups",
      "autoscaling:DeleteAutoScalingGroup", "autoscaling:UpdateAutoScalingGroup",
      "autoscaling:DescribeScalingActivities",
      "autoscaling:CreateOrUpdateTags", "autoscaling:DeleteTags", "autoscaling:DescribeTags",
      "autoscaling:DescribeLifecycleHooks", "autoscaling:PutLifecycleHook",
      "autoscaling:DeleteLifecycleHook",
      "autoscaling:DescribeAutoScalingInstances", "autoscaling:DescribeLoadBalancerTargetGroups",
      "autoscaling:AttachLoadBalancerTargetGroups", "autoscaling:DetachLoadBalancerTargetGroups",
      "autoscaling:DescribeTerminationPolicyTypes", "autoscaling:DescribeAdjustmentTypes",
      "autoscaling:DescribeMetricCollectionTypes",
      "autoscaling:EnableMetricsCollection", "autoscaling:DisableMetricsCollection",
      "autoscaling:DescribeNotificationConfigurations",
      "autoscaling:SuspendProcesses", "autoscaling:ResumeProcesses",
      "application-autoscaling:RegisterScalableTarget", "application-autoscaling:DescribeScalableTargets",
      "application-autoscaling:DeregisterScalableTarget",
      "application-autoscaling:PutScalingPolicy", "application-autoscaling:DescribeScalingPolicies",
      "application-autoscaling:DeleteScalingPolicy",
      "application-autoscaling:DescribeScalingActivities",
      "application-autoscaling:TagResource", "application-autoscaling:UntagResource",
      "application-autoscaling:ListTagsForResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowECSManagement"
    effect = "Allow"

    actions = [
      "ecs:CreateCluster", "ecs:DescribeClusters", "ecs:DeleteCluster", "ecs:UpdateCluster",
      "ecs:ListClusters",
      "ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition",
      "ecs:DeregisterTaskDefinition", "ecs:ListTaskDefinitions",
      "ecs:CreateService", "ecs:DescribeServices", "ecs:DeleteService", "ecs:UpdateService",
      "ecs:CreateCapacityProvider", "ecs:DescribeCapacityProviders",
      "ecs:DeleteCapacityProvider", "ecs:UpdateCapacityProvider",
      "ecs:PutClusterCapacityProviders",
      "ecs:TagResource", "ecs:UntagResource", "ecs:ListTagsForResource",
      "ecs:DescribeTasks", "ecs:ListTasks",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowECRManagement"
    effect = "Allow"

    actions = [
      "ecr:CreateRepository", "ecr:DescribeRepositories", "ecr:DeleteRepository",
      "ecr:GetRepositoryPolicy", "ecr:SetRepositoryPolicy", "ecr:DeleteRepositoryPolicy",
      "ecr:PutLifecyclePolicy", "ecr:GetLifecyclePolicy", "ecr:DeleteLifecyclePolicy",
      "ecr:PutImageTagMutability", "ecr:PutImageScanningConfiguration",
      "ecr:ListTagsForResource", "ecr:TagResource", "ecr:UntagResource",
      "ecr:DescribeImages",
      # Docker push (GitHub Actions CI/CD)
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage",
      "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowCloudWatchManagement"
    effect = "Allow"

    actions = [
      "logs:CreateLogGroup", "logs:DescribeLogGroups", "logs:DeleteLogGroup",
      "logs:CreateLogStream", "logs:DescribeLogStreams", "logs:DeleteLogStream",
      "logs:PutSubscriptionFilter", "logs:DescribeSubscriptionFilters",
      "logs:DeleteSubscriptionFilter",
      "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy",
      "logs:ListTagsLogGroup", "logs:TagLogGroup", "logs:UntagLogGroup",
      "logs:ListTagsForResource", "logs:TagResource", "logs:UntagResource",
      "logs:DescribeResourcePolicies", "logs:PutResourcePolicy",
      "cloudwatch:PutMetricAlarm", "cloudwatch:DescribeAlarms", "cloudwatch:DeleteAlarms",
      "cloudwatch:ListTagsForResource", "cloudwatch:TagResource", "cloudwatch:UntagResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowRoute53ACMManagement"
    effect = "Allow"

    actions = [
      "route53:ListHostedZones", "route53:ListHostedZonesByName",
      "route53:GetHostedZone", "route53:ChangeResourceRecordSets",
      "route53:ListResourceRecordSets", "route53:GetChange",
      "route53:ListTagsForResource", "route53:ChangeTagsForResource",
      "acm:RequestCertificate", "acm:DescribeCertificate", "acm:DeleteCertificate",
      "acm:AddTagsToCertificate", "acm:ListTagsForCertificate",
      "acm:RemoveTagsFromCertificate", "acm:ListCertificates",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowS3Management"
    effect = "Allow"

    actions = [
      "s3:CreateBucket", "s3:HeadBucket", "s3:DeleteBucket", "s3:GetBucketLocation",
      "s3:GetBucketPolicy", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy",
      "s3:GetBucketVersioning", "s3:PutBucketVersioning",
      "s3:GetEncryptionConfiguration", "s3:PutEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock", "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketLifecycleConfiguration", "s3:PutBucketLifecycleConfiguration",
      "s3:DeleteBucketLifecycle",
      "s3:GetBucketLogging", "s3:PutBucketLogging",
      "s3:GetBucketAcl",
      "s3:GetBucketTagging", "s3:PutBucketTagging",
      "s3:GetBucketOwnershipControls",
      "s3:ListBucket", "s3:GetObject", "s3:PutObject",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowIAMManagement"
    effect = "Allow"

    actions = [
      "iam:CreateRole", "iam:GetRole", "iam:DeleteRole", "iam:UpdateAssumeRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies",
      "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy", "iam:ListRolePolicies",
      "iam:CreatePolicy", "iam:GetPolicy", "iam:DeletePolicy",
      "iam:CreatePolicyVersion", "iam:GetPolicyVersion",
      "iam:DeletePolicyVersion", "iam:ListPolicyVersions",
      "iam:CreateInstanceProfile", "iam:GetInstanceProfile", "iam:DeleteInstanceProfile",
      "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
      "iam:ListInstanceProfilesForRole",
      "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags",
      "iam:TagPolicy", "iam:UntagPolicy", "iam:ListPolicyTags",
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
      ]
    }
  }

  statement {
    sid    = "AllowRDSManagement"
    effect = "Allow"

    actions = [
      "rds:CreateDBInstance", "rds:DescribeDBInstances",
      "rds:DeleteDBInstance", "rds:ModifyDBInstance",
      "rds:CreateDBSubnetGroup", "rds:DescribeDBSubnetGroups",
      "rds:DeleteDBSubnetGroup", "rds:ModifyDBSubnetGroup",
      "rds:AddTagsToResource", "rds:RemoveTagsFromResource", "rds:ListTagsForResource",
      "rds:DescribeDBEngineVersions", "rds:DescribeOrderableDBInstanceOptions",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowSecretsManagerManagement"
    effect = "Allow"

    actions = [
      "secretsmanager:CreateSecret", "secretsmanager:DescribeSecret",
      "secretsmanager:DeleteSecret", "secretsmanager:RestoreSecret",
      "secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue",
      "secretsmanager:UpdateSecret", "secretsmanager:ListSecrets",
      "secretsmanager:ListSecretVersionIds",
      "secretsmanager:TagResource", "secretsmanager:UntagResource",
      "secretsmanager:GetResourcePolicy", "secretsmanager:PutResourcePolicy",
      "secretsmanager:DeleteResourcePolicy",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowSSMAccess"
    effect = "Allow"

    actions = [
      "ssm:GetParameter", "ssm:GetParameters",
      # ML EC2 배포 워크플로우에서 SSM으로 명령 실행
      "ssm:SendCommand", "ssm:GetCommandInvocation",
      "ssm:DescribeInstanceInformation",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowCodeDeployManagement"
    effect = "Allow"

    actions = [
      "codedeploy:CreateApplication", "codedeploy:GetApplication",
      "codedeploy:DeleteApplication", "codedeploy:ListApplications",
      "codedeploy:CreateDeploymentGroup", "codedeploy:GetDeploymentGroup",
      "codedeploy:DeleteDeploymentGroup", "codedeploy:UpdateDeploymentGroup",
      "codedeploy:ListDeploymentGroups", "codedeploy:BatchGetDeploymentGroups",
      "codedeploy:CreateDeployment", "codedeploy:GetDeployment",
      "codedeploy:StopDeployment", "codedeploy:ListDeployments",
      "codedeploy:GetDeploymentConfig",
      "codedeploy:ListTagsForResource", "codedeploy:TagResource",
      "codedeploy:UntagResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowSNSManagement"
    effect = "Allow"

    actions = [
      "sns:CreateTopic", "sns:GetTopicAttributes", "sns:DeleteTopic",
      "sns:SetTopicAttributes", "sns:ListTopics",
      "sns:Subscribe", "sns:GetSubscriptionAttributes",
      "sns:Unsubscribe", "sns:ListSubscriptionsByTopic",
      "sns:TagResource", "sns:UntagResource", "sns:ListTagsForResource",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowFirehoseManagement"
    effect = "Allow"

    actions = [
      "firehose:CreateDeliveryStream", "firehose:DescribeDeliveryStream",
      "firehose:DeleteDeliveryStream", "firehose:UpdateDestination",
      "firehose:TagDeliveryStream", "firehose:UntagDeliveryStream",
      "firehose:ListTagsForDeliveryStream",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowLambdaManagement"
    effect = "Allow"

    actions = [
      "lambda:CreateFunction", "lambda:GetFunction", "lambda:DeleteFunction",
      "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration",
      "lambda:GetFunctionConfiguration",
      "lambda:AddPermission", "lambda:GetPolicy", "lambda:RemovePermission",
      "lambda:ListTags", "lambda:TagResource", "lambda:UntagResource",
      "lambda:InvokeFunction",
      "lambda:PublishVersion", "lambda:ListVersionsByFunction",
      "lambda:PutFunctionEventInvokeConfig", "lambda:GetFunctionEventInvokeConfig",
      "lambda:DeleteFunctionEventInvokeConfig",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowSchedulerManagement"
    effect = "Allow"

    actions = [
      "scheduler:CreateSchedule", "scheduler:GetSchedule",
      "scheduler:DeleteSchedule", "scheduler:UpdateSchedule",
      "scheduler:ListSchedules",
      "scheduler:TagResource", "scheduler:UntagResource",
      "scheduler:ListTagsForResource",
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
