##############################################
#### 1. ALB                                ####
##############################################
resource "aws_lb" "app" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]

  subnets = [
    module.network.public_subnet_a_id,
    module.network.public_subnet_c_id,
  ]

  # ★ 추가: Access Logs를 S3에 직접 저장 (패턴 A)
  access_logs {
    bucket  = aws_s3_bucket.logs.bucket
    prefix  = "alb"
    enabled = true
  }

  # S3 버킷 정책이 먼저 만들어져야 ALB 생성 가능
  depends_on = [aws_s3_bucket_policy.alb_logs]

  tags = {
    Name        = "${var.project_name}-${var.environment}-alb"
    Environment = var.environment
  }
}

##############################################
#### 2. HTTP(80) → HTTPS(443) 리다이렉트  ####
##############################################
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

##############################################
#### 3. HTTPS(443) 리스너                 ####
##############################################
resource "aws_lb_listener" "prod_https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  # 핵심: validation 끝난 cert ARN 참조 (그래야 cert 검증 → listener 순서가 보장됨)
  certificate_arn = aws_acm_certificate_validation.main.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn
  }

  # CodeDeploy가 배포 중에 default_action을 Blue↔Green으로 바꾸므로 무시
  lifecycle {
    ignore_changes = [default_action]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-listener-https"
  }
}