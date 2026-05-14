# ============================================
# 1단계: 빌드 (Python 패키지 컴파일용)
# ============================================
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

# 빌드 도구만 빌드 단계에 설치 (numpy/pandas 컴파일에 필요)
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
      build-essential \
      gcc \
      g++ && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# pip 패키지를 별도 디렉터리에 설치 → 다음 단계로 복사
RUN pip install --upgrade pip && \
    pip install --prefix=/install -r requirements.txt


# ============================================
# 2단계: 런타임 (최소 구성)
# ============================================
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH=/usr/local/bin:$PATH

WORKDIR /app

# 보안 패치만 적용, 추가 패키지는 일절 설치 안 함
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 빌드 단계에서 설치한 Python 패키지만 복사
COPY --from=builder /install /usr/local

# 소스 코드 복사
COPY src/ ./src/

# non-root 사용자로 실행 (보안 강화)
RUN groupadd -r app && useradd -r -g app app && \
    chown -R app:app /app
USER app

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]