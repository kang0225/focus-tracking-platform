##############################################################
#### ECS Service Auto Scaling (Fargate)
####
#### Task(컨테이너) 개수를 부하에 따라 자동으로 조정
####   - 평상시: Task 1개 (desired_count 기본값)
####   - CPU 평균 75% 초과 → Task 2개로 늘림
####   - CPU 평균 낮게 유지되면 → Task 1개로 줄임
####
#### ★ Fargate라 "EC2 자리"를 신경 쓸 필요가 없음
####   - Task 개수만 정하면, 각 Task는 AWS가 전용 micro-VM(1:1)으로 띄워줌
####   - EC2 호스트/ASG/Capacity Provider에 빈자리가 있는지 따질 필요 없음
####     (= EC2 launch type 시절의 "자리 없으면 EC2 추가" 흐름은 여기선 무관)
####   - 실질적 상한은 호스트 대수가 아니라
####     계정 Fargate vCPU 쿼터 + Task ENI가 붙는 서브넷의 가용 IP
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

  # Task 개수 범위 (= 동시에 뜨는 Fargate micro-VM 개수 범위와 같음)
  min_capacity = 1 # 최소 1개 유지 — 가용성용. 0도 기술적으론 가능하나(트래픽 0일 때 태스크가 사라져 다운) dev에서 비용 더 줄이고 싶을 때만 고려
  max_capacity = 2 # 최대 2개까지 확장 (Task 2개 = micro-VM 2개). Fargate라 EC2 자리 제약이 없어 필요하면 더 올려도 됨

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-asg-target"
  }
}


##############################################################
#### 2. CPU 기반 Target Tracking 정책
##############################################################

# "CPU 평균 사용률을 75% 근처로 유지하라" 라는 자동 조정 정책
# - 평균이 75% 위로 가면 → Task 늘림
# - 평균이 75% 아래로 한참 가면 → Task 줄임
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

    # ★ 목표값 75%
    # - 75% 넘으면 Task 추가 트리거
    # - Auto Scaling 반영까지 약 2~3분 지연 → 그 사이 여유(약 25%) 확보용
    # - Fargate는 EC2 t4g 같은 CPU 크레딧/baseline 개념이 없어(요청한 vCPU를
    #   그대로 받음) 보수적으로 낮출 이유가 없으므로 75%로 유지
    target_value = 75.0

    # 쿨다운 (한 번 스케일하면 이 시간 동안 같은 방향 스케일 안 함)
    # scale_out_cooldown: 늘릴 때 60초 → 부하 급증에 빠르게 대응
    # scale_in_cooldown : 줄일 때 300초 → 너무 빨리 줄였다 다시 늘리는 플래핑 방지
    scale_out_cooldown = 60
    scale_in_cooldown  = 300

    # false = 자동으로 줄이기도 함 (부하 낮아지면 Task 1개로 복귀)
    disable_scale_in = false
  }
}
