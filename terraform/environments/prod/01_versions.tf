terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "focus-tracking-platform-terraform-state-bucket"
    key            = "prod/terraform.tfstate" #prod
    region         = "ap-northeast-2"
    dynamodb_table = "focus-tracking-platform-terraform-locks"
    encrypt        = true
  }
}