############################################
### 라우트 테이블 조회 (private 서브넷 기준) ###
############################################

data "aws_route_tables" "private" {
  vpc_id = aws_vpc.main.id

  filter {
    name   = "tag:Tier"
    values = ["private"]
  }
}

###########################
### S3 Gateway Endpoint ###
###########################

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = data.aws_route_tables.private.ids

  tags = {
    Name        = "${var.project_name}-${var.environment}-s3-gateway-endpoint"
    Terraform   = "true"
    Environment = var.environment
    Project     = var.project_name
  }
}