/**
 * @deprecated 이 모듈은 비어있다. 모든 라우트가 Postgres + Redis 기반의
 * `@/db/repositories/*` 와 `@/db/redis` 로 이전 완료됐다.
 *
 * 이전 인메모리 Map 구현 (pairingCodes, videoRooms, currentPairing) 은 모두 제거됐고,
 * 같은 의미의 데이터는 다음 위치로:
 *   - pairingCodes        → pairing_codes (Postgres)
 *   - currentPairing      → active_pairings (Postgres) + live metrics (Redis)
 *   - videoRooms          → rooms + room_participants (Postgres) + presence (Redis)
 *   - signals             → signals:room:<id> stream (Redis)
 *
 * 새 코드는 이 파일 import 하지 말 것. import 발견 시 컴파일 에러로 알림.
 */
export {};
