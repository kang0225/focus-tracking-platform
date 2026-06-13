terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.21, < 7.0"
    }
    datadog = {
      source  = "DataDog/datadog"
      version = ">= 4.10, < 5.0"
    }
  }

  backend "s3" {
    bucket         = "focus-tracking-platform-terraform-state-bucket"
    key            = "dev/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "focus-tracking-platform-terraform-locks"
    encrypt        = true
  }
}
