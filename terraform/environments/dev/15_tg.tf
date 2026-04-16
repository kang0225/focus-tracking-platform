###################################################
#### 1. 블루 타겟 그룹 (Blue Target Group)      ####
###################################################

# 현재 실서비스 트래픽을 받고 있는 그룹입니다.
resource "aws_lb_target_group" "blue" {
  name        = "${var.project_name}-tg-blue"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main_vpc.id
  
  # ECS awsvpc 모드에서는 반드시 'ip' 타입을 사용해야 합니다.
  target_type = "ip"

  # 컨테이너가 살아있는지 확인하는 설정
  health_check {
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name        = "${var.project_name}-tg-blue"
    Environment = var.environment
  }
}

###################################################
#### 2. 그린 타겟 그룹 (Green Target Group)     ####
###################################################

# 새 버전의 코드가 배포되어 테스트를 기다리는 그룹입니다.
resource "aws_lb_target_group" "green" {
  name        = "${var.project_name}-tg-green"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main_vpc.id
  target_type = "ip"

  health_check {
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name        = "${var.project_name}-tg-green"
    Environment = var.environment
  }
}