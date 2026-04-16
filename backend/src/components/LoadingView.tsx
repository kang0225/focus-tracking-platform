// components/LoadingView.tsx
import React from 'react';

const LoadingView: React.FC = () => {
  return (
    <div className="flex flex-col items-center gap-6 z-50 bg-slate-900 w-full h-full fixed inset-0 justify-center">
      {/* 로딩 스피너 (회전 애니메이션) */}
      <div className="w-20 h-20 border-4 border-slate-700 border-t-green-400 rounded-full animate-spin"></div>
      
      <div className="text-center">
        <p className="text-2xl font-bold text-yellow-400 mb-2">AI 시선 추적 모델 준비 중</p>
        <p className="text-slate-400">카메라 권한을 허용하고 잠시만 기다려주세요.</p>
        <p className="text-xs text-slate-600 mt-1">(최초 실행 시 10~20초 소요될 수 있습니다.)</p>
      </div>
    </div>
  );
};

export default LoadingView;