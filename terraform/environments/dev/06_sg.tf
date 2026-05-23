#######################
### Security Groups ###
#######################

# ALB 
resource "aws_security_group" "alb_sg" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Security group for FocusTracker ALB"
  vpc_id      = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-sg"
  }
}

# Web EC2 
resource "aws_security_group" "web_sg" {
  name        = "${var.project_name}-${var.environment}-web-sg"
  description = "Security group for Web Interface EC2"
  vpc_id      = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-web-sg"
  }
}

# Data EC2 
resource "aws_security_group" "db_sg" {
  name        = "${var.project_name}-${var.environment}-db-sg"
  description = "Security group for Data Processing EC2"
  vpc_id      = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-db-sg"
  }
}

# ML EC2
resource "aws_security_group" "ml_sg" {
  name        = "${var.project_name}-${var.environment}-ml-sg"
  description = "Security group for ML Inference EC2"
  vpc_id      = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-ml-sg"
  }
}

########################
### SG Rules (Rules) ###
########################

# 1. ALB Rules
resource "aws_security_group_rule" "alb_ingress_http" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb_sg.id
  description       = "Allow HTTP from internet for ALB"
}

resource "aws_security_group_rule" "alb_ingress_https" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb_sg.id
  description       = "Allow HTTPS from internet for ALB"
}

resource "aws_security_group_rule" "alb_egress_to_web" {
  type                     = "egress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.alb_sg.id
  description              = "Allow ALB to forward traffic to web EC2 on port 3000"
}

# 2. Web EC2 Rules
resource "aws_security_group_rule" "web_ingress_from_alb" {
  type                     = "ingress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb_sg.id
  security_group_id        = aws_security_group.web_sg.id
  description              = "Allow inbound traffic from ALB on port 3000"
}

resource "aws_security_group_rule" "web_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.web_sg.id
  description       = "Allow all outbound traffic from web EC2 (NAT/internet access)"
}

# 3. Data EC2 Rules
resource "aws_security_group_rule" "data_ingress_from_web" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.db_sg.id
  description              = "Allow PostgreSQL access from web EC2"
}

# 4. ML EC2 Rules
resource "aws_security_group_rule" "ml_ingress_from_web" {
  type                     = "ingress"
  from_port                = 8000
  to_port                  = 8000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.ml_sg.id
  description              = "Allow inbound from web EC2 to ML service on port 8000"
}

resource "aws_security_group_rule" "redis_ingress_from_web" {
  type                     = "ingress"
  security_group_id        = aws_security_group.ml_sg.id
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  description              = "Allow inbound from web EC2 to Redis on port 6379"
}

resource "aws_security_group_rule" "ml_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ml_sg.id
  description       = "Allow all outbound traffic from ML EC2 (ECR/Bedrock/NAT)"
}