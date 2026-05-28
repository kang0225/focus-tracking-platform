'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { GazeCalibrationOverlay } from '@/components/GazeCalibrationOverlay';
import GazeDot from '@/components/GazeDot';
import { HeartRateSourceSelector } from '@/components/HeartRateSourceSelector';
import { MinuteHeartRateAverageBox } from '@/components/MinuteHeartRateAverageBox';
import { useConcentrationData } from '@/hooks/useConcentrationData';
import { useMinuteHeartRateAverages } from '@/hooks/useMinuteHeartRateAverages';
import { useTrackingAnalysisJob } from '@/hooks/useTrackingAnalysisJob';
import { useTrackingStreamPublisher } from '@/hooks/useTrackingStreamPublisher';
import { useVideoRoom, type RoomJoinMode } from '@/hooks/useVideoRoom';
import type { FocusMetrics, HeartRateSourcePreference, RoomParticipant } from '@/types/tracker';

interface StreamVideoProps {
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  videoId?: string;
}

function formatMetric(value: number | null | undefined, digits = 3) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function StreamVideo({ stream, muted = false, label, audioEnabled, videoEnabled, videoId }: StreamVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [stream, videoEnabled]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)' }}>
      {stream && videoEnabled ? (
        <video
          id={videoId}
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {stream ? '카메라 꺼짐' : '연결 중'}
        </div>
      )}
      <div className="absolute bottom-2.5 left-2.5 max-w-[calc(100%-1.5rem)] truncate rounded-md px-2.5 py-1 text-xs font-medium" style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--color-brand-900)' }}>
        {label}
      </div>
      <div className="absolute right-2.5 top-2.5 flex gap-1.5">
        <span className="rounded-md px-2 py-0.5 text-[10px] font-medium" style={{
          background: audioEnabled ? 'var(--color-brand-50)' : '#FEE2E2',
          color: audioEnabled ? 'var(--color-brand-700)' : '#B91C1C',
        }}>
          {audioEnabled ? 'Mic' : 'Mute'}
        </span>
        <span className="rounded-md px-2 py-0.5 text-[10px] font-medium" style={{
          background: videoEnabled ? 'var(--color-brand-50)' : 'var(--color-bg-soft)',
          color: videoEnabled ? 'var(--color-brand-700)' : 'var(--color-text-muted)',
        }}>
          {videoEnabled ? 'Cam' : 'Off'}
        </span>
      </div>
    </div>
  );
}

function ParticipantMetric({ participant, isMe }: { participant: RoomParticipant; isMe: boolean }) {
  const { metrics } = participant;
  const isFresh = Date.now() - metrics.updatedAt < 5000;

  return (
    <div className="ft-card" style={{ padding: '0.875rem 1rem' }}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-brand-900)' }}>
            {participant.name}{isMe ? ' (나)' : ''}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {isFresh ? '실시간 업데이트 중' : '업데이트 대기 중'} · {participant.media.audioEnabled ? '마이크 켜짐' : '마이크 꺼짐'}
          </p>
        </div>
        <span className="h-2 w-2 rounded-full" style={{ background: isFresh ? 'var(--color-success)' : 'var(--color-text-muted)' }} />
      </div>
      <div className="grid grid-cols-5 gap-2 text-center">
        <div className="rounded-md py-2" style={{ background: 'var(--color-bg-soft)' }}>
          <p className="text-base font-medium" style={{ color: 'var(--color-brand-700)' }}>{metrics.focusScore > 0 ? metrics.focusScore.toFixed(2) : '--'}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Score</p>
        </div>
        <div className="rounded-md py-2" style={{ background: 'var(--color-bg-soft)' }}>
          <p className="text-base font-medium" style={{ color: 'var(--color-brand-700)' }}>{formatMetric(metrics.focusThreshold)}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Limit</p>
        </div>
        <div className="rounded-md py-2" style={{ background: 'var(--color-bg-soft)' }}>
          <p className="text-base font-medium" style={{ color: 'var(--color-brand-700)' }}>{metrics.gazeX}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>X</p>
        </div>
        <div className="rounded-md py-2" style={{ background: 'var(--color-bg-soft)' }}>
          <p className="text-base font-medium" style={{ color: 'var(--color-brand-700)' }}>{metrics.gazeY}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Y</p>
        </div>
        <div className="rounded-md py-2" style={{ background: 'var(--color-bg-soft)' }}>
          <p className="text-base font-medium" style={{ color: 'var(--color-danger)' }}>{metrics.heartRate || '--'}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>BPM</p>
        </div>
      </div>
    </div>
  );
}

function ActiveVideoRoom({ joinMode }: { joinMode: RoomJoinMode }) {
  const router = useRouter();
  const createTrackingAnalysisJob = useTrackingAnalysisJob();
  const [name, setName] = useState('');
  const [isLeaving, setIsLeaving] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [heartRateSourcePreference, setHeartRateSourcePreference] = useState<HeartRateSourcePreference>('webcam');
  const defaultNameRef = useRef(`사용자-${Math.floor(Math.random() * 900 + 100)}`);
  const displayName = name.trim() || defaultNameRef.current;

  const {
    coordinates,
    rawCoordinates,
    isLoaded,
    isCalibrated,
    currentCalibrationPointIndex,
    calibrationPointClickCount,
    clicksPerCalibrationPoint,
    totalCalibrationPoints,
    isCalibrationBusy,
    recordCalibrationPoint,
    resetCalibration,
    heartRate,
    heartRateSource,
    heartRateStatus,
    focusScore,
    focusRawScore,
    focusIsFocused,
    focusThresholdRawScore,
    focusSource,
    hasAppleWatchConnection,
    isTrackingReady,
  } = useConcentrationData({ paused: isPaused, heartRateSourcePreference });

  const minuteHeartRateAverages = useMinuteHeartRateAverages(heartRate, !isPaused && heartRate > 0);
  const metrics: FocusMetrics = useMemo(() => ({
    gazeX: coordinates.x,
    gazeY: coordinates.y,
    heartRate,
    heartRateSource,
    focusScore,
    focusSource,
    focusThreshold: focusThresholdRawScore,
    focusIsFocused,
    updatedAt: Date.now(),
  }), [coordinates.x, coordinates.y, focusIsFocused, focusScore, focusSource, focusThresholdRawScore, heartRate, heartRateSource]);

  const {
    clientId,
    room,
    localStream,
    remoteVideos,
    status,
    error,
    isAudioEnabled,
    isVideoEnabled,
    toggleAudio,
    toggleVideo,
    leaveRoom,
  } = useVideoRoom({ name: displayName, metrics, joinMode });

  const { stopPublishing } = useTrackingStreamPublisher({
    enabled: !!room?.roomId && isVideoEnabled && isTrackingReady,
    paused: isPaused || !isVideoEnabled,
    data: {
      meetingId: room?.roomId ?? '',
      userId: clientId,
      heartRate,
      heartRateSource,
      heartRateStatus,
      gazeX: coordinates.x,
      gazeY: coordinates.y,
      rawGazeX: rawCoordinates.x,
      rawGazeY: rawCoordinates.y,
      isGazeCalibrated: isCalibrated,
      focusScore: focusRawScore ?? undefined,
      focusSource,
      focusIsFocused,
      focusThresholdRawScore,
      isTrackingReady,
      page: 'room',
    },
  });

  const leaveAndAnalyze = async () => {
    if (isLeaving) return;
    const currentRoomId = room?.roomId;
    setIsLeaving(true);
    stopPublishing();

    try {
      let jobId: string | null = null;
      if (currentRoomId) {
        jobId = await createTrackingAnalysisJob({
          meetingId: currentRoomId,
          userId: clientId,
          page: 'room',
          reason: 'leave',
        });
      }
      await leaveRoom();
      router.push(jobId ? `/result?jobId=${encodeURIComponent(jobId)}` : '/result');
    } catch (err) {
      console.error('leave failed:', err);
      await leaveRoom().catch(() => undefined);
      router.push('/result');
    }
  };

  const copyInviteCode = async () => {
    if (!room?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(room.inviteCode);
      setCopyStatus('복사 완료');
    } catch {
      setCopyStatus('복사 실패');
    }
    window.setTimeout(() => setCopyStatus(''), 1800);
  };

  const participants = room?.participants ?? [];
  const me = participants.find((p) => p.id === clientId);
  const remoteSlots = remoteVideos.map((r) => {
    const p = participants.find((item) => item.id === r.participantId);
    return {
      ...r,
      label: p?.name ?? '참가자',
      media: p?.media ?? { audioEnabled: true, videoEnabled: true },
    };
  });
  const isInviteRoom = room?.roomType === 'invite' || joinMode.type !== 'public';
  const waitingLabel = isInviteRoom ? '초대코드 참가자 대기 중' : '랜덤 참가자 대기 중';

  if (error && !room && !localStream) {
    return (
      <main className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <Navbar />
        <div className="mx-auto flex max-w-xl flex-col items-start px-6 py-12">
          <div className="ft-card w-full" style={{ borderColor: '#FECACA', background: '#FEF2F2' }}>
            <p className="text-sm font-medium" style={{ color: '#B91C1C' }}>입장 실패</p>
            <h1 className="mt-1.5 text-xl font-medium" style={{ color: '#7F1D1D' }}>{error}</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-soft)' }}>{status}</p>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="ft-btn-primary mt-4"
            >
              대시보드로 돌아가기
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />

      <div className="mx-auto w-full max-w-7xl px-6 py-5">
        <header className="mb-4 flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--color-brand-600)' }}>
              {isInviteRoom ? '초대코드 P2P 집중방' : '공개 랜덤 P2P 집중방'}
            </p>
            <h1 className="mt-0.5 text-2xl font-medium" style={{ color: 'var(--color-brand-900)' }}>
              화상 채팅 + 집중도 공유
            </h1>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-soft)' }}>{status}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HeartRateSourceSelector
              value={heartRateSourcePreference}
              onChange={setHeartRateSourcePreference}
              disabled={isLeaving}
              appleWatchConnected={hasAppleWatchConnection}
              className="w-44"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultNameRef.current}
              className="ft-input h-9 w-32 text-sm"
            />
            <button onClick={toggleAudio} className="ft-btn-secondary text-xs">
              <i className={`ti ${isAudioEnabled ? 'ti-microphone' : 'ti-microphone-off'} text-sm`} aria-hidden="true" />
              {isAudioEnabled ? '마이크 끄기' : '마이크 켜기'}
            </button>
            <button onClick={toggleVideo} className="ft-btn-secondary text-xs">
              <i className={`ti ${isVideoEnabled ? 'ti-camera' : 'ti-camera-off'} text-sm`} aria-hidden="true" />
              {isVideoEnabled ? '카메라 끄기' : '카메라 켜기'}
            </button>
            <button
              type="button"
              onClick={() => setIsPaused((c) => !c)}
              disabled={isLeaving}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: isPaused ? 'var(--color-success)' : 'var(--color-warning)' }}
            >
              {isPaused ? '측정 재개' : '측정 일시정지'}
            </button>
            <button
              onClick={() => void leaveAndAnalyze()}
              disabled={isLeaving}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-white"
              style={{ background: 'var(--color-danger)' }}
            >
              {isLeaving ? '분석 중' : '나가기'}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 ft-card" style={{ borderColor: '#FECACA', background: '#FEF2F2', color: '#B91C1C' }}>
            {error}
          </div>
        )}

        <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <StreamVideo
                stream={localStream}
                muted
                label={me?.name ? `${me.name} (나)` : '나'}
                audioEnabled={isAudioEnabled}
                videoEnabled={isVideoEnabled}
                videoId="webgazerVideoFeed"
              />
              {remoteSlots.map((remote) => (
                <StreamVideo
                  key={remote.participantId}
                  stream={remote.stream}
                  label={remote.label}
                  audioEnabled={remote.media.audioEnabled}
                  videoEnabled={remote.media.videoEnabled}
                />
              ))}
              {Array.from({ length: Math.max(0, (room?.maxParticipants ?? 5) - 1 - remoteSlots.length) }).map((_, i) => (
                <div
                  key={i}
                  className="flex aspect-video items-center justify-center rounded-xl border-2 border-dashed text-sm"
                  style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)', background: 'var(--color-bg-soft)' }}
                >
                  {waitingLabel}
                </div>
              ))}
            </div>

            <div className="ft-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-brand-900)' }}>방 정보</p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-soft)' }}>
                    {room?.roomId ?? '매칭 중'} · {participants.length}/{room?.maxParticipants ?? 5}명
                  </p>
                  {room?.inviteCode && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md px-3 py-1.5 text-sm font-medium tracking-[0.2em]"
                        style={{ background: 'var(--color-brand-50)', color: 'var(--color-brand-700)', border: '1px solid var(--color-brand-200)' }}>
                        {room.inviteCode}
                      </span>
                      <button onClick={() => void copyInviteCode()} className="ft-btn-secondary text-xs">
                        <i className="ti ti-copy text-xs" aria-hidden="true" />
                        초대코드 복사
                      </button>
                      {copyStatus && <span className="text-xs" style={{ color: 'var(--color-text-soft)' }}>{copyStatus}</span>}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-md px-3 py-1.5 text-xs" style={{ background: 'var(--color-bg-soft)', color: 'var(--color-text-soft)' }}>
                    {isPaused ? '측정 일시정지' : !isLoaded ? '시선 로딩' : isCalibrated ? '시선 보정 완료' : '시선 보정 필요'}
                  </div>
                  <button
                    type="button"
                    onClick={() => void resetCalibration()}
                    disabled={!isLoaded || isCalibrationBusy}
                    className="ft-btn-secondary text-xs"
                  >
                    다시 보정
                  </button>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="ft-card">
              <p className="text-sm font-medium" style={{ color: 'var(--color-brand-900)' }}>내 집중도</p>
              <div className="mt-3 grid grid-cols-5 gap-2 text-center">
                <div className="rounded-md py-2" style={{ background: 'var(--color-brand-50)' }}>
                  <p className="text-base font-medium" style={{ color: 'var(--color-brand-700)' }}>{formatMetric(focusRawScore)}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Score</p>
                </div>
                <div className="rounded-md py-2" style={{ background: 'var(--color-brand-50)' }}>
                  <p className="text-base font-medium" style={{ color: 'var(--color-brand-700)' }}>{formatMetric(focusThresholdRawScore)}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Limit</p>
                </div>
                <div className="rounded-md py-2" style={{ background: 'var(--color-brand-50)' }}>
                  <p className="text-base font-medium" style={{ color: 'var(--color-brand-700)' }}>{coordinates.x}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>X</p>
                </div>
                <div className="rounded-md py-2" style={{ background: 'var(--color-brand-50)' }}>
                  <p className="text-base font-medium" style={{ color: 'var(--color-brand-700)' }}>{coordinates.y}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Y</p>
                </div>
                <div className="rounded-md py-2" style={{ background: 'var(--color-brand-50)' }}>
                  <p className="text-base font-medium" style={{ color: 'var(--color-danger)' }}>{heartRate || '--'}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>BPM</p>
                </div>
              </div>
              <p className="mt-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                집중 점수 출처: {isPaused ? '일시정지' : focusSource}
              </p>
            </div>

            <MinuteHeartRateAverageBox averages={minuteHeartRateAverages} />

            <div className="space-y-2">
              {participants.map((p) => (
                <ParticipantMetric key={p.id} participant={p} isMe={p.id === clientId} />
              ))}
            </div>
          </aside>
        </section>
      </div>

      <canvas id="heartbeatCanvas" className="hidden" />
      <GazeDot
        x={rawCoordinates.x}
        y={rawCoordinates.y}
        visible={!isPaused && isCalibrated && rawCoordinates.x > 0 && rawCoordinates.y > 0}
      />
      <GazeCalibrationOverlay
        active={!isPaused && isLoaded && !isCalibrated}
        currentPointIndex={currentCalibrationPointIndex}
        pointClickCount={calibrationPointClickCount}
        clicksPerPoint={clicksPerCalibrationPoint}
        totalPoints={totalCalibrationPoints}
        isBusy={isCalibrationBusy}
        onPointClick={(p) => recordCalibrationPoint(p.xPercent, p.yPercent)}
        onReset={() => void resetCalibration()}
      />
    </main>
  );
}

function VideoRoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode');
  const code = searchParams.get('code') ?? '';

  const joinMode = useMemo<RoomJoinMode | null>(() => {
    if (mode === 'public') return { type: 'public' };
    if (mode === 'invite-create') return { type: 'invite-create' };
    if (mode === 'invite-join' && code) return { type: 'invite-join', inviteCode: code };
    return null;
  }, [mode, code]);

  useEffect(() => {
    if (!joinMode) {
      router.replace('/dashboard');
    }
  }, [joinMode, router]);

  if (!joinMode) {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--color-brand-600)' }}>
          <i className="ti ti-loader-2 animate-spin text-xl" aria-hidden="true" />
          <span className="text-sm">대시보드로 돌아가는 중...</span>
        </div>
      </main>
    );
  }

  return (
    <ActiveVideoRoom
      key={joinMode.type === 'invite-join' ? `${joinMode.type}-${joinMode.inviteCode}` : joinMode.type}
      joinMode={joinMode}
    />
  );
}

export default function VideoRoomPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" style={{ background: 'var(--color-bg)' }} />}>
      <VideoRoomContent />
    </Suspense>
  );
}
