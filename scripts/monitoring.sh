#!/usr/bin/env bash

# ============================================================
# AWS Infrastructure Monitoring Dashboard
#
# Usage:
#   ./scripts/monitoring.sh           # 전체 대시보드
#   ./scripts/monitoring.sh --watch   # 30초마다 자동 갱신
#   ./scripts/monitoring.sh --help    # 도움말
#
# 환경변수:
#   AWS_REGION       기본: ap-northeast-2
#   CLUSTER_NAME     ECS 클러스터 이름
#   ASG_NAME         Auto Scaling Group 이름
# ============================================================

set -uo pipefail

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
CLUSTER_NAME="${CLUSTER_NAME:-focus-tracking-platform-dev-cluster}"
ASG_NAME="${ASG_NAME:-focus-tracking-platform-dev-app-asg}"

# 색상
RED=$'\033[0;31m'
GRN=$'\033[0;32m'
YLW=$'\033[1;33m'
BLU=$'\033[0;34m'
CYN=$'\033[0;36m'
MAG=$'\033[0;35m'
DIM=$'\033[2m'
BLD=$'\033[1m'
NC=$'\033[0m'

WATCH=0

usage() {
    cat <<EOF
사용법: $(basename "$0") [옵션]

옵션:
  -w, --watch      30초마다 자동 갱신
  -h, --help       이 도움말 표시

환경변수:
  AWS_REGION       기본: ap-northeast-2
  CLUSTER_NAME     기본: focus-tracking-platform-dev-cluster
  ASG_NAME         기본: focus-tracking-platform-dev-app-asg
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -w|--watch)  WATCH=1; shift ;;
        -h|--help)   usage ;;
        *)           echo "알 수 없는 옵션: $1" >&2; exit 1 ;;
    esac
done

command -v aws >/dev/null 2>&1 || { echo "${RED}AWS CLI 필요${NC}" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "${RED}python3 필요${NC}" >&2; exit 1; }

# ============================================================
# 공통 유틸
# ============================================================

py() { python3 -c "$1"; }

hr() {
    echo "${DIM}─────────────────────────────────────────────────────────────────${NC}"
}

section() {
    echo
    echo "${BLU}${BLD}▶ $1${NC}"
}

# 스파크라인 (시계열 데이터 시각화)
sparkline() {
    py "
import json, sys
chars = '▁▂▃▄▅▆▇█'
data = json.loads('''$1''')
if not data:
    print('-')
    sys.exit()
mn, mx = min(data), max(data)
if mx == mn:
    print(chars[0] * len(data))
    sys.exit()
print(''.join(chars[int((v - mn) / (mx - mn) * 7)] for v in data))
"
}

# ============================================================
# 1. 헤더 (Identity)
# ============================================================
show_header() {
    local account
    account=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "?")
    local now
    now=$(date '+%Y-%m-%d %H:%M:%S %Z')

    clear
    echo "${CYN}${BLD}═══════════════════════════════════════════════════════════════${NC}"
    echo "${CYN}${BLD}  AWS Infrastructure Dashboard${NC}"
    echo "${CYN}${BLD}═══════════════════════════════════════════════════════════════${NC}"
    printf "  ${DIM}Cluster:${NC} %s\n" "$CLUSTER_NAME"
    printf "  ${DIM}Region:${NC}  %s  ${DIM}Account:${NC} %s\n" "$AWS_REGION" "$account"
    printf "  ${DIM}Time:${NC}    %s\n" "$now"
}

# ============================================================
# 2. 활성 알람 배너 (최상단 강조)
# ============================================================
show_alerts() {
    local alarming
    alarming=$(aws cloudwatch describe-alarms \
        --state-value ALARM \
        --region "$AWS_REGION" \
        --query 'MetricAlarms[].AlarmName' \
        --output text 2>/dev/null || echo "")

    if [[ -n "$alarming" && "$alarming" != "None" ]]; then
        echo
        echo "${RED}${BLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
        echo "${RED}${BLD}║  ⚠  ACTIVE ALERTS                                              ║${NC}"
        echo "${RED}${BLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
        for alarm in $alarming; do
            echo "  ${RED}● $alarm${NC}"
        done
    fi
}

# ============================================================
# 3. ECS Service Status + 최근 이벤트
# ============================================================
show_ecs_service() {
    section "ECS Service"

    local svc_arn
    svc_arn=$(aws ecs list-services --cluster "$CLUSTER_NAME" --region "$AWS_REGION" \
        --query 'serviceArns[0]' --output text 2>/dev/null || echo "None")

    [[ "$svc_arn" == "None" || -z "$svc_arn" ]] && { echo "  ${DIM}Service 없음${NC}"; return; }

    aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$svc_arn" \
        --region "$AWS_REGION" \
        --output json 2>/dev/null | py "
import json, sys
s = json.load(sys.stdin)['services'][0]
desired, running, pending = s['desiredCount'], s['runningCount'], s['pendingCount']
status = s['status']
cp = (s.get('capacityProviderStrategy') or [{}])[0].get('capacityProvider', '-')
td = s['taskDefinition'].split('/')[-1]
status_color = '${GRN}' if status == 'ACTIVE' else '${RED}'
task_color = '${GRN}' if desired == running else '${YLW}'

print(f'  Name:              {s[\"serviceName\"]}')
print(f'  Status:            {status_color}{status}${NC}')
print(f'  Task Definition:   {td}')
print(f'  Tasks:             {task_color}desired={desired}  running={running}  pending={pending}${NC}')
print(f'  Capacity Provider: {cp}')
print(f'  Created:           {s[\"createdAt\"][:19].replace(\"T\", \" \")}')

# 최근 이벤트 5개
print()
print('  ${DIM}최근 이벤트:${NC}')
for e in s.get('events', [])[:5]:
    msg = e['message']
    ts = e['createdAt'][:19].replace('T', ' ')
    if 'unable' in msg.lower() or 'failed' in msg.lower():
        color = '${RED}'
    elif 'steady state' in msg.lower():
        color = '${GRN}'
    else:
        color = '${DIM}'
    print(f'    {color}[{ts[5:]}]${NC} {msg[:80]}')
"
}

# ============================================================
# 4. 진행 중인 CodeDeploy 배포
# ============================================================
show_deployment() {
    section "Active Deployment"

    local app_name="focus-tracking-platform-dev-codedeploy-app"
    local deploys
    deploys=$(aws deploy list-deployments \
        --application-name "$app_name" \
        --include-only-statuses Created InProgress Queued Ready \
        --region "$AWS_REGION" \
        --query 'deployments' \
        --output text 2>/dev/null || echo "")

    if [[ -z "$deploys" || "$deploys" == "None" ]]; then
        echo "  ${DIM}진행 중인 배포 없음${NC}"
        return
    fi

    for dep_id in $deploys; do
        aws deploy get-deployment \
            --deployment-id "$dep_id" \
            --region "$AWS_REGION" \
            --output json 2>/dev/null | py "
import json, sys
d = json.load(sys.stdin)['deploymentInfo']
print(f'  ${YLW}● 배포 진행 중${NC}')
print(f'  Deployment ID: {d[\"deploymentId\"]}')
print(f'  Status:        {d[\"status\"]}')
print(f'  Started:       {d[\"createTime\"][:19].replace(\"T\", \" \")}')
overview = d.get('deploymentOverview', {})
print(f'  Progress:      Pending={overview.get(\"Pending\",0)} InProgress={overview.get(\"InProgress\",0)} Succeeded={overview.get(\"Succeeded\",0)} Failed={overview.get(\"Failed\",0)}')
"
    done
}

# ============================================================
# 5. Auto Scaling Group + EC2 메트릭
# ============================================================
show_compute() {
    section "Compute (Auto Scaling Group)"

    local data
    data=$(aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$ASG_NAME" \
        --region "$AWS_REGION" \
        --output json 2>/dev/null || echo '{"AutoScalingGroups":[]}')

    local asg_summary
    asg_summary=$(echo "$data" | py "
import json, sys
d = json.load(sys.stdin)
if not d.get('AutoScalingGroups'):
    sys.exit(1)
g = d['AutoScalingGroups'][0]
print(f'  Name:     {g[\"AutoScalingGroupName\"]}')
print(f'  Capacity: ${BLD}{g[\"DesiredCapacity\"]}${NC} desired (min={g[\"MinSize\"]}, max={g[\"MaxSize\"]})')
print(f'  Health:   {g[\"HealthCheckType\"]}')
")

    if [[ -z "$asg_summary" ]]; then
        echo "  ${DIM}ASG 없음${NC}"
        return
    fi

    echo "$asg_summary"
    echo
    echo "  ${DIM}Instances:${NC}"
    printf "  ${DIM}%-22s %-12s %-16s %-10s %-10s %-8s %-8s${NC}\n" "INSTANCE ID" "TYPE" "AZ" "STATE" "HEALTH" "CPU" "CREDITS"

    local instances
    instances=$(echo "$data" | py "
import json, sys
d = json.load(sys.stdin)
for inst in d['AutoScalingGroups'][0]['Instances']:
    print(f'{inst[\"InstanceId\"]}\t{inst[\"InstanceType\"]}\t{inst[\"AvailabilityZone\"]}\t{inst[\"LifecycleState\"]}\t{inst[\"HealthStatus\"]}')
")

    if [[ -z "$instances" ]]; then
        echo "  ${DIM}  (인스턴스 없음)${NC}"
        return
    fi

    while IFS=$'\t' read -r id itype az state health; do
        # 최근 CPU
        local cpu
        cpu=$(aws cloudwatch get-metric-statistics \
            --namespace AWS/EC2 \
            --metric-name CPUUtilization \
            --dimensions Name=InstanceId,Value="$id" \
            --statistics Average \
            --start-time "$(py "from datetime import datetime,timedelta; print((datetime.utcnow()-timedelta(minutes=5)).strftime('%Y-%m-%dT%H:%M:%S'))")" \
            --end-time "$(py "from datetime import datetime; print(datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S'))")" \
            --period 60 \
            --region "$AWS_REGION" \
            --output json 2>/dev/null | py "
import json,sys
d = json.load(sys.stdin)['Datapoints']
print(f'{sorted(d, key=lambda x:x[\"Timestamp\"])[-1][\"Average\"]:.0f}%' if d else '-')")

        # CPU 크레딧 잔량
        local credits
        credits=$(aws cloudwatch get-metric-statistics \
            --namespace AWS/EC2 \
            --metric-name CPUCreditBalance \
            --dimensions Name=InstanceId,Value="$id" \
            --statistics Average \
            --start-time "$(py "from datetime import datetime,timedelta; print((datetime.utcnow()-timedelta(minutes=10)).strftime('%Y-%m-%dT%H:%M:%S'))")" \
            --end-time "$(py "from datetime import datetime; print(datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S'))")" \
            --period 300 \
            --region "$AWS_REGION" \
            --output json 2>/dev/null | py "
import json,sys
d = json.load(sys.stdin)['Datapoints']
print(f'{sorted(d, key=lambda x:x[\"Timestamp\"])[-1][\"Average\"]:.0f}' if d else '-')")

        local sc hc
        [[ "$state" == "InService" ]] && sc="${GRN}" || sc="${YLW}"
        [[ "$health" == "Healthy" ]] && hc="${GRN}" || hc="${RED}"

        printf "  %-22s %-12s %-16s ${sc}%-10s${NC} ${hc}%-10s${NC} %-8s %-8s\n" \
            "$id" "$itype" "$az" "$state" "$health" "$cpu" "$credits"
    done <<<"$instances"
}

# ============================================================
# 6. Task 디테일
# ============================================================
show_tasks() {
    section "Running Tasks"

    local tasks
    tasks=$(aws ecs list-tasks \
        --cluster "$CLUSTER_NAME" \
        --region "$AWS_REGION" \
        --query 'taskArns' \
        --output text 2>/dev/null || echo "")

    if [[ -z "$tasks" || "$tasks" == "None" ]]; then
        echo "  ${DIM}Task 없음${NC}"
        return
    fi

    aws ecs describe-tasks \
        --cluster "$CLUSTER_NAME" \
        --tasks $tasks \
        --region "$AWS_REGION" \
        --output json 2>/dev/null | py "
import json, sys
tasks = json.load(sys.stdin)['tasks']
print(f'  ${DIM}{\"TASK ID\":<14} {\"STATUS\":<12} {\"HEALTH\":<10} {\"REV\":<6} {\"STARTED\":<19} {\"AZ\":<16}${NC}')
for t in tasks:
    tid = t['taskArn'].split('/')[-1][:12]
    status = t['lastStatus']
    health = t.get('healthStatus', '-')
    rev = t['taskDefinitionArn'].split(':')[-1]
    started = t.get('startedAt', '')[:19].replace('T', ' ') or '-'
    az = t.get('availabilityZone', '-')
    sc = '${GRN}' if status == 'RUNNING' else '${YLW}'
    hc = '${GRN}' if health == 'HEALTHY' else ('${DIM}' if health == '-' else '${YLW}')
    print(f'  {tid:<14} {sc}{status:<12}${NC} {hc}{health:<10}${NC} {rev:<6} {started:<19} {az}')
"
}

# ============================================================
# 7. ALB Target Health (디테일)
# ============================================================
show_alb() {
    section "ALB Target Groups"

    local tgs
    tgs=$(aws elbv2 describe-target-groups --region "$AWS_REGION" \
        --query 'TargetGroups[].[TargetGroupName,TargetGroupArn,Port,Protocol]' \
        --output text 2>/dev/null)

    [[ -z "$tgs" ]] && { echo "  ${DIM}Target Group 없음${NC}"; return; }

    while IFS=$'\t' read -r name arn port proto; do
        local health_json
        health_json=$(aws elbv2 describe-target-health \
            --target-group-arn "$arn" \
            --region "$AWS_REGION" \
            --output json 2>/dev/null)

        echo "$health_json" | py "
import json, sys
d = json.load(sys.stdin)['TargetHealthDescriptions']
name = '$name'
port = '$port'
proto = '$proto'
total = len(d)
healthy = sum(1 for t in d if t['TargetHealth']['State'] == 'healthy')

if total == 0:
    print(f'  ${DIM}{name} (port {port}): 비어있음${NC}')
else:
    color = '${GRN}' if healthy == total else '${RED}'
    print(f'  ${BLD}{name}${NC} ({proto}:{port})  {color}{healthy}/{total} healthy${NC}')
    for t in d:
        tid = t['Target']['Id']
        tport = t['Target']['Port']
        state = t['TargetHealth']['State']
        reason = t['TargetHealth'].get('Reason', '')
        sc = '${GRN}' if state == 'healthy' else '${RED}'
        print(f'    {sc}●${NC} {tid}:{tport}  {state}' + (f'  ${DIM}({reason})${NC}' if reason else ''))
"
    done <<<"$tgs"
}

# ============================================================
# 8. 최근 메트릭 (스파크라인 포함)
# ============================================================
show_metrics() {
    section "Recent Metrics (last 15 min)"

    local svc_name
    svc_name=$(aws ecs list-services --cluster "$CLUSTER_NAME" --region "$AWS_REGION" \
        --query 'serviceArns[0]' --output text 2>/dev/null | awk -F'/' '{print $NF}')

    local alb_arn
    alb_arn=$(aws elbv2 describe-load-balancers --region "$AWS_REGION" \
        --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null)
    local alb_suffix
    alb_suffix=$(echo "$alb_arn" | awk -F':' '{print $NF}' | sed 's|loadbalancer/||')

    local start end
    start=$(py "from datetime import datetime,timedelta; print((datetime.utcnow()-timedelta(minutes=15)).strftime('%Y-%m-%dT%H:%M:%S'))")
    end=$(py "from datetime import datetime; print(datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S'))")

    # 메트릭 1개 가져와서 sparkline + avg + max 출력
    fetch_metric() {
        local namespace="$1" metric="$2" stat="$3" dims="$4" unit="$5" label="$6"

        local data
        data=$(aws cloudwatch get-metric-statistics \
            --namespace "$namespace" \
            --metric-name "$metric" \
            --dimensions $dims \
            --statistics "$stat" Maximum \
            --start-time "$start" --end-time "$end" \
            --period 60 \
            --region "$AWS_REGION" \
            --output json 2>/dev/null | py "
import json, sys
d = sorted(json.load(sys.stdin)['Datapoints'], key=lambda x: x['Timestamp'])
if not d:
    print('|-|-|')
    sys.exit()
values = [p['$stat'] for p in d]
maxes = [p['Maximum'] for p in d]
print(f'{json.dumps(values)}|{sum(values)/len(values):.1f}|{max(maxes):.1f}')
")

        local series avg mx
        IFS='|' read -r series avg mx <<<"$data"

        if [[ "$avg" == "-" ]]; then
            printf "  %-32s ${DIM}데이터 없음${NC}\n" "$label"
        else
            local spark
            spark=$(sparkline "$series")
            printf "  %-32s ${CYN}%s${NC}  avg=${BLD}%s%s${NC}  max=%s%s\n" \
                "$label" "$spark" "$avg" "$unit" "$mx" "$unit"
        fi
    }

    if [[ -n "$svc_name" && "$svc_name" != "None" ]]; then
        fetch_metric "AWS/ECS" "CPUUtilization" "Average" \
            "Name=ServiceName,Value=$svc_name Name=ClusterName,Value=$CLUSTER_NAME" \
            "%" "ECS Service CPU"
        fetch_metric "AWS/ECS" "MemoryUtilization" "Average" \
            "Name=ServiceName,Value=$svc_name Name=ClusterName,Value=$CLUSTER_NAME" \
            "%" "ECS Service Memory"
    fi

    if [[ -n "$alb_suffix" && "$alb_suffix" != "None" ]]; then
        fetch_metric "AWS/ApplicationELB" "RequestCount" "Sum" \
            "Name=LoadBalancer,Value=$alb_suffix" \
            "" "ALB Requests/min"
        fetch_metric "AWS/ApplicationELB" "TargetResponseTime" "Average" \
            "Name=LoadBalancer,Value=$alb_suffix" \
            "s" "ALB Response Time"
        fetch_metric "AWS/ApplicationELB" "HTTPCode_Target_5XX_Count" "Sum" \
            "Name=LoadBalancer,Value=$alb_suffix" \
            "" "ALB 5xx Errors"
    fi
}

# ============================================================
# 9. CloudWatch 알람 전체 목록
# ============================================================
show_alarms() {
    section "CloudWatch Alarms"

    aws cloudwatch describe-alarms \
        --region "$AWS_REGION" \
        --output json 2>/dev/null | py "
import json, sys
alarms = json.load(sys.stdin)['MetricAlarms']
if not alarms:
    print('  ${DIM}알람 없음${NC}')
    sys.exit()

# 상태별 그룹
states = {'ALARM': [], 'OK': [], 'INSUFFICIENT_DATA': []}
for a in alarms:
    states[a['StateValue']].append(a['AlarmName'])

for name in states['ALARM']:
    print(f'  ${RED}● ALARM${NC}             {name}')
for name in states['INSUFFICIENT_DATA']:
    print(f'  ${YLW}● DATA없음${NC}         {name}')
for name in states['OK']:
    print(f'  ${GRN}● OK${NC}                {name}')
"
}

# ============================================================
# 10. 최근 CodeDeploy 배포 이력
# ============================================================
show_recent_deploys() {
    section "Recent Deployments (last 3)"

    local app_name="focus-tracking-platform-dev-codedeploy-app"
    local deploys
    deploys=$(aws deploy list-deployments \
        --application-name "$app_name" \
        --region "$AWS_REGION" \
        --query 'deployments[:3]' \
        --output text 2>/dev/null || echo "")

    if [[ -z "$deploys" || "$deploys" == "None" ]]; then
        echo "  ${DIM}배포 이력 없음${NC}"
        return
    fi

    for dep_id in $deploys; do
        aws deploy get-deployment \
            --deployment-id "$dep_id" \
            --region "$AWS_REGION" \
            --output json 2>/dev/null | py "
import json, sys
d = json.load(sys.stdin)['deploymentInfo']
status = d['status']
created = d['createTime'][:19].replace('T', ' ')
duration = ''
if d.get('completeTime'):
    from datetime import datetime
    c = datetime.fromisoformat(d['createTime'].replace('Z', '+00:00'))
    e = datetime.fromisoformat(d['completeTime'].replace('Z', '+00:00'))
    secs = int((e-c).total_seconds())
    duration = f'{secs//60}m {secs%60}s'

sc = {'Succeeded':'${GRN}', 'Failed':'${RED}', 'Stopped':'${RED}'}.get(status, '${YLW}')
print(f'  {sc}● {status:<11}${NC} {d[\"deploymentId\"]}  {created}  ${DIM}{duration}${NC}')
"
    done
}

# ============================================================
# 11. 빠른 액션 명령
# ============================================================
show_footer() {
    echo
    hr
    echo "${DIM}Quick Actions:${NC}"
    echo "  ${DIM}로그 실시간:${NC}    aws logs tail /ecs/focus-tracking-platform-dev --follow --region $AWS_REGION"
    echo "  ${DIM}Task 접속:${NC}     aws ecs execute-command --cluster $CLUSTER_NAME --task <ID> --command bash --interactive"
    echo "  ${DIM}전체 새로고침:${NC}  ./scripts/monitoring.sh --watch"
    echo
}

# ============================================================
# Main
# ============================================================

run_once() {
    show_header
    show_alerts
    show_ecs_service
    show_deployment
    show_compute
    show_tasks
    show_alb
    show_metrics
    show_alarms
    show_recent_deploys
    show_footer
}

if [[ $WATCH -eq 1 ]]; then
    while true; do
        run_once
        echo "${DIM}30초 후 자동 갱신... (Ctrl+C로 종료)${NC}"
        sleep 30
    done
else
    run_once
fi