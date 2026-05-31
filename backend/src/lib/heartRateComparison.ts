import type { HeartRateComparison } from '@/types/tracker';

interface BuildHeartRateComparisonOptions {
  paused?: boolean;
  webcamHeartRate: number;
  appleWatchHeartRate: number;
  hasAppleWatchConnection: boolean;
  isWebcamMeasuring?: boolean;
}

export function isComparableHeartRate(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 40 && value <= 180;
}

export function buildHeartRateComparison({
  paused = false,
  webcamHeartRate,
  appleWatchHeartRate,
  hasAppleWatchConnection,
  isWebcamMeasuring = false,
}: BuildHeartRateComparisonOptions): HeartRateComparison {
  const hasWebcamHeartRate = isComparableHeartRate(webcamHeartRate);
  const hasAppleWatchHeartRate = isComparableHeartRate(appleWatchHeartRate);

  if (paused) {
    return {
      webcamHeartRate,
      appleWatchHeartRate,
      differenceBpm: null,
      reliabilityScore: null,
      level: 'unavailable',
      label: '일시정지',
      status: '비교 일시정지',
      description: '측정 재개 후 Watch와 웹캠 심박수를 비교합니다.',
    };
  }

  if (!hasAppleWatchConnection) {
    return {
      webcamHeartRate,
      appleWatchHeartRate,
      differenceBpm: null,
      reliabilityScore: null,
      level: 'unavailable',
      label: '대기',
      status: 'Watch 미연결',
      description: 'Apple Watch를 연결하면 웹캠 심박수와 자동으로 비교합니다.',
    };
  }

  if (!hasAppleWatchHeartRate) {
    return {
      webcamHeartRate,
      appleWatchHeartRate,
      differenceBpm: null,
      reliabilityScore: null,
      level: 'unavailable',
      label: '대기',
      status: 'Watch 수신 대기',
      description: 'Apple Watch 심박수 수신을 기다리는 중입니다.',
    };
  }

  if (!hasWebcamHeartRate) {
    return {
      webcamHeartRate,
      appleWatchHeartRate,
      differenceBpm: null,
      reliabilityScore: null,
      level: 'unavailable',
      label: '대기',
      status: isWebcamMeasuring ? '웹캠 측정 중' : '웹캠 대기',
      description: isWebcamMeasuring
        ? '웹캠 심박수를 안정적으로 모으는 중입니다.'
        : '웹캠 심박수 측정이 안정되면 비교합니다.',
    };
  }

  const differenceBpm = Math.abs(webcamHeartRate - appleWatchHeartRate);
  const reliabilityScore = Math.max(0, Math.min(100, Math.round(100 - differenceBpm * 8)));
  const level = differenceBpm <= 5 ? 'high' : differenceBpm <= 10 ? 'medium' : 'low';

  return {
    webcamHeartRate,
    appleWatchHeartRate,
    differenceBpm,
    reliabilityScore,
    level,
    label: level === 'high' ? '높음' : level === 'medium' ? '보통' : '낮음',
    status: `차이 ${differenceBpm}bpm`,
    description: level === 'high'
      ? '두 심박수가 가까워 웹캠 측정값을 신뢰하기 좋습니다.'
      : level === 'medium'
        ? '두 값이 조금 차이나 현재 측정 환경을 함께 확인하세요.'
        : '두 값 차이가 커서 조명, 자세, 카메라 인식 상태 확인이 필요합니다.',
  };
}
