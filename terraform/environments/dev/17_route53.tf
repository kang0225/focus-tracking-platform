##############################################
#### 1. Hosted Zone (DNS 영역)             ####
##############################################

# 외부 구매(가비아 등)인 경우: 새 zone 생성
resource "aws_route53_zone" "main" {
  count = var.create_route53_zone ? 1 : 0
  name  = var.domain_name

  tags = {
    Name = "${var.project_name}-${var.environment}-zone"
  }
}

# Route53 구매인 경우: 기존 zone 참조
data "aws_route53_zone" "existing" {
  count        = var.create_route53_zone ? 0 : 1
  name         = var.domain_name
  private_zone = false
}

# 어느 쪽이든 동일한 이름으로 참조
locals {
  zone_id = var.create_route53_zone ? aws_route53_zone.main[0].zone_id : data.aws_route53_zone.existing[0].zone_id
}

##############################################
#### 2. 서비스용 DNS — apex                ####
##############################################
# study-room.click → ALB
resource "aws_route53_record" "apex" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}

##############################################
#### 3. 서비스용 DNS — www                 ####
##############################################
# www.study-room.click → ALB
resource "aws_route53_record" "www" {
  zone_id = local.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}