###############################
##    신뢰 관계 정의          ##
###############################

# EC2 서비스가 이 역할을 빌려 쓸 수 있게 허용
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# ECS Task 서비스가 이 역할을 빌려 쓸 수 있게 허용
data "aws_iam_policy_document" "ecs_tasks_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

###################################
##    Web EC2 role               ##
###################################
resource "aws_iam_role" "web_ec2_role" {
  name               = "${var.project_name}-${var.environment}-web-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

# 정책 연결: SSM 접속 권한
resource "aws_iam_role_policy_attachment" "web_ec2_ssm" {
  role       = aws_iam_role.web_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# 정책 연결: ECS 컨테이너 서비스 권한
resource "aws_iam_role_policy_attachment" "web_ec2_container" {
  role       = aws_iam_role.web_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}
# EC2에 입히기 위한 프로파일 생성
resource "aws_iam_instance_profile" "web_ec2_profile" {
  name = aws_iam_role.web_ec2_role.name
  role = aws_iam_role.web_ec2_role.name
}

##################################
##    DB EC2 역할               ##
##################################
resource "aws_iam_role" "db_ec2_role" {
  name               = "${var.project_name}-${var.environment}-db-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

# 정책 연결: SSM 접속 권한
resource "aws_iam_role_policy_attachment" "db_ec2_ssm" {
  role       = aws_iam_role.db_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# EC2에 입히기 위한 프로파일 생성
resource "aws_iam_instance_profile" "db_ec2_profile" {
  name = aws_iam_role.db_ec2_role.name
  role = aws_iam_role.db_ec2_role.name
}

########################################
##    ECS Task Execution              ##
########################################

# ECS가 이미지를 받아오고 로그를 남기기 위해 필요한 역할
resource "aws_iam_role" "ecs_task_execution_role" {
  name               = "${var.project_name}-${var.environment}-ecs-task-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_standard" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

#################################
##    ECS Task Role            ##
#################################

# ECS 안에서 돌아가는 앱 자체가 AWS 자원(S3 등)을 쓸 때 필요한 역할 (이후에 추가예정)
resource "aws_iam_role" "ecs_task_role" {
  name               = "${var.project_name}-${var.environment}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}