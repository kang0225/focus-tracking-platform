###################
### Hosted Zone ###
###################

data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false # 외부에서 접속이 가능해야 함.
}

##########################
### 서비스용 DNS — apex ###
##########################
# study-room.click → ALB
resource "aws_route53_record" "apex" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}

#########################
### 서비스용 DNS — www ###
#########################
# www.study-room.click → ALB
resource "aws_route53_record" "www" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}