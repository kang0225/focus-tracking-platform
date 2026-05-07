
# 2개의 AZ를 사용하기 때문에, NAT 게이트웨이를 2개 설치하는 것이 이상적이지만
# 비용 문제로 현재는 임시로 1개만 사용함.

# NAT Gateway에는 고정 공인 IP가 필요함 (Elastic IP)
resource "aws_eip" "nat_a_eip" {
  domain = "vpc"   # VPC용 EIP

  tags = {
    Name = "${var.project_name}-${var.environment}-nat-eip-a"
  }
}

# 퍼블릭 서브넷(AZ-a)에 NAT Gateway 배치
# NAT Gateway는 반드시 퍼블릭 서브넷에 위치해야 함 (IGW 경유해 인터넷 접근)
resource "aws_nat_gateway" "nat_a" {
  allocation_id = aws_eip.nat_a_eip.id      # 위에서 만든 EIP 연결
  subnet_id     = aws_subnet.public_a.id    # 퍼블릭 서브넷에 배치

  tags = {
    Name = "${var.project_name}-${var.environment}-nat-gateway-a"
  }

  # IGW가 먼저 만들어져 있어야 NAT Gateway 동작함
  depends_on = [aws_internet_gateway.main_igw]
}
