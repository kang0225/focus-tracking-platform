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
#########################
#### Security Groups ####
#########################

# 1. ALB 보안 그룹 (관문)
resource "aws_security_group" "alb_sg" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Security group for FocusTracker ALB"
  vpc_id      = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-sg"
  }
}

# 2. Web EC2 보안 그룹 (인터페이스/시그널링)
resource "aws_security_group" "web_sg" {
  name        = "${var.project_name}-${var.environment}-web-sg"
  description = "Security group for Web Interface EC2"
  vpc_id      = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-web-sg"
  }
}

# 3. Data EC2 보안 그룹 (점수 수집/분석 - 8000번)
resource "aws_security_group" "data_sg" {
  name        = "${var.project_name}-${var.environment}-data-sg"
  description = "Security group for Data Processing EC2"
  vpc_id      = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-data-sg"
  }
}

##########################
#### SG Rules (Rules) ####
##########################

# --- ALB Rules ---
resource "aws_security_group_rule" "alb_ingress_http" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb_sg.id
}

resource "aws_security_group_rule" "alb_ingress_https" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb_sg.id
}

resource "aws_security_group_rule" "alb_egress_to_web" {
  type                     = "egress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.alb_sg.id
}

# --- Web EC2 Rules ---
resource "aws_security_group_rule" "web_ingress_from_alb" {
  type                     = "ingress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb_sg.id
  security_group_id        = aws_security_group.web_sg.id
}

resource "aws_security_group_rule" "web_egress_to_data" {
  type                     = "egress"
  from_port                = 8000
  to_port                  = 8000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.data_sg.id
  security_group_id        = aws_security_group.web_sg.id
}

resource "aws_security_group_rule" "web_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.web_sg.id
}

# --- Data EC2 Rules ---
resource "aws_security_group_rule" "data_ingress_from_web" {
  type                     = "ingress"
  from_port                = 8000
  to_port                  = 8000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.data_sg.id
}

resource "aws_security_group_rule" "data_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.data_sg.id
}

resource "aws_security_group_rule" "data_egress_to_web" {
  type                     = "egress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id # 목적지: Web SG
  security_group_id        = aws_security_group.data_sg.id # 출발지: Data SG
}