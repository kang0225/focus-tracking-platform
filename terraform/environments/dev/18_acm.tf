##############################################
#### 1. ACM 인증서 발급 요청               ####
##############################################
# apex + www 둘 다 커버하는 인증서 한 장
resource "aws_acm_certificate" "main" {
  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-cert"
  }
}

##############################################
#### 2. 검증용 CNAME 자동 생성             ####
##############################################
# ACM이 시킨 검증 CNAME을 Route53에 자동으로 박음
# apex용 1개 + www용 1개, 총 2개 생성됨
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

##############################################
#### 3. 검증 완료 대기                     ####
##############################################
# 위 CNAME이 propagate되어 ACM이 검증 완료할 때까지 기다림
resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}