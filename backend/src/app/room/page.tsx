'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
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
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          {stream ? '카메라 꺼짐' : '연결 중'}
        </div>
      )}
      <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-md bg-slate-950/85 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/10">
        {label}
      </div>
      <div className="absolute right-3 top-3 flex gap-2">
        <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-white/10 ${audioEnabled ? 'bg-emerald-500/20 text-emerald-100' : 'bg-rose-500/20 text-rose-100'}`}>
          {audioEnabled ? 'Mic' : 'Mute'}
        </span>
        <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-white/10 ${videoEnabled ? 'bg-cyan-500/20 text-cyan-100' : 'bg-slate-700/80 text-slate-200'}`}>
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
    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{participant.name}{isMe ? ' (나)' : ''}</p>
          <p className="text-xs text-slate-500">
            {isFresh ? '실시간 업데이트 중' : '업데이트 대기 중'} · {participant.media.audioEnabled ? '마이크 켜짐' : '마이크 꺼짐'} · {participant.media.videoEnabled ? '카메라 켜짐' : '카메라 꺼짐'}
          </p>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${isFresh ? 'bg-emerald-400' : 'bg-slate-600'}`} />
      </div>
      <div className="grid grid-cols-5 gap-3 text-center">
        <div className="rounded-md bg-slate-950/80 px-2 py-3">
          <p className="text-lg font-bold text-emerald-300">{metrics.focusScore > 0 ? metrics.focusScore.toFixed(3) : '--'}</p>
          <p className="text-[11px] uppercase text-slate-500">{metrics.focusSource ?? 'Score'}</p>
        </div>
        <div className="rounded-md bg-slate-950/80 px-2 py-3">
          <p className="text-lg font-bold text-cyan-200">{formatMetric(metrics.focusThreshold)}</p>
          <p className="text-[11px] uppercase text-slate-500">Limit</p>
        </div>
        <div className="rounded-md bg-slate-950/80 px-2 py-3">
          <p className="text-lg font-bold text-cyan-300">{metrics.gazeX}</p>
          <p className="text-[11px] uppercase text-slate-500">Gaze X</p>
        </div>
        <div className="rounded-md bg-slate-950/80 px-2 py-3">
          <p className="text-lg font-bold text-blue-300">{metrics.gazeY}</p>
          <p className="text-[11px] uppercase text-slate-500">Gaze Y</p>
        </div>
        <div className="rounded-md bg-slate-950/80 px-2 py-3">
          <p className="text-lg font-bold text-rose-300">{metrics.heartRate || '--'}</p>
          <p className="text-[11px] uppercase text-slate-500">{metrics.heartRateSource}</p>
        </div>
      </div>
    </div>
  );
}

function VideoRoomEntry({ onJoin }: { onJoin: (joinMode: RoomJoinMode) => void }) {
  const [inviteCode, setInviteCode] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);

  const submitInviteCode = () => {
    const code = inviteCode.trim();
    if (!code) {
      setEntryError('초대코드를 입력해주세요.');
      return;
    }

    setEntryError(null);
    onJoin({ type: 'invite-join', inviteCode: code });
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col justify-center">
        <header className="mb-8">
          <p className="text-sm font-medium text-cyan-300">Focus Room</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">화상채팅 입장</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-400">
            공개방 랜덤 매칭 또는 초대코드 방을 선택하세요.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => onJoin({ type: 'public' })}
            className="min-h-44 rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-5 text-left transition hover:border-cyan-300 hover:bg-cyan-500/15 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <span className="text-sm font-semibold text-cyan-200">공개방 랜덤 입장</span>
            <span className="mt-4 block text-2xl font-bold text-white">랜덤 매칭 시작</span>
            <span className="mt-3 block text-sm leading-6 text-slate-300">기존 방식 그대로 공개 큐에서 상대와 연결됩니다.</span>
          </button>

          <button
            type="button"
            onClick={() => onJoin({ type: 'invite-create' })}
            className="min-h-44 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-5 text-left transition hover:border-emerald-300 hover:bg-emerald-500/15 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <span className="text-sm font-semibold text-emerald-200">초대코드 방 만들기</span>
            <span className="mt-4 block text-2xl font-bold text-white">코드 발급 후 입장</span>
            <span className="mt-3 block text-sm leading-6 text-slate-300">방에 들어간 뒤 코드를 복사해서 원하는 사람에게 공유합니다.</span>
          </button>

          <form
            className="min-h-44 rounded-lg border border-slate-700 bg-slate-900/80 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              submitInviteCode();
            }}
          >
            <label htmlFor="invite-code" className="text-sm font-semibold text-amber-200">
              초대코드로 입장
            </label>
            <input
              id="invite-code"
              value={inviteCode}
              onChange={(event) => {
                setInviteCode(event.target.value.toUpperCase());
                setEntryError(null);
              }}
              placeholder="ABC123"
              autoCapitalize="characters"
              className="mt-5 h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold uppercase tracking-[0.2em] text-white outline-none transition placeholder:tracking-normal placeholder:text-slate-600 focus:border-amber-300"
            />
            {entryError && <p className="mt-2 text-sm text-rose-200">{entryError}</p>}
            <button
              type="submit"
              className="mt-4 h-11 w-full rounded-md bg-amber-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
            >
              입장
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function ActiveVideoRoom({ joinMode, onBackToEntry }: { joinMode: RoomJoinMode; onBackToEntry: () => void }) {
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
  } = useVideoRoom({
    name: displayName,
    metrics,
    joinMode,
  });

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
    } catch (error) {
      console.error('Room leave analysis flow failed:', error);
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
  const me = participants.find((participant) => participant.id === clientId);
  const remoteSlots = remoteVideos.map((remote) => {
    const participant = participants.find((item) => item.id === remote.participantId);
    return {
      ...remote,
      label: participant?.name ?? '참가자',
      media: participant?.media ?? { audioEnabled: true, videoEnabled: true },
    };
  });
  const isInviteRoom = room?.roomType === 'invite' || joinMode.type !== 'public';
  const waitingLabel = isInviteRoom ? '초대코드 참가자 대기 중' : '랜덤 참가자 대기 중';

  if (error && !room && !localStream) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl flex-col justify-center">
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-6">
            <p className="text-sm font-semibold text-rose-100">입장 실패</p>
            <h1 className="mt-2 text-2xl font-bold text-white">{error}</h1>
            <p className="mt-3 text-sm text-slate-300">{status}</p>
            <button
              type="button"
              onClick={onBackToEntry}
              className="mt-6 h-11 rounded-md bg-cyan-600 px-5 text-sm font-bold text-white transition hover:bg-cyan-500"
            >
              입장 선택으로 돌아가기
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-cyan-300">{isInviteRoom ? '초대코드 P2P 집중방' : '공개 랜덤 P2P 집중방'}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">화상 채팅과 집중도 실시간 공유</h1>
            <p className="mt-2 text-sm text-slate-400">{status}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <HeartRateSourceSelector
              value={heartRateSourcePreference}
              onChange={setHeartRateSourcePreference}
              disabled={isLeaving}
              appleWatchConnected={hasAppleWatchConnection}
              className="w-56"
            />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={defaultNameRef.current}
              className="h-10 w-44 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none transition focus:border-cyan-400"
            />
            <button
              onClick={toggleAudio}
              className="h-10 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
            >
              {isAudioEnabled ? '마이크 끄기' : '마이크 켜기'}
            </button>
            <button
              onClick={toggleVideo}
              className="h-10 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
            >
              {isVideoEnabled ? '카메라 끄기' : '카메라 켜기'}
            </button>
            <button
              type="button"
              onClick={() => setIsPaused((current) => !current)}
              disabled={isLeaving}
              className={`h-10 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                isPaused
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'border border-amber-500/50 text-amber-100 hover:border-amber-400 hover:bg-amber-500/10'
              }`}
            >
              {isPaused ? '측정 재개' : '측정 일시정지'}
            </button>
            <button
              onClick={() => void leaveAndAnalyze()}
              disabled={isLeaving}
              className="h-10 rounded-md border border-rose-500/50 px-4 text-sm font-semibold text-rose-100 transition hover:border-rose-400 hover:bg-rose-500/10"
            >
              {isLeaving ? '분석 중' : '나가기'}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
            {error}
          </div>
        )}

        <section className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
              {Array.from({ length: Math.max(0, (room?.maxParticipants ?? 5) - 1 - remoteSlots.length) }).map((_, index) => (
                <div
                  key={index}
                  className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/45 text-sm text-slate-500"
                >
                  {waitingLabel}
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">방 정보</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {room?.roomId ?? '매칭 중'} · {participants.length}/{room?.maxParticipants ?? 5}명
                  </p>
                  {room?.inviteCode && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-950 px-3 py-2 text-sm font-bold tracking-[0.2em] text-emerald-200 ring-1 ring-emerald-500/30">
                        {room.inviteCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyInviteCode()}
                        className="h-9 rounded-md border border-emerald-500/50 px-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/10"
                      >
                        초대코드 복사
                      </button>
                      {copyStatus && <span className="text-sm text-slate-400">{copyStatus}</span>}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-300 ring-1 ring-slate-800">
                    {isPaused ? '측정 일시정지 중' : !isLoaded ? '시선 추적 로딩 중' : isCalibrated ? '시선 보정 완료' : '시선 보정 필요'}
                  </div>
                  <button
                    type="button"
                    onClick={() => void resetCalibration()}
                    disabled={!isLoaded || isCalibrationBusy}
                    className="h-10 rounded-md border border-slate-700 px-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    다시 보정
                  </button>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
              <p className="text-sm font-semibold text-white">내 집중도</p>
              <div className="mt-4 grid grid-cols-5 gap-3 text-center">
                <div className="rounded-md bg-slate-950 px-2 py-3">
                  <p className="text-xl font-bold text-emerald-300">{formatMetric(focusRawScore)}</p>
                  <p className="text-[11px] text-slate-500">Score</p>
                </div>
                <div className="rounded-md bg-slate-950 px-2 py-3">
                  <p className="text-xl font-bold text-cyan-200">{formatMetric(focusThresholdRawScore)}</p>
                  <p className="text-[11px] text-slate-500">Limit</p>
                </div>
                <div className="rounded-md bg-slate-950 px-2 py-3">
                  <p className="text-xl font-bold text-cyan-300">{coordinates.x}</p>
                  <p className="text-[11px] text-slate-500">X</p>
                </div>
                <div className="rounded-md bg-slate-950 px-2 py-3">
                  <p className="text-xl font-bold text-blue-300">{coordinates.y}</p>
                  <p className="text-[11px] text-slate-500">Y</p>
                </div>
                <div className="rounded-md bg-slate-950 px-2 py-3">
                  <p className="text-xl font-bold text-rose-300">{heartRate || '--'}</p>
                  <p className="text-[11px] text-slate-500">{heartRate > 0 ? heartRateSource : heartRateStatus}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">집중 점수 출처: {isPaused ? '일시정지' : focusSource}</p>
            </div>

            <MinuteHeartRateAverageBox averages={minuteHeartRateAverages} />

            <div className="space-y-3">
              {participants.map((participant) => (
                <ParticipantMetric
                  key={participant.id}
                  participant={participant}
                  isMe={participant.id === clientId}
                />
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
        onPointClick={(point) => recordCalibrationPoint(point.xPercent, point.yPercent)}
        onReset={() => void resetCalibration()}
      />
    </main>
  );
}

export default function VideoRoomPage() {
  const [joinMode, setJoinMode] = useState<RoomJoinMode | null>(null);

  if (!joinMode) {
    return <VideoRoomEntry onJoin={setJoinMode} />;
  }

  return (
    <ActiveVideoRoom
      key={joinMode.type === 'invite-join' ? `${joinMode.type}-${joinMode.inviteCode}` : joinMode.type}
      joinMode={joinMode}
      onBackToEntry={() => setJoinMode(null)}
    />
  );
}
