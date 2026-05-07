##############################################
#### 1. ALB (Application Load Balancer) ####
##############################################

# 사용자 트래픽을 받아서 뒤의 컨테이너(Task)로 분배하는 로드밸런서
# 인터넷 → ALB → Target Group → Task 순으로 요청이 흘러감
resource "aws_lb" "app" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false                # false = 인터넷에서 접근 가능
  load_balancer_type = "application"        # L7 (HTTP/HTTPS 처리)

  # ALB에 붙일 보안그룹 (06_sg.tf의 alb_sg: 80/443 인바운드 허용)
  security_groups    = [aws_security_group.alb_sg.id]

  # ALB는 반드시 2개 이상 AZ의 퍼블릭 서브넷에 배치
  subnets = [
    aws_subnet.public_a.id,
    aws_subnet.public_c.id
  ]

  tags = {
    Name        = "${var.project_name}-${var.environment}-alb"
    Environment = var.environment
  }
}

##############################################
#### 2. ALB 리스너 (Listener)              ####
##############################################

# ALB의 "귀" - 어떤 포트로 들어오는 요청을 받을지 정의
# 443번으로 들어오면 → 기본적으로 Blue 타겟그룹으로 전달
#
# 배포 중에는 CodeDeploy가 이 리스너의 target_group을
# Blue → Green 으로 자동 전환하고,
# 배포 완료 후엔 Green이 계속 Blue 역할을 하게 됨

resource "aws_lb_listener" "prod_https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = aws_acm_certificate.main.arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn
  }
  lifecycle {
    ignore_changes = [default_action]
  }
}