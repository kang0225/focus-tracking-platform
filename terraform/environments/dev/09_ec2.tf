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

##########################################
## ECS-optimized AMI (Amazon Linux 2023) ##
##########################################
# ECS 에이전트가 미리 설치된 공식 이미지를 AWS SSM Parameter Store에서 조회
# 이 파라미터는 AWS가 최신 이미지로 계속 업데이트해주기 때문에
# 우리가 AMI ID를 매번 바꿀 필요가 없음
data "aws_ssm_parameter" "ecs_ami_arm" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
}

###############
### EC2 생성 ###
###############



# ====================================================
# 1. 앱 서버 (Web EC2) — ASG 기반으로 이관됨
# ====================================================
# 기존 단일 EC2 → Launch Template + Auto Scaling Group
# 새 위치: 24_capacity_provider.tf
# 이관 이유: ECS Capacity Provider를 통한 자동 EC2 확장/축소 지원
# ====================================================



# 2. DB 서버 (DB EC2)
resource "aws_instance" "db_ec2" {
  ami                    = data.aws_ami.ubuntu_2204_x86.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.private_db_a.id
  vpc_security_group_ids = [aws_security_group.db_sg.id]

  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  # DB 전용 프로파일 연결
  iam_instance_profile = aws_iam_instance_profile.db_ec2_profile.name
  associate_public_ip_address = false

  tags = {
    Name        = "db-ec2"
    Environment = var.environment
  }
}

# 3. ML 서버 (ML EC2)
resource "aws_instance" "ml_ec2" {
  ami                    = data.aws_ami.ubuntu_2204_arm64.id
  instance_type          = "t4g.small"
  subnet_id              = aws_subnet.private_app_a.id
  vpc_security_group_ids = [aws_security_group.ml_sg.id]

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  # ★ Docker 컨테이너 안에서 IMDSv2로 IAM 자격증명 가져오려면 hop limit 2 필요
  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2
  }
  
  # ML 전용 프로파일 연결
  iam_instance_profile = aws_iam_instance_profile.ml_ec2_profile.name
  associate_public_ip_address = false

  tags = {
    Name = "ml-ec2"
  }
}