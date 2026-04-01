provider "aws" {
  region = var.aws_region
  profile = "admin"

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Stack       = "bootstrap"
    }
  }
}