# Focus Tracking Platform

웹캠 기반 시선 추적과 심박수 측정을 활용한 **실시간 집중도 분석 플랫폼**입니다. WebGazer.js와 FacePhys ONNX 모델을 통해 사용자의 시선 움직임과 심박수를 추적하고, 집중도를 분석하는 엔드-투-엔드 솔루션입니다.

## 📋 목차

- [주요 기능](#주요-기능)
- [기술 스택](#기술-스택)
- [프로젝트 구조](#프로젝트-구조)
- [시작하기](#시작하기)
- [API 문서](#api-문서)
- [배포](#배포)
- [아키텍처](#아키텍처)
- [기여](#기여)
- [라이선스](#라이선스)

## 주요 기능

- **🎯 실시간 시선 추적**: WebGazer.js를 이용한 웹캠 기반 시선 감지 및 캘리브레이션
- **❤️ 심박수 측정**: FacePhys ONNX 모델을 통한 원격 광용적 신호(rPPG) 분석
- **📊 집중도 분석**: 시선 안정성과 심박수 패턴을 기반으로 사용자의 집중도 계산
- **🔄 실시간 대시보드**: 분석 결과를 실시간으로 시각화
- **👥 협업 기능**: 비디오 룸을 통한 다중 사용자 실시간 협업 추적
- **💾 데이터 분석**: AWS 스트림 기반의 대규모 데이터 처리 및 저장
- **🔐 안전한 인증**: OAuth 기반 사용자 인증 및 권한 관리

## 기술 스택

### Frontend
- **Next.js 16.2.1** - React 프레임워크
- **React 19.2.4** - UI 컴포넌트
- **TypeScript** - 타입 안정성
- **Tailwind CSS** - 스타일링
- **WebGazer.js** - 웹캠 기반 시선 추적
- **OpenCV.js** - 컴퓨터 비전 처리

### Backend
- **Next.js API Routes** - Node.js 기반 API 서버
- **ONNX Runtime** - ML 모델 추론 엔진
- **WebSocket** - 실시간 데이터 전송
- **Redis** - 스트림 데이터 처리
- **PostgreSQL** - 데이터 저장소

### ML/Analytics Service
- **FastAPI** - Python 기반 API 서버
- **Scikit-learn** - 머신러닝 알고리즘
- **Pandas/NumPy** - 데이터 처리
- **Redis** - 메시지 브로커

### Infrastructure
- **AWS** - 클라우드 인프라
  - ECS - 컨테이너 오케스트레이션
  - ALB - 로드 밸런싱
  - RDS - 관리형 데이터베이스
  - S3 - 객체 저장소
  - CloudFront - CDN
  - Kinesis - 실시간 스트림 처리
- **Docker** - 컨테이너화
- **Terraform** - Infrastructure as Code

## 프로젝트 구조

```
focus-tracking-platform/
├── backend/                    # Next.js 프론트엔드 & 백엔드 API
│   ├── public/
│   │   ├── haarcascade_frontalface_alt.xml   # Haar Cascade 분류기
│   │   ├── opencv.js                         # OpenCV 라이브러리
│   │   ├── webgazer.js                       # WebGazer 라이브러리
│   │   └── heartbeat.js                      # 하트비트 감지
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                      # 메인 홈페이지 (시선 추적)
│   │   │   ├── dashboard/                    # 대시보드
│   │   │   ├── room/                         # 비디오 룸
│   │   │   ├── tracker/                      # 트래킹 페이지
│   │   │   ├── result/                       # 분석 결과
│   │   │   └── api/
│   │   │       ├── auth/                     # 인증 API
│   │   │       ├── heartrate/                # 심박수 API
│   │   │       ├── pair/                     # 페어링 API
│   │   │       ├── rooms/                    # 룸 관리 API
│   │   │       └── rppg/                     # FacePhys rPPG API
│   │   ├── components/                       # React 컴포넌트
│   │   │   ├── WebcamView.tsx
│   │   │   ├── GazeCalibrationOverlay.tsx
│   │   │   ├── GazeDashboard.tsx
│   │   │   ├── MinuteHeartRateAverageBox.tsx
│   │   │   └── ...
│   │   ├── hooks/                            # Custom React hooks
│   │   │   ├── useConcentrationData.ts
│   │   │   ├── useRollingGazeAverage.ts
│   │   │   ├── useRollingHeartRateAverage.ts
│   │   │   ├── useRPPG.ts
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── auth.ts                       # 인증 로직
│   │   │   ├── db.ts                         # 데이터베이스 연결
│   │   │   ├── redisStream.ts                # Redis 스트림 클라이언트
│   │   │   └── facephys/                     # FacePhys 유틸리티
│   │   │       ├── core.ts
│   │   │       ├── state.ts
│   │   │       ├── rppg.ts
│   │   │       └── server.ts
│   │   └── types/
│   ├── facephys/
│   │   └── weights/
│   │       └── model.onnx                    # FacePhys ONNX 모델
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── ml-service/                 # Python 머신러닝 분석 서비스
│   ├── src/
│   │   ├── main.py                           # FastAPI 서버
│   │   ├── inference.py                      # 추론 엔진
│   │   ├── model.py                          # 모델 정의
│   │   ├── preprocessing.py                  # 데이터 전처리
│   │   ├── params.py                         # 설정
│   │   └── monitoring.py                     # 모니터링
│   ├── Dockerfile
│   ├── requirements.txt
│   └── docker-compose.yml
│
├── terraform/                  # AWS 인프라 코드
│   ├── bootstrap/              # Terraform 상태 저장소 생성
│   │   └── main.tf
│   └── environments/
│       └── dev/                # 개발 환경 설정
│           ├── 00_outputs.tf
│           ├── 01_versions.tf
│           ├── 02_provider.tf
│           ├── 03_variables.tf
│           ├── 04_vpc.tf
│           ├── 05_subnet.tf
│           ├── 06_sg.tf
│           ├── 07_routeTable.tf
│           ├── 08_nacl.tf
│           ├── 09_ec2.tf
│           ├── 10_ecr.tf
│           ├── 11_iam.tf
│           ├── 12_nat.tf
│           ├── 13_ecs.tf
│           ├── 14_codedeploy.tf
│           ├── 15_tg.tf
│           ├── 16_alb.tf
│           ├── 17_route53.tf
│           ├── 18_acm.tf
│           ├── 20_vpc_endpoint.tf
│           ├── 21_logging.tf
│           ├── 22_alarm.tf
│           └── 23_log_export.tf
│
├── scripts/
│   └── monitoring.sh            # 모니터링 스크립트
│
├── appspec.yaml                 # AWS CodeDeploy 설정
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## 시작하기

### 필수 요구사항

- Node.js 20 이상
- Python 3.10 이상
- Docker & Docker Compose
- AWS 계정 (배포 시)
- PostgreSQL 13 이상
- Redis 6 이상

### 로컬 개발 환경 설정

#### 1. 저장소 클론

```bash
git clone https://github.com/ICE-6141/focus-tracking-platform.git
cd focus-tracking-platform
```

#### 2. Backend 설정

```bash
cd backend
npm install
npm run dev
```

백엔드는 `http://localhost:3000`에서 실행됩니다.

**주의사항:**
- `onnxruntime-node`는 native 의존성을 가지므로, 처음 설치 시 `npm install` (또는 `npm ci`)을 사용하세요
- Node.js 20 이상 권장 (ONNX Runtime 호환성)

#### 3. ML Service 설정

```bash
cd ml-service
pip install -r requirements.txt
uvicorn src.main:app --reload
```

ML 서비스는 `http://localhost:8000`에서 실행됩니다.

#### 4. 환경 변수 설정

Backend 루트에 `.env.local` 파일 생성:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/focus_tracking

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# ML Service
ML_SERVICE_URL=http://localhost:8000
```

### 빌드 및 배포

#### Docker Compose로 로컬 실행

```bash
docker-compose up -d
```

#### 운영 환경 배포 (AWS)

```bash
cd terraform/environments/dev
terraform init
terraform plan
terraform apply
```

## API 문서

### 인증 API

#### 로그인

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

#### 현재 사용자 정보

```http
GET /api/auth/me
Authorization: Bearer {token}
```

### 시선 추적 API

#### rPPG 세션 생성

```http
POST /api/rppg/session
Content-Type: application/json

{
  "fps": 15
}
```

**응답:**

```json
{
  "sessionId": "session-uuid-123",
  "fps": 15
}
```

#### Frame 추론 및 BPM 계산

```http
POST /api/rppg/frame
Content-Type: application/json

{
  "sessionId": "session-uuid-123",
  "frame": [0.0, 0.1, 0.2, ...],
  "dims": [36, 36, 3],
  "timestampMs": 1710000000000,
  "fps": 15
}
```

**응답:**

```json
{
  "bpm": 72.5,
  "bpmReady": true,
  "waveform": [0.1, 0.15, 0.2, ...],
  "signal": 0.05
}
```

### 심박수 분석 API

#### 심박수 스트리밍

```http
POST /api/heartrate
WebSocket upgrade

{
  "userId": "user-123",
  "sessionId": "session-123"
}
```

### 룸 관리 API

#### 룸 생성

```http
POST /api/rooms/create
Content-Type: application/json

{
  "name": "Study Room",
  "maxParticipants": 5
}
```

#### 현재 룸 조회

```http
GET /api/rooms/current
Authorization: Bearer {token}
```

### ML 분석 API

#### 집중도 분석 실행

```http
POST /api/analyze
Content-Type: application/json

{
  "userId": "user-123",
  "studySessionId": "session-123",
  "streamKey": "tracking:session-123"
}
```

## 아키텍처

## Architecture Diagram

```mermaid
graph TD
    User["사용자"] --> CF["CloudFront"]
    CF --> S3FE["S3 (정적 프론트엔드)"]
    User --> IGW["Internet Gateway"]

    subgraph "AWS Cloud (VPC)"
        IGW --> ALB["Application Load Balancer"]

        subgraph "Public Subnet (Multi-AZ)"
            ALB
            NAT["NAT Gateway"]
        end

        subgraph "Private App Subnet (Multi-AZ)"
            EC2APP["EC2 App Server (Docker Container)"]
            KDS["Kinesis Data Streams"]
            KDA["Kinesis Data Analytics"]
        end

        subgraph "Private DB Subnet (Multi-AZ)"
            EC2DB["EC2 DB Server"]
        end

        ALB --> EC2APP
        EC2APP --> EC2DB
        EC2APP --> NAT

        KDS --> KDA
        KDA --> S3DATA["S3 (Raw / Processed Data)"]
        EC2APP --> KDS
    end

    NAT --> API1["아이폰 앱 API"]
    NAT --> API2["애플워치 앱 API"]
    NAT --> API3["웹캠 API"]

    GitHub["GitHub Actions"] --> ECR["AWS ECR"]
    ECR --> EC2APP

    Dev["Developer / CI-CD"] --> TF["Terraform"]
    TF --> S3STATE["S3 (Terraform State)"]
    TF --> DDBLOCK["DynamoDB (State Lock)"]
    TF --> AWSRES["AWS Infrastructure Provisioning"]

    AWSRES --> ALB
    AWSRES --> EC2APP
    AWSRES --> EC2DB
    AWSRES --> NAT
    AWSRES --> S3FE
    AWSRES --> CF
    AWSRES --> KDS
    AWSRES --> KDA
    AWSRES --> S3DATA
```

## FacePhys rPPG 통합

이 플랫폼은 FacePhys ONNX 모델을 사용한 원격 광용적 신호(rPPG, Remote Photoplethysmography) 분석을 통해 웹캠에서 실시간 심박수를 측정합니다.

### FacePhys 모델 통합 구조

```text
backend/
  facephys/weights/
    model.onnx        # FacePhys ONNX 모델 (36x36 RGB frame 입력)
    state.gz          # Recurrent state 초기값
  src/lib/facephys/   # FacePhys 서버 유틸리티
    ├── core.ts       # ONNX 추론 엔진
    ├── state.ts      # 상태 관리
    ├── io.ts         # I/O 유틸
    ├── rppg.ts       # rPPG 신호 처리
    └── server.ts     # 서버 통합
  src/app/api/rppg/
    ├── session/route.ts  # 세션 생성/삭제
    └── frame/route.ts    # Frame 추론 및 BPM 계산
  src/hooks/useRPPG.ts      # 웹캠 frame → backend API 전송
```

### BPM 계산 흐름

1. 웹캠에서 36×36 RGB frame 캡처 (15-30 FPS)
2. 프레임을 backend API로 전송
3. ONNX 모델이 rPPG 신호 추출 (약 6초 분량 필요)
4. BPM 계산 및 실시간 전송
5. 클라이언트에서 시각화 및 집중도 계산

### 기술 사양

- **모델**: FacePhys ONNX (onnxruntime-node v1.18+)
- **입력**: 36×36×3 RGB frame
- **출력**: BPM (beats per minute), rPPG 신호, 신호 강도
- **필요 샘플**: 최소 6초 (90 frame @ 15fps)
- **지연시간**: < 50ms per frame (CPU)

## 배포

### 사전 요구사항

- AWS 계정 및 CLI 설정
- Terraform 1.0 이상
- Docker Hub 계정 (이미지 푸시용)

### AWS 배포 (Terraform)

#### 1. 상태 저장소 초기화

```bash
cd terraform/bootstrap
terraform init
terraform apply
```

이 단계에서 S3 버킷과 DynamoDB 테이블이 생성되어 Terraform 상태를 저장합니다.

#### 2. 개발 환경 배포

```bash
cd ../environments/dev

# 변수 설정
export AWS_REGION=us-east-1
export TF_VAR_environment=dev
export TF_VAR_app_name=focus-tracking

# 배포
terraform init
terraform plan
terraform apply
```

#### 3. 환경 설정

배포 후 다음을 설정하세요:

```bash
# EC2 인스턴스에 환경 변수 설정
AWS_PROFILE=default aws ssm put-parameter \
  --name /focus-tracking/dev/database-url \
  --value "postgresql://..." \
  --type SecureString

# 애플리케이션 재배포
aws ecs update-service \
  --cluster focus-tracking-dev \
  --service app \
  --force-new-deployment
```

### Docker 배포

#### 로컬 테스트

```bash
docker-compose up -d
```

#### ECR에 이미지 푸시

```bash
# ECR 로그인
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# 이미지 빌드 및 푸시
docker build -t focus-tracking-backend:latest backend/
docker tag focus-tracking-backend:latest \
  123456789.dkr.ecr.us-east-1.amazonaws.com/focus-tracking:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/focus-tracking:latest
```

### CI/CD 파이프라인 (GitHub Actions)

GitHub Actions를 통해 자동 배포가 구성되어 있습니다:

1. **Push to main** → 이미지 빌드 및 ECR 푸시
2. **ECR 푸시 완료** → CodeDeploy 트리거
3. **CodeDeploy** → ECS 서비스 업데이트

## 모니터링 및 로깅

### CloudWatch 대시보드

```bash
# 로그 확인
aws logs tail /ecs/focus-tracking-app --follow

# 메트릭 확인
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --statistics Average \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 300
```

### 수동 모니터링

```bash
./scripts/monitoring.sh
```

## 개발 가이드

### 프로젝트 규칙

- **코드 스타일**: ESLint + Prettier 설정 준수
- **테스트**: 주요 기능에 대한 단위 테스트 작성
- **커밋 메시지**: Conventional Commits 사용
- **PR 리뷰**: 최소 1명의 승인 필요

### 새 기능 추가

1. Feature 브랜치 생성: `git checkout -b feature/feature-name`
2. 코드 작성 및 테스트
3. Pull Request 생성
4. 코드 리뷰 및 승인
5. Main 브랜치로 병합

### 버그 수정

1. Issue 확인 또는 생성
2. Bug fix 브랜치 생성: `git checkout -b fix/issue-name`
3. 수정 및 테스트
4. Pull Request 생성 (Issue 링크)
5. 병합

## 성능 최적화

### Frontend 최적화

- **이미지 최적화**: Next.js Image 컴포넌트 사용
- **코드 스플리팅**: 동적 import 활용
- **캐싱**: Service Worker 및 HTTP 캐싱
- **웹캠 프레임 레이트**: 15-30 FPS로 조정

### Backend 최적화

- **데이터베이스 인덱싱**: 주요 쿼리 최적화
- **Redis 캐싱**: 세션 및 자주 조회되는 데이터
- **ONNX 모델 양자화**: 추론 성능 향상
- **병렬 처리**: Kinesis 스트림 활용

## 문제 해결

### 웹캠 권한 오류

```
NotAllowedError: Permission denied by system
```

**해결책:**
- 브라우저 설정에서 카메라 권한 확인
- HTTPS 연결 확인 (로컬: localhost 제외)

### ONNX Runtime 오류

```
Error: Could not find onnxruntime native modules
```

**해결책:**
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 심박수 측정 실패

- 밝은 조명 환경 확인
- 얼굴이 카메라 중앙에 위치하는지 확인
- 최소 6초 이상의 데이터 수집 필요

## 기여

이 프로젝트에 기여하고 싶으신가요? 다음 단계를 따르세요:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.

---

**개발팀**: ICE-6141  
**마지막 업데이트**: 2026년 5월
