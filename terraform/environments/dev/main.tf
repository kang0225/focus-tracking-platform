###################
#### VPC & IGW ####
###################
resource "aws_vpc" "main_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-${var.environment}-vpc"
  }
}

resource "aws_internet_gateway" "main_igw" {
  vpc_id = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-igw"
  }
}

######################
### Public Subnets ###
######################
resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main_vpc.id
  cidr_block              = var.public_subnet_a_cidr
  availability_zone       = var.az_a
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-${var.environment}-public-a"
    Type = "public"
  }
}

resource "aws_subnet" "public_c" {
  vpc_id                  = aws_vpc.main_vpc.id
  cidr_block              = var.public_subnet_c_cidr
  availability_zone       = var.az_c
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-${var.environment}-public-c"
    Type = "public"
  }
}

#########################
## Private App Subnets ##
#########################
resource "aws_subnet" "private_app_a" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = var.private_app_subnet_a_cidr
  availability_zone = var.az_a

  tags = {
    Name = "${var.project_name}-${var.environment}-private-app-a"
    Type = "private-app"
  }
}

resource "aws_subnet" "private_app_c" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = var.private_app_subnet_c_cidr
  availability_zone = var.az_c

  tags = {
    Name = "${var.project_name}-${var.environment}-private-app-c"
    Type = "private-app"
  }
}

########################
## Private DB Subnets ##
########################
resource "aws_subnet" "private_db_a" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = var.private_db_subnet_a_cidr
  availability_zone = var.az_a

  tags = {
    Name = "${var.project_name}-${var.environment}-private-db-a"
    Type = "private-db"
  }
}

resource "aws_subnet" "private_db_c" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = var.private_db_subnet_c_cidr
  availability_zone = var.az_c

  tags = {
    Name = "${var.project_name}-${var.environment}-private-db-c"
    Type = "private-db"
  }
}