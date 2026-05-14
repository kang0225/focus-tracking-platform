variable "aws_region" {
  type = string
}

variable "aws_region_cloudfront" {
  type = string
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
  default = 3306
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