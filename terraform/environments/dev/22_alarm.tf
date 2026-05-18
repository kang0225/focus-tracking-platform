##############################################
#### 1. SNS Topic (알림 전달 통로)         ####
##############################################
resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.environment}-alerts"

  tags = {
    Name = "${var.project_name}-${var.environment}-alerts"
  }
}

resource "aws_sns_topic_subscription" "email" {
  for_each = toset(var.alert_emails)

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

##############################################
#### 2. ALB 5xx 에러 알람                  ####
##############################################
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.project_name}-${var.environment}-alb-5xx-high"
  alarm_description   = "ALB가 백엔드에서 5xx를 너무 많이 받음"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10        # 1분 동안 5xx 10개 이상

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  treat_missing_data = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.app.arn_suffix
  }
}

##############################################
#### 3. ECS Task 개수 부족 알람            ####
##############################################
resource "aws_cloudwatch_metric_alarm" "ecs_task_count" {
  alarm_name          = "${var.project_name}-${var.environment}-ecs-tasks-low"
  alarm_description   = "ECS Service에 task가 desired보다 적음"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  treat_missing_data = "breaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }
}

##############################################
#### 4. ECS CPU 사용률 알람                ####
##############################################
resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-ecs-cpu-high"
  alarm_description   = "ECS Service CPU 사용률 80% 초과 (3분 연속)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 80

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }
}

##############################################
#### 5. ALB 응답 시간 지연 알람           ####
##############################################
resource "aws_cloudwatch_metric_alarm" "alb_latency" {
  alarm_name          = "${var.project_name}-${var.environment}-alb-latency-high"
  alarm_description   = "ALB 응답 시간 평균 2초 초과"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 2          # 2초

  alarm_actions = [aws_sns_topic.alerts.arn]
  treat_missing_data = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.app.arn_suffix
  }
}

##############################################
#### 6. EC2 CPU 크레딧 잔량 알람          ####
##############################################
# t4g는 버스터블 인스턴스 → baseline(40%) 이상 사용 시 크레딧 소모
# 크레딧 고갈되면 강제 throttle 발생 (baseline 성능으로 제한)
# unlimited 모드 안 쓰니까 standard 크레딧 모니터링 필수
#
# 알람 발생 시 대응 방안:
#   - 일시적 부하: Auto Scaling이 Task 분산하며 자연 해소되는지 관찰
#   - 지속 부하: Launch Template에서 cpu_credits = "unlimited"로 전환 검토
#   - 또는 인스턴스 타입 상향 (m6g.large 등 non-burstable)
resource "aws_cloudwatch_metric_alarm" "ec2_credit_balance_low" {
  alarm_name          = "${var.project_name}-${var.environment}-ec2-cpu-credit-low"
  alarm_description   = "ASG EC2의 CPU 크레딧 잔량 50개 미만 (곧 throttle 위험)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3      # 3번 연속 임계 미달 시 알람 (오탐 방지)
  metric_name         = "CPUCreditBalance"
  namespace           = "AWS/EC2"
  period              = 300    # 5분 간격 측정
  statistic           = "Average"
  threshold           = 50     # 크레딧 50개 미만 = 약 2시간 풀로드 가능 분량

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  treat_missing_data = "notBreaching"

  # ASG의 모든 EC2 인스턴스에 대해 자동으로 적용됨
  # (개별 EC2 ID 대신 ASG 이름으로 묶음 모니터링)
  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.app.name
  }
}