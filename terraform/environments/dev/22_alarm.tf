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
  threshold           = 10 # 1분 동안 5xx 10개 이상

  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
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

  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
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
  threshold           = 2 # 2초

  alarm_actions      = [aws_sns_topic.alerts.arn]
  treat_missing_data = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.app.arn_suffix
  }
}

##############################################
#### 6. (EC2 CPU 크레딧 알람) — 제거됨        ####
##############################################
# Fargate 전환으로 관리할 EC2/ASG가 없어져 이 알람은 삭제됨.
# (ASG·t4g 크레딧 개념이 사라짐)