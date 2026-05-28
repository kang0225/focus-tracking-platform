const LoadingView = () => {
  return (
    <div className="fixed inset-0 z-50 flex h-full w-full flex-col items-center justify-center gap-5" style={{ background: 'var(--color-bg)' }}>
      <div className="h-16 w-16 animate-spin rounded-full border-4" style={{
        borderColor: 'var(--color-brand-100)',
        borderTopColor: 'var(--color-brand-500)',
      }} />
      <div className="text-center">
        <p className="text-lg font-medium" style={{ color: 'var(--color-brand-900)' }}>AI 시선 추적 모델 준비 중</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-soft)' }}>카메라 권한을 허용하고 잠시만 기다려주세요.</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>(최초 실행 시 10~20초 소요)</p>
      </div>
    </div>
  );
};

export default LoadingView;
