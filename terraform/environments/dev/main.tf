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

# ==========================================
# 1. 보안 그룹 본체 정의 (껍데기)
# ==========================================

# ALB 보안 그룹
resource "aws_security_group" "alb_sg" {
  name        = "ft-alb-sg"
  description = "Security group for FocusTracker ALB"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "ft-alb-sg" }
}

# Web EC2 보안 그룹 (Interface/Signaling)
resource "aws_security_group" "web_sg" {
  name        = "ft-web-sg"
  description = "Security group for Web Interface EC2"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "ft-web-sg" }
}

# Data EC2 보안 그룹 (Processing/Storage)
resource "aws_security_group" "data_sg" {
  name        = "ft-data-sg"
  description = "Security group for Data Processing EC2"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "ft-data-sg" }
}

# ==========================================
# 2. ALB 보안 그룹 규칙 (HTTPS 중심)
# ==========================================

# [Inbound] 외부 인터넷 -> ALB (HTTP/HTTPS)
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

# [Outbound] ALB -> Web EC2 (오직 3000번 포트로만!)
resource "aws_security_group_rule" "alb_egress_to_web" {
  type                     = "egress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.alb_sg.id
}

# ==========================================
# 3. Web EC2 보안 그룹 규칙
# ==========================================

# [Inbound] ALB -> Web EC2 (3000번 수신)
resource "aws_security_group_rule" "web_ingress_from_alb" {
  type                     = "ingress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb_sg.id
  security_group_id        = aws_security_group.web_sg.id
}

# [Outbound] Web EC2 -> Data EC2 (8000번 송신)
resource "aws_security_group_rule" "web_egress_to_data" {
  type                     = "egress"
  from_port                = 8000
  to_port                  = 8000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.data_sg.id
  security_group_id        = aws_security_group.web_sg.id
}

# [Outbound] 외부 인터넷 (업데이트/라이브러리 설치용)
resource "aws_security_group_rule" "web_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.web_sg.id
}

# ==========================================
# 4. Data EC2 보안 그룹 규칙 (8000번 국룰)
# ==========================================

# [Inbound] Web EC2 -> Data EC2 (8000번 수신)
resource "aws_security_group_rule" "data_ingress_from_web" {
  type                     = "ingress"
  from_port                = 8000
  to_port                  = 8000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.data_sg.id
}

# [Outbound] 외부 인터넷 (패키지 설치 및 DB 연결용)
resource "aws_security_group_rule" "data_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.data_sg.id
}