##########################
#### 1. ECS 클러스터 ####
##########################

# 09_ec2.tf에서 "app-ec2"가 찾아와야 할 집(클러스터)입니다.
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}-cluster"

  # 졸업 프로젝트 모니터링을 위해 컨테이너 인사이트는 켜두는 게 좋습니다.
  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-cluster"
  }
}

# EC2 기반 ECS에서는 별도의 용량 공급자(Capacity Provider) 설정 없이 
# EC2 인스턴스 자체가 클러스터에 등록되는 것만으로도 시작할 수 있습니다.