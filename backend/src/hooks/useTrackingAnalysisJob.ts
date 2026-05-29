'use client';

import { useCallback } from 'react';

interface CreateTrackingAnalysisJobArgs {
  meetingId: string;
  page: 'solo' | 'room';
  reason: 'finish' | 'leave';
}

// userId 는 백엔드 라우트에서 인증된 세션으로부터 채워지므로 클라이언트는 보내지 않는다.
export function useTrackingAnalysisJob() {
  return useCallback(async ({ meetingId, page, reason }: CreateTrackingAnalysisJobArgs) => {
    const response = await fetch('/api/tracking/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId,
        page,
        reason,
        requestedAt: new Date().toISOString(),
      }),
    });

    const payload = await response.json().catch(() => null) as { jobId?: string; error?: string } | null;
    if (!response.ok || !payload?.jobId) {
      throw new Error(payload?.error ?? '분석 작업 등록에 실패했습니다.');
    }

    return payload.jobId;
  }, []);
}
