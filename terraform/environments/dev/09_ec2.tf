##############################
## Ubuntu 22.04 ARM AMI 조회 ##
##############################
data "aws_ami" "ubuntu_2204_arm" {
  most_recent = true
  owners      = ["099720109477"] # 공식 Ubuntu AMI ID

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
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

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
#########################
### SSM 접속용 IAM Role ###
#########################
resource "aws_iam_role" "ec2_ssm_role" {
  name = "ec2-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ec2_ssm_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_ssm_profile" {
  name = "ec2-ssm-profile"
  role = aws_iam_role.ec2_ssm_role.name
}

###############
### EC2 생성 ###
###############
resource "aws_instance" "app_ec2" {
  ami                    = data.aws_ami.ubuntu_2204_arm.id
  instance_type          = "t4g.medium"
  subnet_id              = aws_subnet.private_app_a.id
  vpc_security_group_ids = [
    aws_security_group.web_sg.id
  ]

  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  iam_instance_profile = aws_iam_instance_profile.ec2_ssm_profile.name

  associate_public_ip_address = false

  tags = {
    Name        = "app-ec2"
    Environment = var.environment
  }
}

resource "aws_instance" "free_tier" {
  ami                    = data.aws_ami.ubuntu_2204_x86.id
  instance_type          = "t3.micro"

  subnet_id              = aws_subnet.private_db_a.id
  vpc_security_group_ids = [
    aws_security_group.db_sg.id
  ]

  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  iam_instance_profile = aws_iam_instance_profile.ec2_ssm_profile.name


  associate_public_ip_address = false

  tags = {
    Name        = "db-ec2"
    Environment = var.environment
  }
}