# 🎯 Focus Tracking Platform

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-ECS%20Fargate-FF9900?logo=amazonaws&logoColor=white)
![Terraform](https://img.shields.io/badge/IaC-Terraform-7B42BC?logo=terraform&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

> **웹캠만으로 학습 집중도를 실시간 분석하는 풀스택 플랫폼.**
> WebGazer.js 시선 추적과 FacePhys ONNX 기반 원격 심박수 측정(rPPG)을 결합해
> 분 단위 집중도를 계산하고, AWS Bedrock(Claude)으로 학습 습관 피드백까지 제공합니다.
>
> 🌐 **서비스**: [study-room.click](https://study-room.click)

---

## 📋 목차

- [주요 기능](#-주요-기능)
- [아키텍처 개요](#️-아키텍처-개요)
- [기술 스택](#-기술-스택)
- [모노레포 구조](#-모노레포-구조)
- [로컬 개발 환경](#-로컬-개발-환경)
- [환경 변수](#-환경-변수)
- [API 개요](#-api-개요)
- [FacePhys rPPG 심박수 측정](#-facephys-rppg-심박수-측정)
- [배포 & CI/CD](#️-배포--cicd)
- [모니터링](#-모니터링)
- [기여](#-기여)
- [라이선스](#-라이선스)

---

## ✨ 주요 기능

| 기능 | 설명 |
| --- | --- |
| 🎯 **실시간 시선 추적** | WebGazer.js 기반 웹캠 시선 감지 + 캘리브레이션, 시선 히트맵 생성 |
| 🫀 **원격 심박수 측정 (rPPG)** | FacePhys ONNX 모델로 웹캠 영상에서 BPM 추정 (`onnxruntime-node`, 서버 추론) |
| 📊 **분 단위 집중도 분석** | 시선 이탈률 + 심박/rPPG 추세를 결합해 `focus_score`·집중 상태·추세 산출 |
| 🤖 **AI 학습 피드백** | 분석 결과를 AWS Bedrock **Claude Sonnet 4.5**로 요약한 자연어 학습 습관 피드백 |
| 👥 **실시간 학습 룸** | WebRTC 시그널링 기반 룸 생성·초대·매칭, 참가자 하트비트 |
| 🏆 **랭킹** | 집중 결과 기반 사용자 랭킹 |
| 🔐 **Google OAuth 인증** | Google OAuth 2.0 로그인 + 자체 세션(`AUTH_SECRET`) |

---

## 🏗️ 아키텍처 개요

서울 리전(`ap-northeast-2`)의 2-AZ VPC 위에 **ECS Fargate(앱) + EC2(ML/Redis) + RDS PostgreSQL** 로 구성되어 있습니다.
인프라 상세(서브넷·보안그룹·배포·관측성)와 전체 다이어그램은 **[인프라 문서 → `terraform/README.md`](terraform/README.md)** 를 참고하세요.

```mermaid
flowchart LR
    user["👤 사용자<br/>브라우저 + 웹캠"]

    subgraph edge["DNS / 엣지"]
        r53["Route 53<br/>study-room.click"]
        alb["ALB · HTTPS(443)"]
    end

    subgraph appt["애플리케이션 · ECS Fargate"]
        next["Next.js 앱<br/>프론트엔드 + API :3000<br/>FacePhys ONNX 추론"]
    end

    subgraph datat["ML / 데이터"]
        fastapi["FastAPI ML 서비스<br/>(EC2) :8000"]
        redis[("Redis :6379<br/>실시간 추적 스트림")]
        rds[("PostgreSQL<br/>RDS · Multi-AZ")]
    end

    bedrock["AWS Bedrock<br/>Claude Sonnet 4.5"]

    user -->|HTTPS| r53 --> alb --> next
    next -->|영속 데이터| rds
    next -->|초 단위 추적 기록| redis
    next -->|POST /analyze| fastapi
    fastapi -->|세션 데이터 read| redis
    fastapi -->|학습 피드백 생성| bedrock
```

### 집중도 분석 데이터 흐름

```mermaid
sequenceDiagram
    autonumber
    participant B as 브라우저
    participant N as Next.js (Fargate)
    participant R as Redis (ML EC2)
    participant M as FastAPI ML (EC2)
    participant D as Bedrock (Claude)
    participant P as PostgreSQL (RDS)

    B->>N: 웹캠 프레임(rPPG) + 시선 좌표
    N->>N: FacePhys ONNX 추론 → BPM
    N->>R: 초 단위 추적 데이터 기록(Stream)
    Note over B,N: 학습 세션 종료 → 분석 요청
    N->>M: POST /analyze (userId, sessionId)
    M->>R: 세션 기록 조회
    M->>M: 분 단위 집중도 계산(focus score/state/trend)
    M->>D: 학습 습관 피드백 생성
    D-->>M: 자연어 피드백
    M-->>N: 분석 결과 + 피드백 + 시선 히트맵
    N->>P: 결과 저장
    N-->>B: 대시보드 / 결과 시각화
```

---

## 🧰 기술 스택

### 프론트엔드 + 백엔드 (`backend/` · 단일 Next.js 컨테이너)

| 영역 | 사용 기술 |
| --- | --- |
| 프레임워크 | **Next.js 16.2** (App Router, API Routes), **React 19.2** |
| 언어/스타일 | TypeScript 5, Tailwind CSS 4 |
| 시선 추적 | WebGazer.js |
| 심박수 추론 | `onnxruntime-node` + FacePhys ONNX 모델 (서버 사이드) |
| DB 접근 | **Drizzle ORM** + `pg` (PostgreSQL) |
| 캐시/스트림 | Redis (실시간 추적 데이터, Redis Streams) |
| 인증 | Google OAuth 2.0 |

### ML 분석 서비스 (`ml-service/` · Python)

| 영역 | 사용 기술 |
| --- | --- |
| API | **FastAPI** + Uvicorn |
| 데이터 처리 | Pandas, NumPy |
| 저장소 연동 | `redis-py` (asyncio) |
| LLM 피드백 | `boto3` → **AWS Bedrock (Claude Sonnet 4.5)** |

### 인프라 / 운영

| 영역 | 사용 기술 |
| --- | --- |
| 컨테이너 오케스트레이션 | **AWS ECS Fargate** (앱), EC2(ML 서비스 + Redis) |
| 로드밸런싱/DNS/TLS | ALB, Route 53, ACM |
| 데이터베이스 | RDS for PostgreSQL (Multi-AZ) |
| 레지스트리/배포 | ECR, **CodeDeploy Blue/Green** |
| IaC | **Terraform** (S3 + DynamoDB 원격 상태) |
| CI/CD | GitHub Actions (OIDC, 정적 키 없음) |
| 관측성 | CloudWatch(로그·알람), SNS, **Datadog** |

> 자세한 인프라 구성은 **[`terraform/README.md`](terraform/README.md)** 참고.

---

## 📁 모노레포 구조

```text
focus-tracking-platform/
├── backend/                     # Next.js 앱 (프론트엔드 + API) — ECS Fargate 배포
│   ├── src/
│   │   ├── app/                 # App Router 페이지 + API Routes
│   │   │   ├── api/             # auth · rppg · rooms · tracking · ranking · heartrate · pair · health
│   │   │   ├── dashboard/  room/  tracker/  result/
│   │   │   └── page.tsx
│   │   ├── components/          # WebcamView, GazeDashboard, 캘리브레이션 등
│   │   ├── hooks/               # useRPPG, useRollingHeartRateAverage, useConcentrationData …
│   │   ├── lib/                 # auth, db(Drizzle), redisStream, facephys/*
│   │   └── types/
│   ├── facephys/weights/        # FacePhys ONNX 모델 가중치
│   ├── drizzle.config.ts        # Drizzle 마이그레이션 설정
│   └── Dockerfile               # ARM64 이미지
│
├── ml-service/                  # Python FastAPI 집중도 분석 — EC2(docker compose) 배포
│   ├── src/
│   │   ├── main.py              # FastAPI 진입점 (/analyze, /health)
│   │   ├── inference.py         # 세션 분석 로직
│   │   ├── preprocessing.py     # 분 단위 피처 가공
│   │   ├── model.py / params.py # 집중도 모델 · 설정
│   │   └── llm_feedback.py      # Bedrock(Claude) 피드백 생성
│   ├── docker-compose.yml       # ml-service + redis
│   └── Dockerfile
│
├── terraform/                   # AWS 인프라 (IaC) — 상세: terraform/README.md
│   ├── bootstrap/               # 원격 상태용 S3 + DynamoDB
│   └── environments/dev/        # 00_outputs ~ 26_postgres_rds (+ Datadog)
│
├── .github/workflows/           # backend.yml · ml-service.yml · terraform.yml
├── scripts/                     # checkov.sh(IaC 보안 스캔) · monitoring.sh
├── appspec.yaml                 # CodeDeploy(ECS) 정의
└── README.md
```

---

## 💻 로컬 개발 환경

### 필수 요구사항

- Node.js 20+
- Python 3.10+
- Docker & Docker Compose
- 로컬 또는 원격 PostgreSQL 13+ / Redis 6+

### 1) 저장소 클론

```bash
git clone https://github.com/ICE-6141/focus-tracking-platform.git
cd focus-tracking-platform
```

### 2) 백엔드(Next.js) 실행

```bash
cd backend
npm install            # onnxruntime-node 네이티브 의존성 때문에 ci/install 권장
cp .env.example .env.local   # 값 채우기 (아래 환경 변수 참고)
npm run db:migrate     # Drizzle 마이그레이션 (DATABASE_URL 필요)
npm run dev            # http://localhost:3000
```

### 3) ML 서비스 실행

```bash
cd ml-service
docker compose up -d   # FastAPI(:8000) + Redis(:6379) 동시 기동
# 또는 직접:
# pip install -r requirements.txt && uvicorn src.main:app --reload
```

> ML 서비스의 `/analyze`는 Redis에 쌓인 세션 데이터를 읽어 분석합니다.
> 백엔드와 ML 서비스가 **같은 Redis** 를 보도록 `REDIS_HOST`/`REDIS_PORT`를 맞춰주세요.

---

## 🔑 환경 변수

### 백엔드 (`backend/.env.local`)

```bash
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
AUTH_SECRET=
APP_URL=http://localhost:3000

# PostgreSQL (Drizzle & 앱 공용) — 예: postgres://user:pass@host:5432/db?sslmode=require
DATABASE_URL=
DATABASE_POOL_MAX=10
DATABASE_POOL_IDLE_MS=30000

# Redis (실시간 추적 스트림)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_STREAM_MAXLEN=10800

# ML 서비스
ML_SERVICE_URL=http://localhost:8000

# WebRTC ICE 서버
# 서로 다른 네트워크/NAT 환경의 화상 연결에는 TURN 서버를 함께 설정하세요.
RTC_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]'
```

> 운영 환경에서는 `DB_PASSWORD`를 **Secrets Manager**(RDS 관리형 시크릿)에서 주입하며,
> 나머지 시크릿은 GitHub Actions Secrets → ECS Task Definition으로 전달됩니다.

### ML 서비스 (Bedrock)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `REDIS_HOST` / `REDIS_PORT` | `redis` / `6379` | 세션 데이터 소스 |
| `BEDROCK_REGION` | `ap-northeast-2` | Bedrock 리전 |
| `BEDROCK_MODEL_ID` | `global.anthropic.claude-sonnet-4-5-...` | 피드백 생성 모델 |
| `BEDROCK_MAX_OUTPUT_TOKENS` / `BEDROCK_TEMPERATURE` | `700` / `0.2` | 출력 제어 |

---

## 🔌 API 개요

### 백엔드 (Next.js API Routes, `/api/*`)

| 그룹 | 엔드포인트 | 역할 |
| --- | --- | --- |
| 인증 | `auth/login`, `auth/callback`, `auth/logout`, `auth/me` | Google OAuth 로그인/세션 |
| 사용자 | `me/settings` | 사용자 설정 |
| rPPG | `rppg/session`, `rppg/frame`, `rppg/health` | 웹캠 프레임 → FacePhys 추론 → BPM |
| 심박수 | `heartrate` | 심박수 스트리밍 |
| 추적 | `tracking/sessions`, `tracking/stream`, `tracking/jobs[/:id]` | 학습 세션·스트림·분석 잡 |
| 룸 | `rooms/match`, `rooms/invite`, `rooms/signal`, `rooms/events`, `rooms/heartbeat`, `rooms/leave` | 실시간 룸/WebRTC 시그널링 |
| 페어링 | `pair/generate`, `pair/status`, `pair/current` | 기기 페어링 |
| 랭킹 | `ranking`, `ranking/me` | 집중 랭킹 |
| 헬스 | `health` | ALB 헬스체크 (`/api/health`) |

### ML 서비스 (FastAPI)

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/health` | 헬스체크 |
| `POST` | `/analyze` | 세션 분 단위 집중도 분석 + (옵션) Bedrock 피드백 |
| `DELETE` | `/sessions/{user_id}/{session_id}/records` | Redis 세션 기록 삭제 |

---

## 🫀 FacePhys rPPG 심박수 측정

웹캠 영상에서 원격 광용적맥파(rPPG, Remote Photoplethysmography)를 추출해 **하드웨어 없이 심박수**를 추정합니다.

- **모델**: FacePhys ONNX (`backend/facephys/weights/`), `onnxruntime-node`로 **서버 사이드** 추론
- **입력**: 36×36×3 RGB 프레임 (15–30 FPS)
- **출력**: BPM, rPPG 파형, 신호 강도
- **흐름**: 브라우저 프레임 캡처 → `POST /api/rppg/frame` → ONNX 추론 → BPM → 실시간 시각화

---

## ☁️ 배포 & CI/CD

GitHub Actions(모두 **OIDC 인증**, 정적 키 미사용, `ap-northeast-2`)에서 경로 기반으로 트리거됩니다.

```mermaid
flowchart LR
    push["git push → main"]

    subgraph be["backend/** 변경"]
        b1["ARM64 빌드"] --> b2["ECR push"] --> b3["Task Def 렌더"] --> b4["CodeDeploy<br/>Blue/Green → Fargate"]
    end
    subgraph mls["ml-service/** 변경"]
        m1["ARM64 빌드"] --> m2["ECR push"] --> m3["SSM RunCommand<br/>→ EC2 docker compose"]
    end
    subgraph tf["terraform/** 변경"]
        t1["fmt → init"] --> t2["plan"] --> t3["apply (main)"]
    end

    push --> be
    push --> mls
    push --> tf
```

| 워크플로 | 트리거 경로 | 동작 |
| --- | --- | --- |
| `backend.yml` | `backend/**`, `appspec.yaml` | ARM64 이미지 빌드 → ECR → ECS Task Definition 렌더 → **CodeDeploy Blue/Green** 배포 |
| `ml-service.yml` | `ml-service/**` | ARM64 이미지 빌드 → ECR → **SSM Run Command** 로 ML EC2에서 `docker compose up` |
| `terraform.yml` | `terraform/environments/dev/**` | `fmt -check` → `init` → `plan` → `apply`(main) |

> 배포 전략·롤백·인프라 적용 절차는 **[`terraform/README.md`](terraform/README.md)** 에 자세히 정리되어 있습니다.

---

## 📈 모니터링

- **CloudWatch Alarms → SNS(이메일)**: ALB 5xx 급증, ECS 실행 Task 부족, ECS CPU 80%↑, ALB 응답시간 2초↑
- **로그**: ECS 앱 로그(CloudWatch) → Firehose → S3 장기 보관(GZIP, 날짜 파티션), VPC Flow Logs(REJECT), RDS 로그
- **Datadog**: AWS 통합(메트릭·트레이스·로그 포워딩, CSPM)
- **ALB Access Logs**: S3 보관(라이프사이클: 30일 후 Glacier IR, 90일 만료)

```bash
# ECS 앱 로그 실시간 확인
aws logs tail /ecs/focus-tracking-platform-dev --follow --region ap-northeast-2
```

---

## 🤝 기여

1. Feature 브랜치 생성: `git checkout -b feature/foo` (버그는 `fix/foo`)
2. 변경 + 테스트, **Conventional Commits** 사용
3. Pull Request 생성 → 리뷰 → `main` 병합 (경로별 워크플로가 자동 배포)

## 📄 라이선스

[MIT](LICENSE) 라이선스 하에 배포됩니다.

---

**팀**: ICE-6141 · **리전**: AWS `ap-northeast-2` (Seoul) · **마지막 업데이트**: 2026년 6월
