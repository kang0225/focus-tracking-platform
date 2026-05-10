##########################################
### 1. 퍼블릭 라우팅 테이블 (Public Route Table) ###
##########################################

# 외부 인터넷(0.0.0.0/0)으로 나가는 길을 IGW로 연결
resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.main_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main_igw.id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-public-rt"
  }
}

# 퍼블릭 서브넷 2개를 위 테이블에 묶기
resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "public_c" {
  subnet_id      = aws_subnet.public_c.id
  route_table_id = aws_route_table.public_rt.id
}


############################################
### 2. 프라이빗 라우팅 테이블 (Private Route Table) ###
############################################

resource "aws_route_table" "private_rt" {
  vpc_id = aws_vpc.main_vpc.id
  
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat_a.id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-private-rt"
  }
  
}

# 모든 프라이빗 서브넷 연결
resource "aws_route_table_association" "private_app_a" {
  subnet_id      = aws_subnet.private_app_a.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table_association" "private_app_c" {
  subnet_id      = aws_subnet.private_app_c.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table_association" "private_db_a" {
  subnet_id      = aws_subnet.private_db_a.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table_association" "private_db_c" {
  subnet_id      = aws_subnet.private_db_c.id
  route_table_id = aws_route_table.private_rt.id
}