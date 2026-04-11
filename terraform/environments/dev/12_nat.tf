# 2개의 AZ를 사용하기 때문에, NAT 게이트웨이를 2개 설치하는 것이 이상적이지만
# 비용 문제로 현재는 임시로 1개만 사용함.

# NAT Gateway용 Elastic IP 생성
resource "aws_eip" "nat_a_eip" {
  domain = "vpc"

  tags = {
    Name = "nat-eip-a"
  }
}

# Public Subnet에 NAT Gateway 생성
resource "aws_nat_gateway" "nat_a" {
  allocation_id = aws_eip.nat_a_eip.id
  subnet_id     = aws_subnet.public_a.id

  tags = {
    Name = "nat-gateway-a"
  }

  depends_on = [aws_internet_gateway.main]
}