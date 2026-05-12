###########################
### S3 Gateway Endpoint ###
###########################

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main_vpc.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private_rt.id]

  tags = {
    Name        = "${var.project_name}-${var.environment}-s3-gateway-endpoint"
    Terraform   = "true"
    Environment = var.environment
    Project     = var.project_name
  }
}