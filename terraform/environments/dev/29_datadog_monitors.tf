##############################################
#### Datadog → Slack 알림 (ML EC2 전용)     ####
##############################################
# "CPU 사용률 높음 AND CPU 크레딧 낮음" = 진짜 스로틀링 위험
# 을 composite monitor로 잡아 Slack에 보낸다. (t4g 버스터블 특성)
#
# 사전 준비(1회, UI): Datadog → Integrations → Slack 에서 워크스페이스를
# OAuth로 연결. 그때 정한 이름을 var.datadog_slack_account_name 으로 전달.

locals {
  # Slack 멘션 형식: @slack-{account_name}-{channel(# 제외)}
  datadog_slack_handle = "@slack-${var.datadog_slack_account_name}-${trimprefix(var.datadog_slack_channel, "#")}"
}

##############################################
#### 1. Slack 채널 등록                     ####
##############################################
resource "datadog_integration_slack_channel" "alerts" {
  account_name = var.datadog_slack_account_name
  channel_name = var.datadog_slack_channel

  display {
    message  = true
    notified = true
    snapshot = true
    tags     = true
  }
}

##############################################
#### 2. 구성 요소 모니터 (composite의 입력) ####
##############################################
# 아래 두 모니터는 composite의 "조건"으로만 쓰인다.
# 단독으로는 Slack을 울리지 않게 두고(중복 알림 방지), 실제 통지는
# 3번 composite가 담당한다.

# (a) CPU 사용률
resource "datadog_monitor" "ml_ec2_cpu" {
  name    = "[${var.environment}] ML EC2 CPU 사용률 (composite 입력)"
  type    = "metric alert"
  message = "ML EC2(${aws_instance.ml_ec2.id}) CPU 사용률 임계치 초과 — composite 입력용"

  query = "avg(last_5m):avg:aws.ec2.cpuutilization{instance-id:${aws_instance.ml_ec2.id}} > 80"

  monitor_thresholds {
    critical = 80
    warning  = 65
  }

  notify_no_data = false

  tags = ["env:${var.environment}", "service:ml-ec2", "role:composite-input"]
}

# (b) CPU 크레딧 잔량
# t4g.small은 버스터블. 크레딧이 소진되면 CPU%가 낮아 보여도 baseline으로
# 스로틀링되어 추론이 느려진다. CPU%만으로는 못 잡는 신호.
resource "datadog_monitor" "ml_ec2_cpu_credit" {
  name    = "[${var.environment}] ML EC2 CPU 크레딧 (composite 입력)"
  type    = "metric alert"
  message = "ML EC2(${aws_instance.ml_ec2.id}) CPU 크레딧 잔량 부족 — composite 입력용"

  query = "avg(last_10m):avg:aws.ec2.cpucredit_balance{instance-id:${aws_instance.ml_ec2.id}} < 50"

  monitor_thresholds {
    critical = 50
    warning  = 80
  }

  notify_no_data = false

  tags = ["env:${var.environment}", "service:ml-ec2", "role:composite-input"]
}

##############################################
#### 3. Composite Monitor → Slack          ####
##############################################
# CPU가 높은데(부하 존재) 동시에 크레딧까지 바닥 → baseline 스로틀링 임박/진행
resource "datadog_monitor" "ml_ec2_throttling_risk" {
  name = "[${var.environment}] ML EC2 스로틀링 위험 (CPU 높음 + 크레딧 소진)"
  type = "composite"

  query = "${datadog_monitor.ml_ec2_cpu.id} && ${datadog_monitor.ml_ec2_cpu_credit.id}"

  message = <<-EOT
    {{#is_alert}}
    🔥 ML EC2(${aws_instance.ml_ec2.id}) 스로틀링 위험
    CPU 부하가 높은 상태에서 CPU 크레딧까지 소진되어, baseline(약 20~40%)으로
    스로틀링되며 ML 추론이 느려질 수 있습니다.
    조치: 부하 원인 확인 / 인스턴스 타입 상향(t4g→고정 vCPU) 검토.
    {{/is_alert}}
    {{#is_recovery}}
    ✅ ML EC2(${aws_instance.ml_ec2.id}) 스로틀링 위험 해소
    CPU 부하가 안정화되었거나 CPU 크레딧이 충분히 확보되었습니다.
    {{/is_recovery}}

    ${local.datadog_slack_handle}
  EOT

  notify_no_data    = false
  renotify_interval = 60

  tags = ["env:${var.environment}", "service:ml-ec2"]
}
