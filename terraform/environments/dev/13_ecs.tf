##########################
#### 1. ECS 클러스터 ####
##########################

# EC2들과 컨테이너를 묶어서 관리하는 논리적 그룹
# 09_ec2.tf의 "app-ec2"가 user_data를 통해 이 클러스터에 자동 등록됨
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}-cluster"

  # 컨테이너 메트릭/로그 수집 활성화 (모니터링용)
  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-cluster"
  }
}

#################################
#### 2. CloudWatch 로그 그룹 ####
#################################

# 컨테이너가 stdout/stderr로 찍는 로그를 모아둘 공간
# Task Definition에서 이 log group을 지정하면 자동으로 로그가 모임
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project_name}-${var.environment}"
  retention_in_days = 14   # 14일 후 자동 삭제 (비용 절약)

  tags = {
    Name = "${var.project_name}-${var.environment}-log-group"
  }
}

##############################
#### 3. Task Definition   ####
##############################

# "컨테이너를 어떻게 띄울지" 적어둔 설계도
# 실제로 도는 게 아니라 "이런 식으로 만들어라"는 틀
resource "aws_ecs_task_definition" "app" {
  family = "${var.project_name}-${var.environment}-task"

  # ★ awsvpc: 각 task에 독립된 ENI(네트워크 인터페이스)가 할당됨
  #   → 각 컨테이너가 고유 IP를 가짐 → 포트 충돌 없이 Blue/Green 가능
  network_mode = "awsvpc"

  # EC2 launch type용 task
  requires_compatibilities = ["EC2"]

  # 컨테이너에 할당할 자원
  cpu    = "512"    # 0.5 vCPU
  memory = "1024"   # 1 GB

  # 컨테이너 실행 역할: ECR에서 이미지 pull + CloudWatch 로그 전송에 사용
  execution_role_arn = aws_iam_role.ecs_task_execution_role.arn

  # 컨테이너 안 앱이 AWS 서비스(S3, DynamoDB 등) 호출할 때 쓸 역할
  task_role_arn = aws_iam_role.ecs_task_role.arn

  # ★ 컨테이너 정의 (FE+BE 한 컨테이너에 통합 - 초기 버전)
  container_definitions = jsonencode([
    {
      name      = "app"
      image     = "${aws_ecr_repository.app.repository_url}:latest"
      essential = true    # 이 컨테이너가 죽으면 task 전체 재시작

      # 포트 매핑: awsvpc 모드에서는 containerPort 만 지정 (hostPort 불필요)
      # 각 task가 고유 IP를 가지므로 호스트 포트 개념이 없음
      portMappings = [
        {
          containerPort = var.app_port    # 3000 (컨테이너 내부에서 앱이 쓰는 포트)
          protocol      = "tcp"
        }
      ]

      # 환경변수 (앱이 읽어서 동작 모드 결정)
      environment = [
        { name = "NODE_ENV", value = var.environment },
        { name = "PORT",     value = tostring(var.app_port) }
      ]

      # 로그를 CloudWatch로 전송하는 설정
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "app"
        }
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-${var.environment}-task"
  }
}

##########################
#### 4. ECS Service   ####
##########################

# 태스크를 몇 개 유지할지 관리하는 "매니저"
# 컨테이너가 죽으면 자동 재시작, ALB와 연결, 배포 담당
resource "aws_ecs_service" "app" {
  name            = "${var.project_name}-${var.environment}-svc"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn

  desired_count   = 1          # 평상시 1개 유지 (t4g.medium + awsvpc ENI 제약)
  launch_type     = "EC2"      # EC2 위에서 돌림 (Fargate 아님)

  # ★ Blue/Green 배포 하려면 반드시 CODE_DEPLOY로 설정
  deployment_controller {
    type = "CODE_DEPLOY"
  }

  # ★ awsvpc 모드 필수 설정: task에 ENI 붙일 네트워크 설정
  network_configuration {
    # task ENI가 생길 서브넷 (프라이빗 앱 서브넷)
    subnets = [
      aws_subnet.private_app_a.id,
      aws_subnet.private_app_c.id
    ]
    # task ENI에 붙일 SG (web_sg 재사용 - 이미 ALB→3000 ingress 있음)
    security_groups  = [aws_security_group.web_sg.id]
    # 프라이빗 서브넷이라 퍼블릭 IP 불필요
    assign_public_ip = false
  }

  # 초기 상태: Blue 타겟그룹에 task 등록
  # (배포 중에는 CodeDeploy가 Green 타겟그룹으로 교체)
  load_balancer {
    target_group_arn = aws_lb_target_group.blue.arn
    container_name   = "app"
    container_port   = var.app_port
  }

  # ★ CodeDeploy가 배포 중에 task_definition과 load_balancer를 바꿈
  # Terraform이 되돌리지 않도록 변경 무시 설정
  lifecycle {
    ignore_changes = [task_definition, load_balancer, desired_count]
  }

  # ALB 리스너 먼저 생성돼야 서비스 등록 가능
  depends_on = [aws_lb_listener.prod]

  tags = {
    Name = "${var.project_name}-${var.environment}-svc"
  }
}