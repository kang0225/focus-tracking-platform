variable "aws_region" {
  type = string
}

variable "aws_region_cloudfront" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "stack_name" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "az_a" {
  type = string
}

variable "az_c" {
  type = string
}

variable "public_subnet_a_cidr" {
  type = string
}

variable "public_subnet_c_cidr" {
  type = string
}

variable "private_app_subnet_a_cidr" {
  type = string
}

variable "private_app_subnet_c_cidr" {
  type = string
}

variable "private_db_subnet_a_cidr" {
  type = string
}

variable "private_db_subnet_c_cidr" {
  type = string
}

variable "app_port" {
  type    = number
  default = 3000
}

variable "db_port" {
  type    = number
  default = 5432
}

variable "ml_port" {
  type    = number
  default = 8000
}

variable "instance_name" {
  description = "EC2 이름"
  type        = string
  default     = "test-ec2"
}

variable "domain_name" {
  description = "구매한 도메인 (apex)"
  type        = string
}
variable "alert_emails" {
  description = "장애 알림 수신 이메일 목록"
  type        = list(string)
}

variable "datadog_api_key" {
  description = "Datadog API key"
  type        = string
  sensitive   = true
}

variable "datadog_app_key" {
  description = "Datadog application key"
  type        = string
  sensitive   = true
}

variable "datadog_site" {
  description = "Datadog site domain"
  type        = string
  default     = "us5.datadoghq.com"
}

variable "datadog_aws_account_id" {
  description = "AWS account ID to connect to Datadog"
  type        = string
  default     = "058264452543"
}

variable "datadog_slack_account_name" {
  description = "Datadog Slack integration에서 UI로 연결한 워크스페이스 이름"
  type        = string
  default     = "ICE6141"
}

variable "datadog_slack_channel" {
  description = "알림을 받을 Slack 채널 (예: #focus-alerts)"
  type        = string
  default     = "#focus-alerts"
}

variable "postgres_db_name" {
  description = "Initial PostgreSQL database name."
  type        = string
  default     = "focus_tracking_database"
}

variable "postgres_master_username" {
  description = "PostgreSQL master username. The password is managed by RDS in Secrets Manager."
  type        = string
}

variable "postgres_instance_class" {
  description = "RDS PostgreSQL instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "postgres_allocated_storage" {
  description = "Initial RDS PostgreSQL storage size in GiB."
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Maximum RDS PostgreSQL storage size in GiB."
  type        = number
  default     = 20
}

variable "postgres_backup_retention_days" {
  description = "RDS PostgreSQL automated backup retention period in days."
  type        = number
  default     = 7
}