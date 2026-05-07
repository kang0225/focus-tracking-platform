#########################
#### Security Groups ####
#########################

# 1. ALB 
resource "aws_security_group" "alb_sg" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Security group for FocusTracker ALB"
  vpc_id      = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-sg"
  }
}

# 2. Web EC2 
resource "aws_security_group" "web_sg" {
  name        = "${var.project_name}-${var.environment}-web-sg"
  description = "Security group for Web Interface EC2"
  vpc_id      = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-web-sg"
  }
}

# 3. Data EC2 
resource "aws_security_group" "db_sg" {
  name        = "${var.project_name}-${var.environment}-db-sg"
  description = "Security group for Data Processing EC2"
  vpc_id      = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-db-sg"
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

# ALB → EC2 (다이나믹 포트)
# 컨테이너가 어느 포트에 뜰지 미리 모르니까 범위로 열어둠
# 32768 ~ 65535는 ECS가 자동으로 배정하는 포트 범위
resource "aws_security_group_rule" "alb_egress_to_web" {
  type                     = "egress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id
  security_group_id        = aws_security_group.alb_sg.id
}

# EC2 ← ALB (다이나믹 포트)
# ALB가 컨테이너의 동적 포트로 접근할 수 있게 허용
# "ALB에서 오는 것만" 허용이라 외부에서 직접 못 들어옴 (안전)
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
  source_security_group_id = aws_security_group.db_sg.id
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
  security_group_id        = aws_security_group.db_sg.id
}

resource "aws_security_group_rule" "data_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.db_sg.id
}

resource "aws_security_group_rule" "data_egress_to_web" {
  type                     = "egress"
  from_port                = 8000
  to_port                  = 8000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.web_sg.id 
  security_group_id        = aws_security_group.db_sg.id 
}