'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const errorMessages: Record<string, string> = {
  missing_config: 'Google OAuth 환경 변수가 아직 설정되지 않았습니다.',
  invalid_state: '로그인 요청을 확인하지 못했습니다. 다시 시도해주세요.',
  token_failed: 'Google 인증 토큰을 가져오지 못했습니다.',
  profile_failed: 'Google 프로필을 가져오지 못했습니다.',
  oauth_failed: 'Google 로그인 중 문제가 발생했습니다.',
};

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <section className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900/90 p-8 shadow-2xl">
        <p className="text-sm font-semibold text-cyan-300">FocusTracker</p>
        <h1 className="mt-2 text-3xl font-bold">로그인</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Google 계정으로 로그인한 뒤 집중도 모니터링, 화상 집중방, 대시보드를 사용할 수 있습니다.
        </p>

        {error && (
          <div className="mt-6 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
            {errorMessages[error] ?? '로그인에 실패했습니다. 다시 시도해주세요.'}
          </div>
        )}

        <a
          href="/api/auth/login"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-md bg-white px-4 text-sm font-bold text-slate-950 transition hover:bg-slate-200"
        >
          Google로 계속하기
        </a>

        <p className="mt-5 text-xs leading-5 text-slate-500">
          개발 환경에서는 Google OAuth 클라이언트의 승인된 리디렉션 URI를
          {' '}
          <span className="font-mono text-slate-300">http://localhost:3000/api/auth/callback</span>
          로 설정하세요.
        </p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950" />}>
      <LoginContent />
    </Suspense>
  );
}
