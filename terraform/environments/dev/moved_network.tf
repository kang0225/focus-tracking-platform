###############################################################
### network 모듈 추출에 따른 state 이동 (리소스 1:1)
###
### 기존 루트의 네트워킹 리소스들을 modules/network 모듈 안으로
### 옮기면서 state 주소만 바꾼다. 리소스 자체는 동일하므로
### `terraform plan` 결과는 "add 0 / change 0 / destroy 0" 이어야 하며
### moved 알림만 떠야 한다.
###
### apply 후 state 정착이 확인되면 이 파일은 삭제해도 된다.
###############################################################

# --- VPC / IGW ---
moved {
  from = aws_vpc.main_vpc
  to   = module.network.aws_vpc.main_vpc
}
moved {
  from = aws_internet_gateway.main_igw
  to   = module.network.aws_internet_gateway.main_igw
}

# --- Subnets ---
moved {
  from = aws_subnet.public_a
  to   = module.network.aws_subnet.public_a
}
moved {
  from = aws_subnet.public_c
  to   = module.network.aws_subnet.public_c
}
moved {
  from = aws_subnet.private_app_a
  to   = module.network.aws_subnet.private_app_a
}
moved {
  from = aws_subnet.private_app_c
  to   = module.network.aws_subnet.private_app_c
}
moved {
  from = aws_subnet.private_db_a
  to   = module.network.aws_subnet.private_db_a
}
moved {
  from = aws_subnet.private_db_c
  to   = module.network.aws_subnet.private_db_c
}

# --- Route Tables & Associations ---
moved {
  from = aws_route_table.public_rt
  to   = module.network.aws_route_table.public_rt
}
moved {
  from = aws_route_table.private_rt
  to   = module.network.aws_route_table.private_rt
}
moved {
  from = aws_route_table_association.public_a
  to   = module.network.aws_route_table_association.public_a
}
moved {
  from = aws_route_table_association.public_c
  to   = module.network.aws_route_table_association.public_c
}
moved {
  from = aws_route_table_association.private_app_a
  to   = module.network.aws_route_table_association.private_app_a
}
moved {
  from = aws_route_table_association.private_app_c
  to   = module.network.aws_route_table_association.private_app_c
}
moved {
  from = aws_route_table_association.private_db_a
  to   = module.network.aws_route_table_association.private_db_a
}
moved {
  from = aws_route_table_association.private_db_c
  to   = module.network.aws_route_table_association.private_db_c
}

# --- NACLs ---
moved {
  from = aws_network_acl.public
  to   = module.network.aws_network_acl.public
}
moved {
  from = aws_network_acl.private_app
  to   = module.network.aws_network_acl.private_app
}
moved {
  from = aws_network_acl.private_db
  to   = module.network.aws_network_acl.private_db
}

# --- NACL Rules: public ---
moved {
  from = aws_network_acl_rule.public_in_http
  to   = module.network.aws_network_acl_rule.public_in_http
}
moved {
  from = aws_network_acl_rule.public_in_https
  to   = module.network.aws_network_acl_rule.public_in_https
}
moved {
  from = aws_network_acl_rule.public_in_ephemeral
  to   = module.network.aws_network_acl_rule.public_in_ephemeral
}
moved {
  from = aws_network_acl_rule.public_out_http
  to   = module.network.aws_network_acl_rule.public_out_http
}
moved {
  from = aws_network_acl_rule.public_out_https
  to   = module.network.aws_network_acl_rule.public_out_https
}
moved {
  from = aws_network_acl_rule.public_out_app_a
  to   = module.network.aws_network_acl_rule.public_out_app_a
}
moved {
  from = aws_network_acl_rule.public_out_app_c
  to   = module.network.aws_network_acl_rule.public_out_app_c
}
moved {
  from = aws_network_acl_rule.public_out_ephemeral
  to   = module.network.aws_network_acl_rule.public_out_ephemeral
}

# --- NACL Rules: private_app ---
moved {
  from = aws_network_acl_rule.private_app_in_from_public_a
  to   = module.network.aws_network_acl_rule.private_app_in_from_public_a
}
moved {
  from = aws_network_acl_rule.private_app_in_from_public_c
  to   = module.network.aws_network_acl_rule.private_app_in_from_public_c
}
moved {
  from = aws_network_acl_rule.private_app_in_ml_a
  to   = module.network.aws_network_acl_rule.private_app_in_ml_a
}
moved {
  from = aws_network_acl_rule.private_app_in_ml_c
  to   = module.network.aws_network_acl_rule.private_app_in_ml_c
}
moved {
  from = aws_network_acl_rule.private_app_in_ephemeral
  to   = module.network.aws_network_acl_rule.private_app_in_ephemeral
}
moved {
  from = aws_network_acl_rule.private_app_out_to_public_a_ephemeral
  to   = module.network.aws_network_acl_rule.private_app_out_to_public_a_ephemeral
}
moved {
  from = aws_network_acl_rule.private_app_out_to_public_c_ephemeral
  to   = module.network.aws_network_acl_rule.private_app_out_to_public_c_ephemeral
}
moved {
  from = aws_network_acl_rule.private_app_out_ml_api
  to   = module.network.aws_network_acl_rule.private_app_out_ml_api
}
moved {
  from = aws_network_acl_rule.private_app_out_redis
  to   = module.network.aws_network_acl_rule.private_app_out_redis
}
moved {
  from = aws_network_acl_rule.private_app_out_http
  to   = module.network.aws_network_acl_rule.private_app_out_http
}
moved {
  from = aws_network_acl_rule.private_app_out_https
  to   = module.network.aws_network_acl_rule.private_app_out_https
}
moved {
  from = aws_network_acl_rule.private_app_out_db_a
  to   = module.network.aws_network_acl_rule.private_app_out_db_a
}
moved {
  from = aws_network_acl_rule.private_app_out_db_c
  to   = module.network.aws_network_acl_rule.private_app_out_db_c
}
moved {
  from = aws_network_acl_rule.private_app_out_to_app_c_ephemeral
  to   = module.network.aws_network_acl_rule.private_app_out_to_app_c_ephemeral
}

# --- NACL Rules: private_db ---
moved {
  from = aws_network_acl_rule.private_db_in_from_app_a
  to   = module.network.aws_network_acl_rule.private_db_in_from_app_a
}
moved {
  from = aws_network_acl_rule.private_db_in_from_app_c
  to   = module.network.aws_network_acl_rule.private_db_in_from_app_c
}
moved {
  from = aws_network_acl_rule.private_db_in_ephemeral
  to   = module.network.aws_network_acl_rule.private_db_in_ephemeral
}
moved {
  from = aws_network_acl_rule.private_db_out_to_app_a_ephemeral
  to   = module.network.aws_network_acl_rule.private_db_out_to_app_a_ephemeral
}
moved {
  from = aws_network_acl_rule.private_db_out_to_app_c_ephemeral
  to   = module.network.aws_network_acl_rule.private_db_out_to_app_c_ephemeral
}

# --- NACL Associations ---
moved {
  from = aws_network_acl_association.public_a
  to   = module.network.aws_network_acl_association.public_a
}
moved {
  from = aws_network_acl_association.public_c
  to   = module.network.aws_network_acl_association.public_c
}
moved {
  from = aws_network_acl_association.private_app_a
  to   = module.network.aws_network_acl_association.private_app_a
}
moved {
  from = aws_network_acl_association.private_app_c
  to   = module.network.aws_network_acl_association.private_app_c
}
moved {
  from = aws_network_acl_association.private_db_a
  to   = module.network.aws_network_acl_association.private_db_a
}
moved {
  from = aws_network_acl_association.private_db_c
  to   = module.network.aws_network_acl_association.private_db_c
}

# --- NAT (EIP + Gateway) ---
moved {
  from = aws_eip.nat_a_eip
  to   = module.network.aws_eip.nat_a_eip
}
moved {
  from = aws_nat_gateway.nat_a
  to   = module.network.aws_nat_gateway.nat_a
}

# --- S3 VPC Endpoint ---
moved {
  from = aws_vpc_endpoint.s3
  to   = module.network.aws_vpc_endpoint.s3
}
