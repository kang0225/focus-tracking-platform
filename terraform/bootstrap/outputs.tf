########################
# 후에 사용될 출력값들모음 ###
########################

output "terraform_state_bucket_name" {
  description = "상태 S3 버킷 이름"
  value       = aws_s3_bucket.state_bucket.bucket
}

output "terraform_lock_table_name" {
  description = "DynamoDB Lock 테이블이름",
  value       = aws_dynamodb_table.terraform_lock_table.name
}

output "github_actions_role_arn" {
  description = "Github Actions을 위한 IAM Role ARN"
  value       = aws_iam_role.github_actions_iam_role.arn
}

output "aws_account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}