'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FocusMetrics, RoomParticipant, RoomSnapshot, SignalMessage, SignalType } from '@/types/tracker';

interface RemoteVideo {
  participantId: string;
  stream: MediaStream;
}

interface UseVideoRoomArgs {
  name: string;
  metrics: FocusMetrics;
  joinMode: RoomJoinMode | null;
}

export type RoomJoinMode =
  | { type: 'public' }
  | { type: 'invite-create' }
  | { type: 'invite-join'; inviteCode: string };

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const ROOM_MISSING_RESPONSE_LIMIT = 3;
const ROOM_EXPIRED_MESSAGE = '방 연결이 만료되었습니다. 다시 입장해주세요.';

const makeClientId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const getMediaErrorMessage = (error: unknown) => {
  if (!(error instanceof DOMException)) {
    return '화상방을 시작할 수 없습니다.';
  }

  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    return '카메라 또는 마이크 권한이 거부되었습니다. 브라우저 권한을 허용한 뒤 다시 입장해주세요.';
  }

  if (error.name === 'NotFoundError') {
    return '사용 가능한 카메라 또는 마이크를 찾지 못했습니다.';
  }

  if (error.name === 'NotReadableError') {
    return '카메라 또는 마이크가 다른 앱에서 사용 중입니다.';
  }

  return '카메라와 마이크를 준비하는 중 문제가 발생했습니다.';
};

const getJoinFailureMessage = (joinMode: RoomJoinMode) => {
  if (joinMode.type === 'public') return '랜덤 매칭에 실패했습니다.';
  if (joinMode.type === 'invite-create') return '초대코드 방을 만들지 못했습니다.';
  return '초대코드 방에 입장하지 못했습니다.';
};

const getJoinStatus = (snapshot: RoomSnapshot, joinMode: RoomJoinMode) => {
  if (joinMode.type === 'public') return `${snapshot.roomId}에 입장했습니다.`;
  return `${snapshot.inviteCode ?? snapshot.roomId} 초대코드 방에 입장했습니다.`;
};

const getWaitingStatus = (snapshot: RoomSnapshot) => {
  if (snapshot.participants.length >= snapshot.maxParticipants) return '방이 가득 찼습니다.';
  return snapshot.roomType === 'invite'
    ? '초대코드 참가자를 기다리는 중입니다.'
    : '랜덤 참가자를 기다리는 중입니다.';
};

const readErrorMessage = async (res: Response, fallback: string) => {
  try {
    const data: { error?: unknown } = await res.json();
    return typeof data.error === 'string' ? data.error : fallback;
  } catch {
    return fallback;
  }
};

export function useVideoRoom({ name, metrics, joinMode }: UseVideoRoomArgs) {
  const clientId = useMemo(makeClientId, []);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteVideos, setRemoteVideos] = useState<RemoteVideo[]>([]);
  const [status, setStatus] = useState(joinMode ? '카메라와 마이크를 준비하는 중입니다.' : '입장 방식을 선택해주세요.');
  const [error, setError] = useState<string | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const roomId = room?.roomId;

  const roomRef = useRef<RoomSnapshot | null>(null);
  const nameRef = useRef(name);
  const metricsRef = useRef(metrics);
  const mediaRef = useRef({ audioEnabled: true, videoEnabled: true });
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef(new Map<string, RTCPeerConnection>());
  const lastSignalIdRef = useRef(0);
  const handledSignalsRef = useRef(new Set<number>());
  const offeredPeersRef = useRef(new Set<string>());
  const missingRoomResponsesRef = useRef(0);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    mediaRef.current = { audioEnabled: isAudioEnabled, videoEnabled: isVideoEnabled };
  }, [isAudioEnabled, isVideoEnabled]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const sendSignal = useCallback(
    async (to: string, type: SignalType, payload: unknown) => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;

      try {
        const res = await fetch('/api/rooms/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: currentRoom.roomId,
            from: clientId,
            to,
            type,
            payload,
          }),
        });

        if (!res.ok) {
          throw new Error('signal failed');
        }
      } catch {
        setStatus('시그널링 연결에 문제가 있습니다. 네트워크 상태를 확인해주세요.');
      }
    },
    [clientId],
  );

  const removePeer = useCallback((participantId: string) => {
    peerConnections.current.get(participantId)?.close();
    peerConnections.current.delete(participantId);
    offeredPeersRef.current.delete(participantId);
    setRemoteVideos((videos) => videos.filter((video) => video.participantId !== participantId));
  }, []);

  const getPeerConnection = useCallback(
    (participantId: string) => {
      const existing = peerConnections.current.get(participantId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(rtcConfig);
      const stream = localStreamRef.current;

      stream?.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal(participantId, 'ice-candidate', event.candidate.toJSON());
        }
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) return;

        setRemoteVideos((videos) => {
          const exists = videos.some((video) => video.participantId === participantId);
          if (exists) {
            return videos.map((video) => (
              video.participantId === participantId ? { participantId, stream: remoteStream } : video
            ));
          }
          return [...videos, { participantId, stream: remoteStream }];
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          setStatus('P2P 연결에 실패했습니다. 네트워크 또는 TURN 설정을 확인해주세요.');
        }

        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          removePeer(participantId);
        }
      };

      peerConnections.current.set(participantId, pc);
      return pc;
    },
    [removePeer, sendSignal],
  );

  const createOffer = useCallback(
    async (participantId: string) => {
      if (offeredPeersRef.current.has(participantId)) return;

      const pc = getPeerConnection(participantId);
      offeredPeersRef.current.add(participantId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(participantId, 'offer', offer);
    },
    [getPeerConnection, sendSignal],
  );

  const handleSignal = useCallback(
    async (signal: SignalMessage) => {
      if (handledSignalsRef.current.has(signal.id)) return;
      handledSignalsRef.current.add(signal.id);
      lastSignalIdRef.current = Math.max(lastSignalIdRef.current, signal.id);

      const pc = getPeerConnection(signal.from);

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(signal.from, 'answer', answer);
        return;
      }

      if (signal.type === 'answer') {
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        }
        return;
      }

      if (signal.type === 'ice-candidate' && signal.payload) {
        await pc.addIceCandidate(signal.payload as RTCIceCandidateInit);
      }
    },
    [getPeerConnection, sendSignal],
  );

  const reconcilePeers = useCallback(
    (participants: RoomParticipant[]) => {
      const stream = localStreamRef.current;
      if (!stream) return;

      const remoteParticipants = participants.filter((participant) => participant.id !== clientId);
      const remoteIds = new Set(remoteParticipants.map((participant) => participant.id));

      for (const participantId of peerConnections.current.keys()) {
        if (!remoteIds.has(participantId)) removePeer(participantId);
      }

      const me = participants.find((participant) => participant.id === clientId);
      if (!me) return;

      for (const participant of remoteParticipants) {
        getPeerConnection(participant.id);
        if (me.joinedAt > participant.joinedAt) {
          void createOffer(participant.id);
        }
      }
    },
    [clientId, createOffer, getPeerConnection, removePeer],
  );

  useEffect(() => {
    let cancelled = false;

    const join = async () => {
      if (!joinMode) return;

      let pendingStream: MediaStream | null = null;
      try {
        setStatus('카메라와 마이크를 준비하는 중입니다.');
        setError(null);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 960, height: 540 },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        pendingStream = stream;
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        stream.getVideoTracks().forEach((track) => {
          track.enabled = true;
        });
        setLocalStream(stream);

        const fallbackError = getJoinFailureMessage(joinMode);
        const requestBody = {
          clientId,
          name: nameRef.current,
          metrics: metricsRef.current,
          media: mediaRef.current,
        };
        const res = await fetch(joinMode.type === 'public' ? '/api/rooms/match' : '/api/rooms/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(joinMode.type === 'public'
            ? requestBody
            : {
                ...requestBody,
                action: joinMode.type === 'invite-create' ? 'create' : 'join',
                inviteCode: joinMode.type === 'invite-join' ? joinMode.inviteCode : undefined,
              }),
        });
        if (!res.ok) throw new Error(await readErrorMessage(res, fallbackError));

        const snapshot: RoomSnapshot = await res.json();
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setRoom(snapshot);
        setStatus(getJoinStatus(snapshot, joinMode));
      } catch (err) {
        pendingStream?.getTracks().forEach((track) => track.stop());
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        setLocalStream(null);
        setError(err instanceof DOMException ? getMediaErrorMessage(err) : err instanceof Error ? err.message : '화상방을 시작할 수 없습니다.');
        setStatus('입장 실패');
      }
    };

    void join();

    return () => {
      cancelled = true;
    };
  }, [clientId, joinMode]);

  const toggleAudio = useCallback(() => {
    setIsAudioEnabled((current) => {
      const next = !current;
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setIsVideoEnabled((current) => {
      const next = !current;
      localStreamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  const leaveRoom = useCallback(async () => {
    const currentRoom = roomRef.current;
    if (currentRoom) {
      await fetch('/api/rooms/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: currentRoom.roomId, clientId }),
      });
    }

    for (const pc of peerConnections.current.values()) pc.close();
    peerConnections.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    setRemoteVideos([]);
    setLocalStream(null);
    setRoom(null);
  }, [clientId]);

  const markRoomSeen = useCallback(() => {
    missingRoomResponsesRef.current = 0;
    setError((current) => (current === ROOM_EXPIRED_MESSAGE ? null : current));
  }, []);

  const markRoomMissing = useCallback(() => {
    missingRoomResponsesRef.current += 1;
    if (missingRoomResponsesRef.current >= ROOM_MISSING_RESPONSE_LIMIT) {
      setError(ROOM_EXPIRED_MESSAGE);
      setStatus('방 연결 만료');
      return;
    }

    setStatus('방 연결 상태를 재확인하는 중입니다.');
  }, []);

  useEffect(() => {
    if (!room) return;
    reconcilePeers(room.participants);
  }, [reconcilePeers, room]);

  useEffect(() => {
    if (!roomId) return;

    const interval = window.setInterval(async () => {
      try {
        const res = await fetch('/api/rooms/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId,
            clientId,
            name: nameRef.current,
            metrics: metricsRef.current,
            media: mediaRef.current,
          }),
        });
        if (res.status === 404) {
          markRoomMissing();
          return;
        }
        if (!res.ok) return;

        const snapshot: RoomSnapshot = await res.json();
        markRoomSeen();
        setRoom(snapshot);
        setStatus(getWaitingStatus(snapshot));
      } catch {
        setStatus('방 상태를 갱신하지 못했습니다.');
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [clientId, markRoomMissing, markRoomSeen, roomId]);

  useEffect(() => {
    if (!roomId) return;

    const interval = window.setInterval(async () => {
      try {
        const params = new URLSearchParams({
          roomId,
          clientId,
          after: String(lastSignalIdRef.current),
        });
        const res = await fetch(`/api/rooms/events?${params.toString()}`);
        if (res.status === 404) {
          markRoomMissing();
          return;
        }
        if (!res.ok) return;

        const data: { room: RoomSnapshot; signals: SignalMessage[] } = await res.json();
        markRoomSeen();
        setRoom(data.room);
        for (const signal of data.signals) {
          await handleSignal(signal);
        }
      } catch {
        setStatus('시그널링 연결을 확인하는 중입니다.');
      }
    }, 700);

    return () => window.clearInterval(interval);
  }, [clientId, handleSignal, markRoomMissing, markRoomSeen, roomId]);

  useEffect(() => {
    const leaveWithKeepalive = () => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;

      void fetch('/api/rooms/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: currentRoom.roomId, clientId }),
        keepalive: true,
      });
    };

    window.addEventListener('pagehide', leaveWithKeepalive);
    window.addEventListener('beforeunload', leaveWithKeepalive);

    return () => {
      window.removeEventListener('pagehide', leaveWithKeepalive);
      window.removeEventListener('beforeunload', leaveWithKeepalive);
      leaveWithKeepalive();

      for (const pc of peerConnections.current.values()) pc.close();
      peerConnections.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [clientId]);

  return {
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
  };
}
