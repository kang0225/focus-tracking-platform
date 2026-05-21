data "aws_iam_policy_document" "datadog_aws_integration_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::464622532012:root"]
    }

    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values = [
        datadog_integration_aws_account.datadog_integration.auth_config.aws_auth_config_role.external_id
      ]
    }
  }
}

data "datadog_integration_aws_iam_permissions" "datadog_permissions" {}

locals {
  datadog_integration_role_name = "DatadogIntegrationRole"

  datadog_all_permissions = data.datadog_integration_aws_iam_permissions.datadog_permissions.iam_permissions

  datadog_target_chunk_size = 5900

  datadog_permission_sizes = [
    for perm in local.datadog_all_permissions :
    length(perm) + 3
  ]

  datadog_cumulative_sizes = [
    for i in range(length(local.datadog_permission_sizes)) :
    sum(slice(local.datadog_permission_sizes, 0, i + 1))
  ]

  datadog_chunk_assignments = [
    for cumulative_size in local.datadog_cumulative_sizes :
    floor(cumulative_size / local.datadog_target_chunk_size)
  ]

  datadog_chunk_numbers = distinct(local.datadog_chunk_assignments)

  datadog_permission_chunks = [
    for chunk_num in local.datadog_chunk_numbers : [
      for i, perm in local.datadog_all_permissions :
      perm if local.datadog_chunk_assignments[i] == chunk_num
    ]
  ]
}

data "aws_iam_policy_document" "datadog_aws_integration" {
  count = length(local.datadog_permission_chunks)

  statement {
    actions   = local.datadog_permission_chunks[count.index]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "datadog_aws_integration" {
  count = length(local.datadog_permission_chunks)

  name   = "DatadogAWSIntegrationPolicy-${count.index + 1}"
  policy = data.aws_iam_policy_document.datadog_aws_integration[count.index].json
}

resource "aws_iam_role" "datadog_aws_integration" {
  name               = local.datadog_integration_role_name
  description        = "Role for Datadog AWS Integration"
  assume_role_policy = data.aws_iam_policy_document.datadog_aws_integration_assume_role.json
}

resource "aws_iam_role_policy_attachment" "datadog_aws_integration" {
  count = length(local.datadog_permission_chunks)

  role       = aws_iam_role.datadog_aws_integration.name
  policy_arn = aws_iam_policy.datadog_aws_integration[count.index].arn
}

resource "aws_iam_role_policy_attachment" "datadog_aws_integration_security_audit" {
  role       = aws_iam_role.datadog_aws_integration.name
  policy_arn = "arn:aws:iam::aws:policy/SecurityAudit"
}

resource "datadog_integration_aws_account" "datadog_integration" {
  account_tags   = []
  aws_account_id = var.datadog_aws_account_id
  aws_partition  = "aws"

  aws_regions {
    include_all = true
  }

  auth_config {
    aws_auth_config_role {
      role_name = local.datadog_integration_role_name
    }
  }

  resources_config {
    cloud_security_posture_management_collection = true
    extended_collection                          = true
  }

  traces_config {
    xray_services {}
  }

  logs_config {
    lambda_forwarder {
      lambdas = [module.datadog_log_forwarder.datadog_forwarder_arn]
      sources = [
        "apigw-access-logs",
        "apigw-execution-logs",
        "appsync",
        "batch",
        "bedrock-agentcore",
        "cloudfront",
        "cloudtrail",
        "codebuild",
        "dms",
        "docdb",
        "ecs",
        "eks",
        "eks-container-insights",
        "elb",
        "elbv2",
        "glue",
        "iot",
        "lambda",
        "lambda-edge",
        "mwaa",
        "network-firewall",
        "pcs",
        "rds",
        "redshift",
        "redshift-serverless",
        "route53",
        "route53-resolver",
        "s3",
        "ssm",
        "states",
        "verified-access",
        "vpc",
        "vpn",
        "waf",
      ]

      log_source_config {}
    }
  }

  metrics_config {
    namespace_filters {}
  }
}

module "datadog_log_forwarder" {
  source  = "DataDog/log-lambda-forwarder-datadog/aws"
  version = "1.4.1"

  dd_api_key = var.datadog_api_key
  dd_site    = var.datadog_site

  tags = {
    Terraform = "true"
  }
}
