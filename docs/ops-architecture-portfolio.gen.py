# -*- coding: utf-8 -*-
"""Focus Tracking Platform — 운영 구조 면접 포트폴리오 PDF 생성기."""
from weasyprint import HTML

CSS = """
@page {
  size: A4;
  margin: 16mm 15mm 18mm 15mm;
  @bottom-center {
    content: "Focus Tracking Platform · 운영 아키텍처 포트폴리오";
    font-family: 'NanumGothic'; font-size: 7.5pt; color: #9aa3b2;
  }
  @bottom-right {
    content: counter(page) " / " counter(pages);
    font-family: 'NanumGothic'; font-size: 7.5pt; color: #9aa3b2;
  }
}
@page :first { margin: 0; }

* { box-sizing: border-box; }
body { font-family: 'NanumGothic', sans-serif; color: #1f2733; font-size: 9.7pt; line-height: 1.55; margin: 0; }

/* ---------- COVER ---------- */
.cover {
  height: 297mm; width: 210mm;
  background: linear-gradient(150deg, #0f1b3d 0%, #16306b 55%, #1d4ed8 100%);
  color: #fff; padding: 30mm 24mm; position: relative;
}
.cover .kicker { font-size: 11pt; letter-spacing: 3px; color: #8ec5ff; font-weight: 700; }
.cover h1 { font-size: 33pt; line-height: 1.18; margin: 14mm 0 6mm; font-family:'NanumSquare'; font-weight: 800; }
.cover .sub { font-size: 12.5pt; color: #c9d8ff; line-height: 1.7; max-width: 150mm; }
.cover .tags { margin-top: 16mm; }
.cover .tag {
  display: inline-block; border: 1px solid rgba(255,255,255,.35); border-radius: 20px;
  padding: 5px 14px; margin: 0 7px 9px 0; font-size: 9.5pt; color: #eaf1ff;
}
.cover .footer {
  position: absolute; bottom: 26mm; left: 24mm; right: 24mm;
  border-top: 1px solid rgba(255,255,255,.22); padding-top: 7mm;
  font-size: 9.5pt; color: #b9c8ec; display: flex; justify-content: space-between;
}
.cover .pill {
  position:absolute; top: 30mm; right: 24mm; background: rgba(255,255,255,.12);
  border:1px solid rgba(255,255,255,.3); border-radius: 10px; padding: 9px 14px;
  font-size: 8.6pt; color:#dce8ff; text-align:right; line-height:1.6;
}

/* ---------- SECTIONS ---------- */
h2.sec {
  font-family:'NanumSquare'; font-weight: 800; font-size: 16pt; color: #16306b;
  margin: 0 0 2mm; padding-bottom: 2.5mm; border-bottom: 2.5px solid #1d4ed8;
}
h2.sec .no { color:#1d4ed8; margin-right: 7px; }
.lead { color:#54606f; font-size: 9.4pt; margin: 0 0 4mm; }
.page-break { break-before: page; }

h3 { font-family:'NanumSquare'; font-weight:700; font-size: 11pt; color:#1b2740; margin: 5mm 0 2mm; }

/* cards */
.cards { display: flex; flex-wrap: wrap; gap: 4mm; margin: 3mm 0; }
.card {
  border: 1px solid #e3e8f0; border-radius: 9px; padding: 4mm 4.5mm; background:#fbfcfe;
  flex: 1 1 0;
}
.card .ico { font-size: 13pt; }
.card .ct { font-weight: 800; color:#16306b; font-size: 10pt; margin: 1mm 0; font-family:'NanumSquare'; }
.card .cd { font-size: 8.7pt; color:#56616f; line-height:1.5; }

.kpis { display:flex; gap:4mm; margin: 3mm 0 1mm; }
.kpi { flex:1; background:#16306b; color:#fff; border-radius:9px; padding:4mm; text-align:center; }
.kpi .v { font-size: 18pt; font-weight:800; font-family:'NanumSquare'; color:#8ec5ff; line-height:1.1; }
.kpi .l { font-size: 8.2pt; color:#cdd9f3; margin-top:1.5mm; }

table { width:100%; border-collapse: collapse; margin: 2.5mm 0; font-size: 8.8pt; }
th { background:#16306b; color:#fff; text-align:left; padding: 2.6mm 3mm; font-weight:700; }
td { padding: 2.4mm 3mm; border-bottom: 1px solid #e6eaf1; vertical-align: top; }
tr:nth-child(even) td { background:#f7f9fc; }
td.mono, .mono { font-family:'NanumGothicCoding','NanumGothic'; }
.thr { color:#c2410c; font-weight:700; }

.callout {
  border-left: 4px solid #1d4ed8; background:#eef4ff; border-radius: 0 8px 8px 0;
  padding: 3mm 4mm; margin: 3mm 0; font-size: 8.9pt; color:#1b3a72;
}
.callout b { color:#0f2a5c; }
.flow {
  background:#0f1b3d; color:#cfe0ff; border-radius:8px; padding: 3mm 4mm; margin:3mm 0;
  font-family:'NanumGothicCoding','NanumGothic'; font-size: 8.6pt; line-height:1.7;
}
.flow .ar { color:#8ec5ff; }

/* Q&A */
.qa { border:1px solid #e3e8f0; border-radius:9px; margin:3mm 0; overflow:hidden; }
.qa .q { background:#16306b; color:#fff; padding: 3mm 4mm; font-weight:700; font-size:9.5pt; }
.qa .q .qm { color:#8ec5ff; margin-right:6px; }
.qa .a { padding: 3mm 4mm; font-size: 8.9pt; color:#28323f; line-height:1.6; }
.qa .a b { color:#16306b; }

.tradeoff td:first-child { color:#c2410c; font-weight:700; white-space:nowrap; }
.note { font-size: 8pt; color:#8a93a2; margin-top: 2mm; font-style: italic; }
ul.tight { margin: 1mm 0 2mm; padding-left: 5mm; }
ul.tight li { margin-bottom: 1.3mm; font-size: 8.9pt; }
.tag-mini { display:inline-block; background:#e8eefc; color:#1d4ed8; border-radius:5px; padding:1px 7px; font-size:7.8pt; font-weight:700; margin-right:4px;}
"""

cover = """
<div class="cover">
  <div class="pill">개인/팀 프로젝트 · dev 환경<br>AWS ap-northeast-2 (Seoul)<br>Terraform IaC</div>
  <div class="kicker">OPERATIONS &amp; INFRASTRUCTURE</div>
  <h1>운영을 염두에 두고<br>설계한 클라우드 인프라</h1>
  <div class="sub">
    Focus Tracking Platform — 웹캠 기반 학습 집중도 분석 풀스택 서비스.<br>
    대규모 트래픽 경험 대신 <b style="color:#fff">관측성 · 자동화 · 배포 안정성 · 비용 최적화 · 보안</b>을
    코드(IaC)로 직접 구축하며 "운영이 굴러가는 구조"를 설계한 기록입니다.
  </div>
  <div class="tags">
    <span class="tag">CloudWatch Alarms → SNS</span>
    <span class="tag">Datadog → Slack (Composite)</span>
    <span class="tag">EventBridge / Auto Scaling 스케줄러</span>
    <span class="tag">CodeDeploy Blue/Green</span>
    <span class="tag">Firehose → S3 로그 파이프라인</span>
    <span class="tag">GitHub OIDC · 최소권한 IAM</span>
  </div>
  <div class="footer">
    <div>study-room.click · ICE-6141</div>
    <div>면접용 운영 아키텍처 요약 · 2026.06</div>
  </div>
</div>
"""

# ---------- PAGE 1: 한눈에 보기 ----------
overview = """
<h2 class="sec"><span class="no">01</span>운영 한눈에 보기</h2>
<p class="lead">"기능을 만든 것"을 넘어, 배포 후에도 <b>스스로 감시·복구·절감되는 구조</b>를 5개 축으로 코드화했습니다.
모든 항목은 Terraform으로 정의되어 재현·리뷰 가능합니다.</p>

<div class="kpis">
  <div class="kpi"><div class="v">5축</div><div class="l">관측성·자동화·배포·비용·보안</div></div>
  <div class="kpi"><div class="v">4종</div><div class="l">CloudWatch 알람 → SNS</div></div>
  <div class="kpi"><div class="v">2채널</div><div class="l">SNS(이메일)·Datadog(Slack)</div></div>
  <div class="kpi"><div class="v">~11h</div><div class="l">야간 컴퓨팅 정지(22→09시)</div></div>
</div>

<div class="cards">
  <div class="card"><div class="ico">📊</div><div class="ct">관측성</div>
    <div class="cd">CloudWatch 메트릭·알람, Datadog 통합 대시보드/트레이스, 로그 장기보관 파이프라인까지 3계층.</div></div>
  <div class="card"><div class="ico">⚙️</div><div class="ct">자동화</div>
    <div class="cd">CPU 기반 오토스케일링 + 야간 비용절감 스케줄러(Fargate·EC2)를 시간/부하 트리거로 운영.</div></div>
  <div class="card"><div class="ico">🚀</div><div class="ct">배포 안정성</div>
    <div class="cd">CodeDeploy Blue/Green · 헬스체크 통과 후 전환 · 실패 시 자동 롤백.</div></div>
</div>
<div class="cards">
  <div class="card"><div class="ico">💰</div><div class="ct">비용 최적화</div>
    <div class="cd">야간 스케줄러·ARM(Graviton)·단일 NAT·라이프사이클 등 트레이드오프를 의식한 결정.</div></div>
  <div class="card"><div class="ico">🔐</div><div class="ct">보안</div>
    <div class="cd">GitHub OIDC(정적키 없음)·Secrets Manager·서비스별 최소권한 IAM·전 구간 암호화.</div></div>
  <div class="card"><div class="ico">🧱</div><div class="ct">IaC</div>
    <div class="cd">전 인프라 Terraform 코드화, S3+DynamoDB 원격 상태, checkov 보안 스캔.</div></div>
</div>

<div class="callout">
  <b>이 문서의 솔직한 전제 —</b> 실 서비스의 대규모 트래픽을 받아본 경험은 없습니다.
  대신 "트래픽이 왔을 때 자동으로 대응·감시·복구·절감되도록" 운영 구조를 <b>먼저 설계</b>했고,
  각 수치(임계값·쿨다운·스케줄)를 <b>왜 그렇게 정했는지 근거</b>를 설명할 수 있는 것을 강점으로 삼습니다.
</div>
"""

# ---------- PAGE 2: 관측성 ----------
observability = """
<div class="page-break"></div>
<h2 class="sec"><span class="no">02</span>관측성 (Observability) — 3계층</h2>
<p class="lead">"지표 → 알람 → 로그"를 분리해 구성했습니다. 즉각 통지가 필요한 신호와, 사후 분석을 위한 장기 보관을 분리합니다.</p>

<h3>① CloudWatch Alarms → SNS(이메일)</h3>
<table>
  <tr><th>알람</th><th>조건 (임계값)</th><th>의도</th></tr>
  <tr><td>ALB 5xx 급증</td><td class="mono thr">5xx &gt; 10 / 1분 (2회 평가)</td><td>백엔드 오류 폭증 감지</td></tr>
  <tr><td>ECS Task 부족</td><td class="mono thr">RunningTaskCount &lt; 1</td><td>서비스 다운 즉시 인지 (missing=breaching)</td></tr>
  <tr><td>ECS CPU 과부하</td><td class="mono thr">평균 CPU &gt; 80% / 3분</td><td>스케일아웃 한계·이상 부하</td></tr>
  <tr><td>ALB 응답 지연</td><td class="mono thr">평균 응답 &gt; 2초 / 3분</td><td>사용자 체감 성능 저하</td></tr>
</table>

<h3>② Datadog → Slack : Composite 모니터 (노이즈 억제 설계)</h3>
<p class="lead" style="margin-bottom:2mm">ML 서비스가 올라간 <b>t4g.small(버스터블)</b>의 함정 — CPU 크레딧이 소진되면 CPU%가 낮아 보여도
baseline으로 <b>스로틀링</b>되어 추론이 느려집니다. 단일 지표로는 못 잡습니다.</p>
<div class="flow">
  [입력 A] CPU 사용률 &gt; 80% (5분)  <span class="ar">━━AND━━▶</span>  [Composite] 스로틀링 위험<br>
  [입력 B] CPU 크레딧 잔량 &lt; 50 (10분)  <span class="ar">━━━━━━━▶</span>  🔥 Slack #focus-alerts 통지
</div>
<div class="callout">
  입력 모니터 2개는 <b>단독으로 알림을 보내지 않고</b>, 두 신호가 <b>동시(AND)</b>일 때만 Composite가 Slack을 울립니다.
  → "부하도 높고 크레딧도 바닥난 진짜 위험"만 통지해 <b>알람 피로(중복/노이즈)를 억제</b>한 설계입니다.
</div>

<h3>③ 로그 파이프라인 — 실시간 조회 + 장기 보관 분리</h3>
<div class="flow">
  ECS 앱 로그 <span class="ar">▶</span> CloudWatch Logs <span class="ar">▶</span> Subscription Filter
  <span class="ar">▶</span> Kinesis Firehose <span class="ar">▶</span> S3 (GZIP · year/month/day 파티션)
</div>
<ul class="tight">
  <li><span class="tag-mini">버퍼링</span> 5MB 또는 300초 단위 flush, GZIP 압축으로 저장 비용 절감</li>
  <li><span class="tag-mini">ALB Access Logs</span> S3 직접 저장 · 라이프사이클(30일→Glacier IR, 90일 만료)</li>
  <li><span class="tag-mini">VPC Flow Logs</span> REJECT 트래픽만 수집 → 침해 탐지 핵심만 남기고 로그량 절감</li>
  <li><span class="tag-mini">Container Insights</span> ECS 컨테이너 단위 메트릭 활성화</li>
</ul>
<p class="note">※ Amazon Managed Grafana도 구성(grafana.tf)했으나, 도구를 늘리면 운영 복잡도·비용이 커져 Datadog로 일원화하고 비활성화 — "추가"가 아니라 "정리"한 운영 결정.</p>
"""

# ---------- PAGE 3: 자동화 & 스케줄링 ----------
automation = """
<div class="page-break"></div>
<h2 class="sec"><span class="no">03</span>자동화 &amp; 스케줄링</h2>
<p class="lead">부하 기반(오토스케일링)과 시간 기반(스케줄러) 자동화를 함께 운용합니다.</p>

<h3>① ECS Fargate 오토스케일링 — CPU Target Tracking</h3>
<table>
  <tr><th>항목</th><th>값</th><th>근거</th></tr>
  <tr><td>대상 지표</td><td class="mono">ECSServiceAverageCPUUtilization</td><td>Task 예약 CPU 대비 평균</td></tr>
  <tr><td>목표값</td><td class="mono thr">75%</td><td>스케일 반영까지 2~3분 지연 → 그 사이 ~25% 버퍼 확보</td></tr>
  <tr><td>범위</td><td class="mono">Task 1 → 2</td><td>최소 1(가용성), Fargate라 EC2 자리 제약 없음</td></tr>
  <tr><td>scale-out 쿨다운</td><td class="mono">60초</td><td>부하 급증에 빠르게 대응</td></tr>
  <tr><td>scale-in 쿨다운</td><td class="mono">300초</td><td>줄였다 늘리는 <b>플래핑 방지</b></td></tr>
</table>
<div class="callout">Fargate는 EC2 t4g 같은 CPU 크레딧/baseline 개념이 없어(요청한 vCPU를 그대로 받음) 목표값을 보수적으로 낮출 이유가 없습니다. → <b>플랫폼 특성에 맞춰 임계값을 선택</b>한 사례.</div>

<h3>② 야간 비용 절감 스케줄러 (dev) — 컴퓨팅을 0으로</h3>
<p class="lead" style="margin-bottom:2mm">낮에만 개발하므로 <b>22:00 KST 정지 / 09:00 KST 기동</b>. 시각은 코드 한 곳(<span class="mono">local</span>, KST)에서 관리.</p>
<table>
  <tr><th>대상</th><th>방식</th><th>동작</th></tr>
  <tr><td>ECS Fargate</td><td>Auto Scaling <b>Scheduled Action</b></td>
      <td>밤 <span class="mono">min/max=0</span>(Task 0개) → 아침 <span class="mono">min1/max2</span> 복구</td></tr>
  <tr><td>ML EC2</td><td><b>EventBridge Scheduler</b><br>(AWS SDK universal target)</td>
      <td>밤 StopInstances / 아침 StartInstances<br>— <b>Lambda 없이</b> API 직접 호출</td></tr>
</table>
<ul class="tight">
  <li>컨테이너는 <span class="mono">restart: unless-stopped</span> → EC2 부팅 시 자동 복구되어 stop/start만으로 충분</li>
  <li>전용 IAM Role에 <b>해당 ML 인스턴스 ARN 하나만</b> Start/Stop 허용 → 최소 권한</li>
</ul>
<div class="callout"><b>효과</b> — 비업무 시간(약 11시간/일) ECS Task·ML EC2 컴퓨팅 비용 0. "쓰지 않는 자원은 끈다"를 코드로 자동화.</div>
"""

# ---------- PAGE 4: 배포 & 보안 ----------
deploy_sec = """
<div class="page-break"></div>
<h2 class="sec"><span class="no">04</span>배포 안정성 &amp; 보안</h2>

<h3>① CodeDeploy Blue/Green — 무중단 + 자동 롤백</h3>
<div class="flow">
  신버전(Green) Task 기동 <span class="ar">▶</span> ALB 헬스체크 <span class="mono">/api/health</span> 통과
  <span class="ar">▶</span> 트래픽 Blue→Green 전환 <span class="ar">▶</span> 5분 후 Blue 종료<br>
  &nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#ff9b9b">실패 시(DEPLOYMENT_FAILURE) ▶ 자동 롤백 (트래픽 전환 안 함)</span>
</div>
<table>
  <tr><th>항목</th><th>값</th></tr>
  <tr><td>트래픽 제어</td><td class="mono">WITH_TRAFFIC_CONTROL · BLUE_GREEN</td></tr>
  <tr><td>자동 롤백</td><td class="mono">DEPLOYMENT_FAILURE 시</td></tr>
  <tr><td>구버전 보존</td><td class="mono">성공 후 5분 대기 후 TERMINATE</td></tr>
  <tr><td>타깃그룹</td><td class="mono">tg-blue / tg-green (헬스체크 /api/health)</td></tr>
</table>

<h3>② CI/CD — GitHub Actions, 정적 키 없음</h3>
<ul class="tight">
  <li><span class="tag-mini">OIDC</span> 장기 액세스 키 없이 IAM Role을 Assume — 키 유출 위험 제거</li>
  <li><span class="tag-mini">경로 트리거</span> <span class="mono">backend/**</span>→Blue/Green, <span class="mono">ml-service/**</span>→SSM Run Command, <span class="mono">terraform/**</span>→fmt·plan·apply</li>
  <li><span class="tag-mini">ML 배포</span> SSH 미개방, GitHub Actions가 인스턴스를 태그로 찾아 <b>SSM Run Command</b>로 <span class="mono">docker compose up</span></li>
</ul>

<h3>③ 보안 — 최소권한 · 시크릿 · 암호화</h3>
<table>
  <tr><th>영역</th><th>적용</th></tr>
  <tr><td>인증/시크릿</td><td>GitHub OIDC · RDS 비밀번호 <b>Secrets Manager</b> 관리(평문 없음)</td></tr>
  <tr><td>IAM</td><td>서비스별 분리 Role(ecs-task / codedeploy / ml-ec2 / firehose / scheduler) — <b>최소 권한</b></td></tr>
  <tr><td>네트워크 격리</td><td>앱·DB 프라이빗 서브넷, RDS 퍼블릭 차단, ML EC2 SSH 미개방(SSM), IMDSv2 강제</td></tr>
  <tr><td>암호화</td><td>RDS·EBS(gp3)·S3(AES256)·ECR 저장 암호화, ALB TLS 1.3</td></tr>
  <tr><td>IaC 스캔</td><td>checkov로 Terraform 보안 정적 분석</td></tr>
</table>
"""

# ---------- PAGE 5: 비용 + 트레이드오프 + Q&A ----------
cost_qa = """
<div class="page-break"></div>
<h2 class="sec"><span class="no">05</span>비용 최적화 &amp; 트레이드오프 (정직한 한계)</h2>
<p class="lead">"무조건 좋은 구성"이 아니라, dev 환경 제약 안에서 <b>비용과 가용성을 의식적으로 맞바꾼 결정</b>들입니다. 면접에서 트레이드오프를 함께 설명할 수 있는 것이 핵심.</p>
<table class="tradeoff">
  <tr><th>결정</th><th>효과</th><th>맞바꾼 것 (한계)</th></tr>
  <tr><td>야간 스케줄러(dev)</td><td>비업무 시간 컴퓨팅 0</td><td>야간 무중단 불가 — dev라 허용</td></tr>
  <tr><td>단일 NAT Gateway</td><td>NAT 시간/처리 비용 절감</td><td>AZ 장애 시 아웃바운드 단절 (이상적으론 AZ별 2개)</td></tr>
  <tr><td>ARM64 / Graviton</td><td>동급 x86 대비 가격·전력 효율</td><td>일부 x86 전용 바이너리 비호환 가능성</td></tr>
  <tr><td>FE+BE 단일 컨테이너</td><td>Task 수·관리 포인트 축소</td><td>프론트/백 독립 스케일 불가</td></tr>
  <tr><td>RDS PostgreSQL (vs Aurora)</td><td>초기 비용↓</td><td>트래픽 증가 시 Aurora Serverless v2 이전 여지 남김</td></tr>
  <tr><td>Grafana 비활성화</td><td>모니터링 Datadog 일원화</td><td>오픈소스 대시보드 자체 운영 포기</td></tr>
</table>

<h2 class="sec" style="margin-top:7mm"><span class="no">06</span>예상 면접 질문 &amp; 답변 포인트</h2>

<div class="qa">
  <div class="q"><span class="qm">Q.</span>트래픽 경험이 없는데 오토스케일링이 의미가 있나요?</div>
  <div class="a">대규모 트래픽은 못 받아봤지만, <b>CPU 75% 목표값과 쿨다운(out 60s / in 300s)을 직접 정했고 그 이유를 설명</b>할 수 있습니다. 75%는 스케일 반영 지연(2~3분)을 버틸 버퍼, 비대칭 쿨다운은 플래핑 방지 — 수치의 근거를 말할 수 있다는 게 강점입니다.</div>
</div>
<div class="qa">
  <div class="q"><span class="qm">Q.</span>왜 알람을 지표 하나가 아니라 Composite로 묶었나요?</div>
  <div class="a">t4g 버스터블 특성 때문입니다. CPU 크레딧이 소진되면 <b>CPU%는 낮은데 실제로는 스로틀링</b>되는 사각지대가 생깁니다. 그래서 'CPU 높음 AND 크레딧 낮음'을 AND로 묶어 <b>진짜 위험만 Slack 통지</b>하고 노이즈를 줄였습니다.</div>
</div>
<div class="qa">
  <div class="q"><span class="qm">Q.</span>CloudWatch와 Datadog을 둘 다, Grafana는 왜 껐나요?</div>
  <div class="a">CloudWatch는 AWS 네이티브 알람/로그(저비용), Datadog는 통합 대시보드·트레이스·CSPM 담당으로 <b>역할을 분담</b>했습니다. Grafana도 구성해봤지만 도구가 늘면 운영 복잡도·비용이 커져 <b>일원화</b>했습니다 — 운영은 더하는 것뿐 아니라 <b>줄이는 결정</b>도 포함된다고 봅니다.</div>
</div>
<div class="qa">
  <div class="q"><span class="qm">Q.</span>배포 중 장애는 어떻게 막나요?</div>
  <div class="a">Blue/Green으로 신버전이 <b>헬스체크(/api/health)를 통과한 뒤에만</b> 트래픽을 전환하고, 실패하면 자동 롤백, 구버전은 5분간 보존합니다. 사용자 입장에선 무중단입니다.</div>
</div>
<div class="qa">
  <div class="q"><span class="qm">Q.</span>비용은 어떻게 관리했나요?</div>
  <div class="a">dev 야간 스케줄러로 22~09시 컴퓨팅 0, ARM/Graviton, 단일 NAT, ECR(최근 5개)·S3 라이프사이클을 적용했습니다. 각각이 <b>무엇을 절감하고 무엇을 희생하는지</b> 트레이드오프까지 함께 설명할 수 있습니다.</div>
</div>

<div class="callout" style="margin-top:5mm">
  <b>한 줄 정리 —</b> "기능을 배포하는 것"에서 멈추지 않고, 배포 이후에도 <b>감시되고(관측성) · 스스로 대응하며(자동화) · 안전하게 바뀌고(배포) · 새는 비용을 막는(최적화)</b> 운영 구조를 IaC로 직접 설계했습니다. 트래픽 규모 경험은 앞으로 채우되, <b>운영을 시스템으로 사고하는 관점</b>은 이미 갖췄습니다.
</div>
"""

html = "<html><head><meta charset='utf-8'></head><body>" + cover + overview + observability + automation + deploy_sec + cost_qa + "</body></html>"

out = "/home/user/focus-tracking-platform/docs/ops-architecture-portfolio.pdf"
HTML(string=html).write_pdf(out, stylesheets=[__import__('weasyprint').CSS(string=CSS)])
import os
print("PDF generated:", out, os.path.getsize(out), "bytes")
