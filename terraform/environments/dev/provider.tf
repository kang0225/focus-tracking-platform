provider "aws" { 
    region = "ap-northeast-2"
    
    default_tags { 
        tags = { 
            Project = "focus-tracking-platform" 
            Environment = "dev"
            ManagedBy = "terraform" 
            Stack = "main" 
        } 
    } 
}