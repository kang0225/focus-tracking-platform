##############################################################
#### ECS Service Auto Scaling
####
#### Task(컨테이너) 개수를 부하에 따라 자동으로 조정
####   - 평상시: Task 1개 (desired_count 기본값)
####   - CPU 평균 55% 초과 → Task 2개로 늘림
####   - CPU 평균 낮게 유지되면 → Task 1개로 줄임
####
#### EC2 개수는 별도 (24_capacity_provider.tf의 ASG가 관리)
#### 둘은 연계 동작:
####   - 이 파일이 Task 개수 늘림 → ECS가 자리 찾음
####   - 자리 없으면 → Capacity Provider가 EC2 추가
##############################################################


##############################################################
#### 1. Scalable Target (확장 대상 등록)
##############################################################

# "이 ECS Service의 DesiredCount를 Auto Scaling 대상으로 등록한다"
resource "aws_appautoscaling_target" "ecs_service" {
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"

  # 어떤 Service를 스케일할지 지정 (cluster/service-name 형식)
  resource_id = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"

  # Task 개수 범위
  min_capacity = 1 # 최소 1개 (절대 0 안 됨)
  max_capacity = 2 # 최대 2개 (1 EC2당 ENI 2개 한계 = 1 EC2에 2 Task)

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-asg-target"
  }
}


##############################################################
#### 2. CPU 기반 Target Tracking 정책
##############################################################

# "CPU 평균 사용률을 55% 근처로 유지하라" 라는 자동 조정 정책
# - 평균이 55% 위로 가면 → Task 늘림
# - 평균이 55% 아래로 한참 가면 → Task 줄임
resource "aws_appautoscaling_policy" "ecs_cpu" {
  name        = "${var.project_name}-${var.environment}-cpu-target-tracking"
  policy_type = "TargetTrackingScaling"

  # 위에서 등록한 Scalable Target을 참조 (반복 입력 방지)
  resource_id        = aws_appautoscaling_target.ecs_service.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service.service_namespace

  target_tracking_scaling_policy_configuration {
    # AWS가 미리 정의한 ECS CPU 메트릭 사용
    # = ECS Service의 평균 CPU 사용률 (Task 예약 CPU 대비)
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    # ★ 목표값 55%
    # - 55% 넘으면 Task 추가 트리거
    # - t4g standard 크레딧 모드 → baseline(40%) 근처 유지 위해 보수적으로 설정
    # - Auto Scaling 지연(약 2~3분) 동안 응답 품질 유지 가능
    target_value = 75.0

    # 쿨다운 (한 번 스케일하면 이 시간 동안 다음 스케일 안 함)
    # scale_out_cooldown: 늘릴 때 60초 → 빠르게 대응
    # scale_in_cooldown: 줄일 때 300초 → 너무 빨리 줄여서 다시 늘릴 일 없게
    scale_out_cooldown = 300
    scale_in_cooldown  = 300

    # false = 자동으로 줄이기도 함 (부하 낮아지면 Task 1개로 복귀)
    disable_scale_in = false
  }
}