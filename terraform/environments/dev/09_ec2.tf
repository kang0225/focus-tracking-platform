##############################
## Ubuntu 22.04 AMI 조회      ##
##############################
data "aws_ami" "ubuntu_2204_arm" {
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

###############
### EC2 생성 ###
###############

# 1. 앱 서버 (Web EC2)
resource "aws_instance" "app_ec2" {
  ami                    = data.aws_ami.ubuntu_2204_arm.id
  instance_type          = "t4g.medium"
  subnet_id              = aws_subnet.private_app_a.id
  vpc_security_group_ids = [aws_security_group.web_sg.id]

  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  # 웹용 프로파일 연결
  iam_instance_profile = aws_iam_instance_profile.web_ec2_profile.name
  associate_public_ip_address = false

  tags = {
    Name        = "app-ec2"
    Environment = var.environment
  }
}

# 2. DB 서버 (DB EC2)
resource "aws_instance" "free_tier" {
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