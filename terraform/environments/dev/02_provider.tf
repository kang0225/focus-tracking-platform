provider "aws" { 
    region = var.aws_region
    
    default_tags { 
        tags = { 
            Project = var.project_name
            Environment = var.environment
            ManagedBy = "terraform" 
            Stack = var.stack_name
        } 
    } 
}

provider "aws" {
  alias  = "aws_us"
  region = var.aws_region_cloudfront

  default_tags {
        tags = {
            Project = var.project_name
            Environment = var.environment
            ManagedBy = "terraform"
            Stack = var.stack_name
        }
  }
}