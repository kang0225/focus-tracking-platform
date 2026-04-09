# 1. EC2 서비스가 이 역할을 가져갈 수 있도록 허용하는 "신뢰 정책(Trust Policy)"
resource "aws_iam_role" "ecs_instance_role" {
  name = "${var.project_name}-${var.environment}-web-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = {
    Name = "${var.project_name}-ecs-instance-role"
  }
}

# 2. ECS 일꾼 권한 부여: EC2가 ECS 클러스터에 등록되고 통신할 수 있게 함
resource "aws_iam_role_policy_attachment" "ecs_instance_role_policy" {
  role       = aws_iam_role.ecs_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

# 3. SSM(세션 매니저) 권한 부여: SSH 키 없이 웹 콘솔에서 바로 접속 가능하게 함 (보안 강화)
resource "aws_iam_role_policy_attachment" "ecs_instance_ssm_policy" {
  role       = aws_iam_role.ecs_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# 4. ECR 권한 보강: 이미지를 내려받을 때 필요한 최소 권한
resource "aws_iam_role_policy_attachment" "ecr_read_only" {
  role       = aws_iam_role.ecs_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# 5. ★최종 결과물★: EC2 인스턴스에 실제로 '부착'할 프로필
# 다른 팀원이 aws_instance를 만들 때 'iam_instance_profile' 항목에 이 이름을 넣어야 함!
resource "aws_iam_instance_profile" "ecs_instance_profile" {
  name = "${var.project_name}-${var.environment}-ecs-inst-profile"
  role = aws_iam_role.ecs_instance_role.name
}