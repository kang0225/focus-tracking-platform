'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';

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
    <main className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--color-bg-tint)' }}>
      <section className="w-full max-w-md">
        <Link href="/" className="mb-7 flex items-center justify-center gap-2">
          <i className="ti ti-target text-2xl" style={{ color: 'var(--color-brand-600)' }} aria-hidden="true" />
          <span className="text-lg font-medium" style={{ color: 'var(--color-brand-700)' }}>FocusTracking</span>
        </Link>

        <div className="ft-card" style={{ padding: '2rem 2rem' }}>
          <div className="text-xs font-medium" style={{ color: 'var(--color-brand-600)' }}>환영합니다</div>
          <h1 className="mt-1 text-2xl font-medium" style={{ color: 'var(--color-brand-900)', letterSpacing: '-0.01em' }}>
            Google로 로그인
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-text-soft)' }}>
            로그인하면 집중도 측정·화상 스터디룸·랭킹을 모두 사용할 수 있습니다.
          </p>

          {error && (
            <div className="mt-5 rounded-md border px-3 py-2.5 text-sm" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C' }}>
              {errorMessages[error] ?? '로그인에 실패했습니다. 다시 시도해주세요.'}
            </div>
          )}

          <a
            href="/api/auth/login"
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--color-brand-500)', color: 'white' }}
          >
            <i className="ti ti-brand-google text-base" aria-hidden="true" />
            Google 계정으로 계속하기
          </a>

          <Link href="/" className="mt-4 block text-center text-xs" style={{ color: 'var(--color-text-soft)' }}>
            ← 처음 화면으로
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" style={{ background: 'var(--color-bg-tint)' }} />}>
      <LoginContent />
    </Suspense>
  );
}
