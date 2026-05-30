############################
### Ubuntu 22.04 AMI 조회 ###
############################
data "aws_ami" "ubuntu_2204_x86" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

data "aws_ami" "ubuntu_2204_arm64" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

###############
### EC2 생성 ###
###############
# ====================================================
# 1. 앱 서버 — Fargate로 전환됨 (EC2/ASG 없음)
# ====================================================
# 과거: 단일 EC2 -> Launch Template + ASG (24_capacity_provider.tf, 삭제됨)
# 현재: ECS Fargate (13_ecs.tf service의 launch_type = "FARGATE")
#       blue/green 배포 중 Capacity Provider 미확장 이슈 해결 위해 전환
# 참고: ECS-optimized AMI(ecs_ami_arm) 데이터소스는 앱 EC2 제거로 더 이상 쓰이지 않아 삭제함
#       (ML EC2는 아래처럼 Ubuntu ARM AMI를 사용)
# ====================================================


# 2. ML 서버 (ML EC2)
resource "aws_instance" "ml_ec2" {
  ami                    = data.aws_ami.ubuntu_2204_arm64.id
  instance_type          = "t4g.small"
  subnet_id              = aws_subnet.private_app_a.id
  vpc_security_group_ids = [aws_security_group.ml_sg.id]
  ebs_optimized          = true

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  # Docker 컨테이너 안에서 IMDSv2로 IAM 자격증명 가져오려면 hop limit 2 필요
  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2
  }

  # ML 전용 프로파일 연결
  iam_instance_profile        = aws_iam_instance_profile.ml_ec2_profile.name
  associate_public_ip_address = false

  tags = {
    Name = "ml-ec2"
  }
}
