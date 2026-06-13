output "vpc_id" {
  description = "메인 VPC ID"
  value       = aws_vpc.main_vpc.id
}

output "vpc_cidr_block" {
  description = "VPC CIDR"
  value       = aws_vpc.main_vpc.cidr_block
}

output "igw_id" {
  description = "Internet Gateway ID"
  value       = aws_internet_gateway.main_igw.id
}

output "public_subnet_a_id" {
  value = aws_subnet.public_a.id
}

output "public_subnet_c_id" {
  value = aws_subnet.public_c.id
}

output "private_app_subnet_a_id" {
  value = aws_subnet.private_app_a.id
}

output "private_app_subnet_c_id" {
  value = aws_subnet.private_app_c.id
}

output "private_db_subnet_a_id" {
  value = aws_subnet.private_db_a.id
}

output "private_db_subnet_c_id" {
  value = aws_subnet.private_db_c.id
}

output "public_route_table_id" {
  value = aws_route_table.public_rt.id
}

output "private_route_table_id" {
  value = aws_route_table.private_rt.id
}

output "nat_gateway_id" {
  value = aws_nat_gateway.nat_a.id
}

output "s3_vpc_endpoint_id" {
  value = aws_vpc_endpoint.s3.id
}
