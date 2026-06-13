###############################################################
### Network 모듈
### VPC / Subnet / Route Table / NACL / NAT / S3 Endpoint 등을 관리하는 모듈
###############################################################
module "network" {
  source = "../../modules/network"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  vpc_cidr = var.vpc_cidr
  az_a     = var.az_a
  az_c     = var.az_c

  public_subnet_a_cidr      = var.public_subnet_a_cidr
  public_subnet_c_cidr      = var.public_subnet_c_cidr
  private_app_subnet_a_cidr = var.private_app_subnet_a_cidr
  private_app_subnet_c_cidr = var.private_app_subnet_c_cidr
  private_db_subnet_a_cidr  = var.private_db_subnet_a_cidr
  private_db_subnet_c_cidr  = var.private_db_subnet_c_cidr

  app_port = var.app_port
  db_port  = var.db_port
  ml_port  = var.ml_port
}
