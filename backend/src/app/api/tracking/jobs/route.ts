import { NextResponse } from 'next/server';
import {
  createTrackingAnalysisJob,
  setTrackingAnalysisJobStatus,
  type TrackingAnalysisJobRequest,
  type TrackingAnalysisJobStatus,
} from '@/lib/redisStream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MlAnalyzeResponse {
  duration_minutes: number;
  summary: {
    high_focus_minutes: number;
    low_focus_minutes: number;
  };
  result_metrics?: {
    duration_seconds?: number;
    avg_bpm?: number | null;
    focus_ratio?: number | null;
  };
  feedback?: string | null;
  feedback_source?: string | null;
  gaze_heatmap?: {
    columns: number;
    rows: number;
    total_points: number;
    x_min?: number | null;
    x_max?: number | null;
    y_min?: number | null;
    y_max?: number | null;
    cells: {
      column: number;
      row: number;
      x: number;
      y: number;
      count: number;
      intensity: number;
    }[];
  } | null;
  focus_timeline?: {
    minute_index: number;
    elapsed_seconds: number;
    focus_score?: number | null;
    threshold?: number | null;
    focus_state: string;
    focus_trend: string;
  }[];
}

function isValidRequest(value: unknown): value is TrackingAnalysisJobRequest {
  if (!value || typeof value !== 'object') return false;

  const body = value as Partial<TrackingAnalysisJobRequest>;
  return typeof body.meetingId === 'string'
    && body.meetingId.length > 0
    && typeof body.userId === 'string'
    && body.userId.length > 0
    && (body.page === 'solo' || body.page === 'room')
    && (body.reason === 'finish' || body.reason === 'leave')
    && typeof body.requestedAt === 'string';
}

function mlServiceUrl() {
  return (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
}

function buildResultSummary(analysis: MlAnalyzeResponse, focusRatio?: number | null) {
  if (typeof focusRatio === 'number') {
    return `총 ${analysis.duration_minutes}분 분석 완료. 집중 비율 ${focusRatio}%, 고집중 ${analysis.summary.high_focus_minutes}분.`;
  }

  return `총 ${analysis.duration_minutes}분 분석 완료. 고집중 ${analysis.summary.high_focus_minutes}분, 저집중 ${analysis.summary.low_focus_minutes}분.`;
}

function buildCompletedResult(analysis: MlAnalyzeResponse): NonNullable<TrackingAnalysisJobStatus['result']> {
  const metrics = analysis.result_metrics;
  const durationSeconds = typeof metrics?.duration_seconds === 'number'
    ? metrics.duration_seconds
    : analysis.duration_minutes * 60;
  const avgBpm = typeof metrics?.avg_bpm === 'number' ? metrics.avg_bpm : undefined;
  const focusRatio = typeof metrics?.focus_ratio === 'number' ? metrics.focus_ratio : undefined;
  const gazeHeatmap = analysis.gaze_heatmap
    ? {
      columns: analysis.gaze_heatmap.columns,
      rows: analysis.gaze_heatmap.rows,
      totalPoints: analysis.gaze_heatmap.total_points,
      xMin: typeof analysis.gaze_heatmap.x_min === 'number' ? analysis.gaze_heatmap.x_min : undefined,
      xMax: typeof analysis.gaze_heatmap.x_max === 'number' ? analysis.gaze_heatmap.x_max : undefined,
      yMin: typeof analysis.gaze_heatmap.y_min === 'number' ? analysis.gaze_heatmap.y_min : undefined,
      yMax: typeof analysis.gaze_heatmap.y_max === 'number' ? analysis.gaze_heatmap.y_max : undefined,
      cells: analysis.gaze_heatmap.cells,
    }
    : undefined;
  const focusTimeline = analysis.focus_timeline?.map((point) => ({
    minuteIndex: point.minute_index,
    elapsedSeconds: point.elapsed_seconds,
    focusScore: typeof point.focus_score === 'number' ? point.focus_score : undefined,
    threshold: typeof point.threshold === 'number' ? point.threshold : undefined,
    focusState: point.focus_state,
    focusTrend: point.focus_trend,
  }));

  return {
    durationSeconds,
    avgBpm,
    focusRatio,
    summary: buildResultSummary(analysis, focusRatio),
    feedback: analysis.feedback ?? undefined,
    feedbackSource: analysis.feedback_source ?? undefined,
    gazeHeatmap,
    focusTimeline,
  };
}

async function analyzeSession(body: TrackingAnalysisJobRequest) {
  const response = await fetch(`${mlServiceUrl()}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: body.userId,
      sessionId: body.meetingId,
      include_feedback: true,
      delete_after: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `ML analysis failed with status ${response.status}`);
  }

  return response.json() as Promise<MlAnalyzeResponse>;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isValidRequest(body)) {
      return NextResponse.json({ error: 'invalid tracking analysis job request' }, { status: 400 });
    }

    const result = await createTrackingAnalysisJob(body);
    const baseStatus = {
      jobId: result.jobId,
      meetingId: body.meetingId,
      userId: body.userId,
      page: body.page,
      reason: body.reason,
      requestedAt: body.requestedAt,
    };

    await setTrackingAnalysisJobStatus({
      ...baseStatus,
      status: 'processing',
    });

    try {
      const analysis = await analyzeSession(body);
      const completedStatus: TrackingAnalysisJobStatus = {
        ...baseStatus,
        status: 'completed',
        result: buildCompletedResult(analysis),
      };

      await setTrackingAnalysisJobStatus(completedStatus);
      return NextResponse.json({ ok: true, ...result, status: completedStatus.status, result: completedStatus.result });
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'tracking analysis failed';
      const failedStatus: TrackingAnalysisJobStatus = {
        ...baseStatus,
        status: 'failed',
        error: message,
      };

      await setTrackingAnalysisJobStatus(failedStatus);
      return NextResponse.json({ ok: true, ...result, status: failedStatus.status, error: message });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'tracking analysis job creation failed';
    console.error('[Tracking Analysis] job creation failed:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
