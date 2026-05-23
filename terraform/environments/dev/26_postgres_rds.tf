######################
### PostgreSQL RDS ###
######################
/*
Aurora PostgreSQL도 고려했지만, 초기 트래픽 규모와 비용 효율성을 고려하면 RDS PostgreSQL이 더 적합
추후 트래픽 증가나 고가용성 요구가 커질 경우 Aurora PostgreSQL 또는 Aurora Serverless v2로 마이그레이션 고려려
*/

resource "aws_db_subnet_group" "postgres" {
  name        = "${var.project_name}-${var.environment}-postgres-subnet-group"
  description = "Private DB subnet group for PostgreSQL RDS"

  subnet_ids = [
    aws_subnet.private_db_a.id,
    aws_subnet.private_db_c.id,
  ]

  tags = {
    Name = "${var.project_name}-${var.environment}-postgres-subnet-group"
  }
}

resource "aws_db_instance" "postgres" {
  identifier = "${var.project_name}-${var.environment}-postgres"

  engine         = "postgres"
  instance_class = var.postgres_instance_class

  db_name                     = var.postgres_db_name
  username                    = var.postgres_master_username
  manage_master_user_password = true # RDS 마스터 비밀번호는 랜덤으로 만들고, Secrets Manager에 저장, RDS와 연결해서 관리

  allocated_storage = var.postgres_allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  publicly_accessible    = false
  multi_az               = true

  backup_retention_period    = var.postgres_backup_retention_days # 이 날짜가 지나면 자동 삭제
  backup_window              = "18:00-19:00"                      # 자동 백업이 실행될 시간대
  maintenance_window         = "sun:19:00-sun:20:00"              # AWS가 패치 내용이 생기면 업데이트할 시간대
  auto_minor_version_upgrade = true                               # AWS가 패치해도 되는지 여부. 패치 일정을 따로 관리하려면 False 권장.

  copy_tags_to_snapshot = true # 태그를 스냅샷에 씀.
  deletion_protection   = true # destory나 삭제 실수 방지
  skip_final_snapshot   = true # DB 삭제 시 최종적인 스냅샷을 생성
  apply_immediately     = false

  enabled_cloudwatch_logs_exports = [
    "postgresql",
    "upgrade",
  ]

  tags = {
    Name = "${var.project_name}-${var.environment}-postgres"
  }
}
