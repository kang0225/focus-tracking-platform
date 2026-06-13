##############################################################
#### 야간 비용 절감 스케줄러 (dev 전용)
####
#### 목적: 낮에만 개발하므로 밤에는 컴퓨팅을 0으로 내려 비용 절감
####   - Fargate(ECS Service): Application Auto Scaling "Scheduled Action"
####       밤 → min/max 0 (task 0개) / 아침 → min 1 / max 2 복구
####   - ML EC2: EventBridge Scheduler로 stop/start
####       (컨테이너는 docker-compose의 restart: unless-stopped 로
####        EC2 부팅 시 자동 복구되므로 stop/start만으로 충분)
####
#### 시각은 아래 local에서 한 곳으로 관리 (KST 기준)
##############################################################

locals {
  # ── 스케줄 시각 (Asia/Seoul 로컬 시간) ──────────────────
  # 밤 22:00 끄고, 아침 09:00 켬. 매일 실행.
  # 평일만 끄고 싶으면 day-of-week 자리를 MON-FRI 로 변경
  #   예) 켜기: cron(0 9 ? * MON-FRI *)
  schedule_timezone = "Asia/Seoul"

  # cron(분 시 일 월 요일 연) — AWS cron 포맷
  cron_stop  = "cron(0 22 * * ? *)" # 매일 22:00 KST → 끔
  cron_start = "cron(0 9 * * ? *)"  # 매일 09:00 KST → 켬
}


##############################################################
#### 1. Fargate (ECS Service) — Scheduled Scaling
####    autoscaling.tf 의 scalable target 에 시간 기반 액션 추가
##############################################################

# 밤: task 0개로 (min/max 모두 0이어야 desired 가 0까지 내려감)
resource "aws_appautoscaling_scheduled_action" "ecs_scale_down_night" {
  name = "${var.project_name}-${var.environment}-ecs-down-night"

  # autoscaling.tf 의 scalable target 을 그대로 가리킴 (대상 = ECS Service DesiredCount)
  service_namespace  = aws_appautoscaling_target.ecs_service.service_namespace # ecs를 관리하는 Auto Scaling
  resource_id        = aws_appautoscaling_target.ecs_service.resource_id       # "service/cluster-name/service-name"
  scalable_dimension = aws_appautoscaling_target.ecs_service.scalable_dimension
  # 우리는 "ecs:service:DesiredCount" 하나만 등록했으므로 그대로 참조 (반복 입력 방지)

  schedule = local.cron_stop         # 언제 실행할지 (밤 22:00 KST)
  timezone = local.schedule_timezone # cron 을 KST 로 해석 (UTC 환산 불필요)

  scalable_target_action {
    min_capacity = 0 # 하한 0 → task 가 0까지 내려갈 수 있게
    max_capacity = 0 # 상한도 0 → 강제로 0개 (= 컴퓨팅 비용 0)
  }
}

# 아침: 평상시 범위(min 1 / max 2)로 복구
resource "aws_appautoscaling_scheduled_action" "ecs_scale_up_morning" {
  name = "${var.project_name}-${var.environment}-ecs-up-morning"

  service_namespace  = aws_appautoscaling_target.ecs_service.service_namespace
  resource_id        = aws_appautoscaling_target.ecs_service.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service.scalable_dimension

  schedule = local.cron_start # 아침 09:00 KST
  timezone = local.schedule_timezone

  scalable_target_action {
    min_capacity = 1 # 평상시 하한 1 (가용성 유지)
    max_capacity = 2 # 부하 시 2까지 자동 확장 허용 (원래 정책 복구)
  }
}


##############################################################
#### 2. ML EC2 — EventBridge Scheduler 로 stop/start
##############################################################

# 2-1. Scheduler 가 빌려 쓸 IAM Role (scheduler.amazonaws.com 신뢰)
data "aws_iam_policy_document" "scheduler_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ml_ec2_scheduler" {
  name               = "${var.project_name}-${var.environment}-ml-ec2-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume_role.json
}

# 해당 ML 인스턴스만 start/stop 할 수 있는 최소 권한
resource "aws_iam_role_policy" "ml_ec2_scheduler" {
  name = "${var.project_name}-${var.environment}-ml-ec2-scheduler-policy"
  role = aws_iam_role.ml_ec2_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowStartStopMlInstance"
        Effect = "Allow"
        Action = [
          "ec2:StartInstances", # 아침 기동용
          "ec2:StopInstances",  # 밤 정지용
        ]
        # Resource 를 이 ML 인스턴스 ARN 하나로 한정 → 다른 EC2 는 못 건드림 (최소 권한)
        Resource = "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.ml_ec2.id}"
      }
    ]
  })
}

# 2-2. 밤: ML EC2 정지 (universal target = EC2 StopInstances)
resource "aws_scheduler_schedule" "ml_ec2_stop_night" {
  name = "${var.project_name}-${var.environment}-ml-ec2-stop-night"

  # 정시 실행만 (지연 허용 안 함). 분산 실행이 필요하면 WINDOW 모드로 변경
  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = local.cron_stop         # 밤 22:00
  schedule_expression_timezone = local.schedule_timezone # KST

  target {
    # AWS SDK universal target: EC2 StopInstances API 를 직접 호출 (Lambda 불필요)
    arn      = "arn:aws:scheduler:::aws-sdk:ec2:stopInstances"
    role_arn = aws_iam_role.ml_ec2_scheduler.arn # 위에서 만든 최소 권한 role

    # API 에 넘길 파라미터 (어떤 인스턴스를 끌지)
    input = jsonencode({
      InstanceIds = [aws_instance.ml_ec2.id]
    })
  }
}

# 2-3. 아침: ML EC2 시작 (universal target = EC2 StartInstances)
#       컨테이너는 restart: unless-stopped 로 부팅 시 자동 기동
resource "aws_scheduler_schedule" "ml_ec2_start_morning" {
  name = "${var.project_name}-${var.environment}-ml-ec2-start-morning"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = local.cron_start # 아침 09:00
  schedule_expression_timezone = local.schedule_timezone

  target {
    # StartInstances API 호출 → 부팅 후 Docker 데몬이 컨테이너 자동 복구
    arn      = "arn:aws:scheduler:::aws-sdk:ec2:startInstances"
    role_arn = aws_iam_role.ml_ec2_scheduler.arn

    input = jsonencode({
      InstanceIds = [aws_instance.ml_ec2.id]
    })
  }
}
