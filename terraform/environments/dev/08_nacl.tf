########################
## Public Subnet NACL ##
########################

resource "aws_network_acl" "public" {
  vpc_id = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-public-nacl"
  }
}

#########################
## Public NACL Inbound ##
#########################
resource "aws_network_acl_rule" "public_in_http" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 100
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 80
  to_port        = 80
}

resource "aws_network_acl_rule" "public_in_https" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 110
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 443
  to_port        = 443
}

resource "aws_network_acl_rule" "public_in_ephemeral" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 120
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
}

##########################
## Public NACL Outbound ##
##########################

resource "aws_network_acl_rule" "public_out_http" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 200
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 80
  to_port        = 80
}

resource "aws_network_acl_rule" "public_out_https" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 210
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 443
  to_port        = 443
}

resource "aws_network_acl_rule" "public_out_app_a" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 100
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.private_app_subnet_a_cidr
  from_port      = var.app_port
  to_port        = var.app_port
}

resource "aws_network_acl_rule" "public_out_app_c" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 110
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.private_app_subnet_c_cidr
  from_port      = var.app_port
  to_port        = var.app_port
}

resource "aws_network_acl_rule" "public_out_ephemeral" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 120
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
}

############################
### Private App Subnet NACL
############################

resource "aws_network_acl" "private_app" {
  vpc_id = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-private-app-nacl"
  }
}

##############################
## Private App NACL Inbound ##
##############################
resource "aws_network_acl_rule" "private_app_in_from_public_a" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 100
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.public_subnet_a_cidr
  from_port      = var.app_port
  to_port        = var.app_port
}

resource "aws_network_acl_rule" "private_app_in_from_public_c" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 110
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.public_subnet_c_cidr
  from_port      = var.app_port
  to_port        = var.app_port
}

resource "aws_network_acl_rule" "private_app_in_ml_a" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 200
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.private_app_subnet_a_cidr
  from_port      = var.ml_port
  to_port        = var.ml_port
}

resource "aws_network_acl_rule" "private_app_in_ml_c" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 210
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.private_app_subnet_c_cidr
  from_port      = var.ml_port
  to_port        = var.ml_port
}

resource "aws_network_acl_rule" "private_app_in_ephemeral" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 120
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
}

###############################
## Private App NACL Outbound ##
###############################
resource "aws_network_acl_rule" "private_app_out_to_public_a_ephemeral" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 100
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.public_subnet_a_cidr
  from_port      = 1024
  to_port        = 65535
}

resource "aws_network_acl_rule" "private_app_out_to_public_c_ephemeral" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 110
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.public_subnet_c_cidr
  from_port      = 1024
  to_port        = 65535
}

resource "aws_network_acl_rule" "private_app_out_http" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 120
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 80
  to_port        = 80
}

resource "aws_network_acl_rule" "private_app_out_https" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 130
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 443
  to_port        = 443
}

resource "aws_network_acl_rule" "private_app_out_db_a" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 140
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.private_db_subnet_a_cidr
  from_port      = var.db_port
  to_port        = var.db_port
}

resource "aws_network_acl_rule" "private_app_out_db_c" {
  network_acl_id = aws_network_acl.private_app.id
  rule_number    = 150
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.private_db_subnet_c_cidr
  from_port      = var.db_port
  to_port        = var.db_port
}

############################
## Private DB Subnet NACL ##
############################

resource "aws_network_acl" "private_db" {
  vpc_id = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-${var.environment}-private-db-nacl"
  }
}

#############################
## Private DB NACL Inbound ##
#############################
resource "aws_network_acl_rule" "private_db_in_from_app_a" {
  network_acl_id = aws_network_acl.private_db.id
  rule_number    = 100
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.private_app_subnet_a_cidr
  from_port      = var.db_port
  to_port        = var.db_port
}

resource "aws_network_acl_rule" "private_db_in_from_app_c" {
  network_acl_id = aws_network_acl.private_db.id
  rule_number    = 110
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.private_app_subnet_c_cidr
  from_port      = var.db_port
  to_port        = var.db_port
}

resource "aws_network_acl_rule" "private_db_in_ephemeral" {
  network_acl_id = aws_network_acl.private_db.id
  rule_number    = 120
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.vpc_cidr
  from_port      = 1024
  to_port        = 65535
}

##############################
## Private DB NACL Outbound ##
##############################
resource "aws_network_acl_rule" "private_db_out_to_app_a_ephemeral" {
  network_acl_id = aws_network_acl.private_db.id
  rule_number    = 100
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.private_app_subnet_a_cidr
  from_port      = 1024
  to_port        = 65535
}

resource "aws_network_acl_rule" "private_db_out_to_app_c_ephemeral" {
  network_acl_id = aws_network_acl.private_db.id
  rule_number    = 110
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = var.private_app_subnet_c_cidr
  from_port      = 1024
  to_port        = 65535
}

#######################
### NACL과 서브넷 연결 ###
#######################

# Public subnets
resource "aws_network_acl_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  network_acl_id = aws_network_acl.public.id
}

resource "aws_network_acl_association" "public_c" {
  subnet_id      = aws_subnet.public_c.id
  network_acl_id = aws_network_acl.public.id
}

# Private app subnets
resource "aws_network_acl_association" "private_app_a" {
  subnet_id      = aws_subnet.private_app_a.id
  network_acl_id = aws_network_acl.private_app.id
}

resource "aws_network_acl_association" "private_app_c" {
  subnet_id      = aws_subnet.private_app_c.id
  network_acl_id = aws_network_acl.private_app.id
}

# Private db subnets
resource "aws_network_acl_association" "private_db_a" {
  subnet_id      = aws_subnet.private_db_a.id
  network_acl_id = aws_network_acl.private_db.id
}

resource "aws_network_acl_association" "private_db_c" {
  subnet_id      = aws_subnet.private_db_c.id
  network_acl_id = aws_network_acl.private_db.id
}