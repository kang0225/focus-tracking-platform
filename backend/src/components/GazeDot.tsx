// components/GazeDot.tsx
import React from 'react';

// Props 타입 정의
interface GazeDotProps {
  x: number;
  y: number;
}

const GazeDot: React.FC<GazeDotProps> = ({ x, y }) => {
  return (
    <div 
      className="fixed w-6 h-6 bg-red-500 rounded-full pointer-events-none z-[9999] shadow-[0_0_20px_rgba(239,68,68,1)] border-2 border-white"
      style={{ 
        // 자바스크립트로 동적인 위치 설정
        left: `${x}px`, 
        top: `${y}px`,
        // 점의 정중앙이 시선 위치에 오도록 보정
        transform: 'translate(-50%, -50%)',
        // 움직임을 부드럽게 만들기 위한 transition (필요에 따라 조절)
        transition: 'all 0.05s linear'
      }}
    />
  );
};

export default GazeDot;