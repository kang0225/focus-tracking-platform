##############################
### Amazon Managed Grafana ###
##############################
/*
ECS/ALB/RDS 등 인프라 지표를 CloudWatch에서 끌어와 시각화하기 위한
Amazon Managed Grafana 워크스페이스.

- 인증(authentication): AWS IAM Identity Center (AWS_SSO)
    * 계정/조직에 IAM Identity Center가 활성화되어 있어야 apply가 성공합니다.
    * 워크스페이스에 접근할 사용자/그룹 매핑은 Grafana 콘솔(또는 SSO)에서 부여합니다.
- 권한(permission): CUSTOMER_MANAGED
    * 워크스페이스가 사용할 서비스 역할(aws_iam_role.grafana)은 11_iam.tf에 정의되어 있습니다.
- 데이터 소스(data source): CloudWatch (지표 + 로그)
*/

resource "aws_grafana_workspace" "main" {
  name        = "${var.project_name}-${var.environment}"
  description = "Focus Tracking Platform monitoring (CloudWatch)"

  account_access_type      = "CURRENT_ACCOUNT"
  authentication_providers = ["AWS_SSO"]
  permission_type          = "CUSTOMER_MANAGED"
  role_arn                 = aws_iam_role.grafana.arn

  data_sources = ["CLOUDWATCH"]

  tags = {
    Name = "${var.project_name}-${var.environment}-grafana"
  }
}
