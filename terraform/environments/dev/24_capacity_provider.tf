##############################################################
#### Capacity Provider 기반 EC2 인프라
####
#### 이 파일은 기존 단일 aws_instance "app_ec2"를 대체합니다.
####
#### 구성:
####   1. Launch Template — EC2 설계도 (어떤 사양으로 띄울지)
####   2. Auto Scaling Group — EC2 묶음 관리 (min=1, max=2)
####   3. ECS Capacity Provider — ECS와 ASG를 잇는 다리
####   4. Cluster Capacity Providers — 클러스터에 Provider 등록
####
#### 동작 시나리오:
####   - 평상시: EC2 1대 유지 (Task 1개 동작, 자원 절반 사용)
####   - 부하 급증: ECS Service Auto Scaling이 Task를 2개로 늘림
####                → 같은 EC2에 들어감 (메모리/CPU 자리 있음)
####   - 배포 시 Task 1개 상태: Blue + Green 같은 EC2 공존 가능 → 새 EC2 없음
####   - 배포 시 Task 2개 상태: 자리 없음 → Capacity Provider가 EC2-2 추가
####   - 배포/부하 종료 후: 추가 EC2 자동 회수
####
####  AZ 분산: 서브넷 2개(AZ-a, AZ-c) 등록 → 인스턴스 추가 시 자동 분산
####           한 AZ 장애 시 다른 AZ로 자동 복구
##############################################################


##############################################################
#### 1. Launch Template (EC2 설계도)
##############################################################

# ASG가 EC2를 띄울 때마다 이 설계도를 보고 똑같이 찍어냄
# 기존 aws_instance "app_ec2"의 설정을 거의 그대로 옮긴 것
resource "aws_launch_template" "app" {
  name_prefix   = "${var.project_name}-${var.environment}-app-lt-"
  image_id      = data.aws_ssm_parameter.ecs_ami_arm.value
  instance_type = "t4g.medium"

  # IAM 인스턴스 프로파일 (web_ec2_profile 재사용 — SSM + ECS 권한 포함)
  iam_instance_profile {
    name = aws_iam_instance_profile.web_ec2_profile.name
  }

  # 네트워크: SG는 web_sg 재사용 (ALB → 3000 ingress 이미 설정됨)
  vpc_security_group_ids = [aws_security_group.web_sg.id]

  # 루트 볼륨 (기존 aws_instance와 동일 사양)
  # device_name은 Amazon Linux 2023 ARM 기준 /dev/xvda
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      delete_on_termination = true
      encrypted             = true
    }
  }

  # IMDSv2 강제 (보안 베스트프랙티스)
  # hop_limit=1: ECS awsvpc Task는 별도 ENI를 가지므로 호스트 IMDS 접근 불필요
  # (참고: ml_ec2처럼 Docker 직접 실행 시에만 hop_limit=2 필요)
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  # t4g 버스터블 인스턴스 standard 모드
  # 평소 baseline(40%) 이하로 사용해야 크레딧 적립됨
  # 초과 사용 시 크레딧 소모, 고갈 시 baseline까지 throttle 발생
  # → CPUCreditBalance 알람으로 모니터링 (22_alarm.tf)
  credit_specification {
    cpu_credits = "standard"
  }

  # EC2 부팅 스크립트
  # /etc/ecs/ecs.config에 클러스터 이름 써주면 ECS 에이전트가 자동 등록함
  # base64encode 필수 (aws_instance.user_data와 달리 Launch Template은 인코딩 필요)
  user_data = base64encode(<<-EOT
    #!/bin/bash
    echo "ECS_CLUSTER=${aws_ecs_cluster.main.name}" >> /etc/ecs/ecs.config
  EOT
  )

  # ASG가 띄우는 신규 인스턴스에 자동 부착될 태그
  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "${var.project_name}-${var.environment}-app-ec2"
      Environment = var.environment
    }
  }

  tag_specifications {
    resource_type = "volume"
    tags = {
      Name        = "${var.project_name}-${var.environment}-app-ec2-volume"
      Environment = var.environment
    }
  }

  # Launch Template 자체의 태그
  tags = {
    Name = "${var.project_name}-${var.environment}-app-lt"
  }
}


##############################################################
#### 2. Auto Scaling Group (EC2 묶음 관리자)
##############################################################

# 위 Launch Template 설계도로 EC2를 1~2대 사이에서 자동 유지
# 평소 1대 유지, 부하/배포 시 Capacity Provider가 desired를 올려 최대 2대까지 확장
resource "aws_autoscaling_group" "app" {
  name = "${var.project_name}-${var.environment}-app-asg"

  # 인스턴스 개수 정책
  min_size         = 1   # 절대 0으로 안 내려감 (항상 EC2 1대 유지)
  max_size         = 2   # ENI 제약 + 비용 상한
  desired_capacity = 1   # 평소 목표치 (Capacity Provider가 자동 조정)

  # AZ 분산: 두 서브넷 등록 → ASG가 자동으로 분산 배치
  # desired=1일 땐 둘 중 한 곳에만 띄움, desired=2일 땐 양쪽에 1대씩 분산
  vpc_zone_identifier = [
    aws_subnet.private_app_a.id,
    aws_subnet.private_app_c.id,
  ]

  # Launch Template 연결
  # $Latest: Launch Template이 업데이트되면 자동으로 최신 버전 사용
  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  # ★ Capacity Provider의 managed_termination_protection = ENABLED 사용 시 필수
  # ASG가 scale-in 결정해도 Task가 실행 중인 인스턴스는 종료되지 않도록 보호
  protect_from_scale_in = true

  # 헬스체크: EC2 자체 상태만 확인 (Task 상태는 ECS Service가 관리)
  health_check_type         = "EC2"
  health_check_grace_period = 300   # EC2 부팅 후 5분간 헬스체크 유예 (ECS 등록 시간 확보)

  # Capacity Provider가 desired_capacity를 자동 조정하므로
  # Terraform이 되돌리지 않도록 무시
  lifecycle {
    ignore_changes = [desired_capacity]
  }

  # ASG 자체 태그 (Launch Template 태그와 별개)
  # propagate_at_launch = false → ASG에만 부착, 인스턴스에는 안 붙음
  tag {
    key                 = "Name"
    value               = "${var.project_name}-${var.environment}-app-asg"
    propagate_at_launch = false
  }

  # ★ Capacity Provider가 ASG를 인식하기 위한 필수 태그
  # propagate_at_launch = true → ASG와 신규 인스턴스 둘 다에 부착됨
  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }
}


##############################################################
#### 3. ECS Capacity Provider (ECS ↔ ASG 다리)
##############################################################

# ECS가 ASG에게 "EC2 더 필요해" 라고 신호를 보내는 채널
#
# 동작 방식:
#   1. ECS Scheduler가 Task를 배치하려고 시도
#   2. 현재 EC2들에 자원(CPU/메모리/ENI) 자리가 없으면 PENDING 상태로 둠
#   3. Capacity Provider가 PENDING Task 감지
#      → CapacityProviderReservation 메트릭 100% 초과
#      → ASG의 desired_capacity 증가 요청
#   4. ASG가 새 EC2 부팅 → ECS Container Instance로 등록
#   5. ECS Scheduler가 PENDING Task를 새 EC2에 배치
resource "aws_ecs_capacity_provider" "app" {
  name = "${var.project_name}-${var.environment}-cp"

  auto_scaling_group_provider {
    auto_scaling_group_arn = aws_autoscaling_group.app.arn

    # ★ Task가 돌고 있는 EC2를 ASG가 임의로 종료하지 못하도록 보호
    # ASG의 protect_from_scale_in = true 와 함께 동작
    managed_termination_protection = "ENABLED"

    # 자동 스케일링 동작 설정
    managed_scaling {
      status = "ENABLED"

      # ★ 100 = "EC2 자리를 꽉 채워서 쓰고, 진짜 자리 없을 때만 새 EC2 추가"
      # 80~90으로 낮추면 미리 여유분 확보됨 (그만큼 평상시 EC2 추가 가능성↑ → 비용↑)
      target_capacity = 100

      # 한 번의 스케일 이벤트로 추가/제거 가능한 EC2 개수
      # 우리는 max=2 인 작은 ASG라 1로 충분
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = 1

      # 새 EC2가 ECS에 등록될 때까지 기다리는 시간 (초)
      # 너무 짧으면 등록 전에 또 늘리려 하고, 너무 길면 PENDING Task 대기↑
      instance_warmup_period = 300
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-cp"
  }
}


##############################################################
#### 4. Cluster ↔ Capacity Provider 등록
##############################################################

# 클러스터에 "이 Capacity Provider를 쓰겠다" 라고 선언
# default_capacity_provider_strategy: 클러스터의 기본 배치 전략
#   → 새 Service가 별도 strategy 지정 없이 만들어져도 이 값으로 동작
resource "aws_ecs_cluster_capacity_providers" "app" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = [aws_ecs_capacity_provider.app.name]

  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.app.name
    weight            = 100   # 100% 이 Provider로 배치
    base              = 1     # 최소 1개 Task는 무조건 이 Provider에
  }
}
