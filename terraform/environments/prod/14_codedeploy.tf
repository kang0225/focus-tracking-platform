##############################################
#### 1. CodeDeploy 애플리케이션             ####
##############################################

# "이 프로젝트의 배포는 여기서 관리한다" 라는 상위 개념
resource "aws_codedeploy_app" "ecs" {
  name             = "${var.project_name}-${var.environment}-cdapp"
  compute_platform = "ECS"

  tags = {
    Name = "${var.project_name}-${var.environment}-cdapp"
  }
}

##############################################
#### 2. Deployment Group (블루-그린 규칙) ####
##############################################

resource "aws_codedeploy_deployment_group" "ecs" {
  app_name              = aws_codedeploy_app.ecs.name
  deployment_group_name = "${var.project_name}-${var.environment}-dg"

  # ★ 핵심 수정: codedeploy → codedeploy_role (11_iam.tf에 있는 실제 이름)
  service_role_arn = aws_iam_role.codedeploy_role.arn

  deployment_config_name = "CodeDeployDefault.ECSAllAtOnce"

  deployment_style {
    deployment_option = "WITH_TRAFFIC_CONTROL"
    deployment_type   = "BLUE_GREEN"
  }

  blue_green_deployment_config {
    deployment_ready_option {
      action_on_timeout = "CONTINUE_DEPLOYMENT"
    }
    terminate_blue_instances_on_deployment_success {
      action                           = "TERMINATE"
      termination_wait_time_in_minutes = 5
    }
  }

  auto_rollback_configuration {
    enabled = true
    events  = ["DEPLOYMENT_FAILURE"]
  }

  ecs_service {
    cluster_name = aws_ecs_cluster.main.name
    service_name = aws_ecs_service.app.name
  }

  load_balancer_info {
    target_group_pair_info {
      prod_traffic_route {
        listener_arns = [aws_lb_listener.prod.arn]
      }
      target_group { name = aws_lb_target_group.blue.name }
      target_group { name = aws_lb_target_group.green.name }
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-dg"
  }
}