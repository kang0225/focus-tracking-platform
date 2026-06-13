variable "project_name" {
  description = "리소스 네이밍/태그 prefix"
  type        = string
}

variable "environment" {
  description = "환경 식별자 (dev/staging/prod)"
  type        = string
}

variable "aws_region" {
  description = "VPC 엔드포인트 service_name 구성에 사용"
  type        = string
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
  type = number
}

variable "db_port" {
  type = number
}

variable "ml_port" {
  type = number
}
