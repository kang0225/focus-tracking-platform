// components/GazeDashboard.tsx
import React from 'react';

// Props 타입 정의
interface GazeDashboardProps {
  x: number;
  y: number;
}

const GazeDashboard: React.FC<GazeDashboardProps> = ({ x, y }) => {
  return (
    <div className="fixed sm:bottom-4 sm:left-4 md:bottom-6 md:left-6 lg:bottom-10 lg:left-10 top-4 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:top-auto sm:left-4 bg-gradient-to-br from-slate-900/95 to-slate-800/95 p-4 sm:p-6 rounded-2xl shadow-2xl border border-slate-600/50 backdrop-blur-md z-20">
      <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-300 mb-2 sm:mb-3 flex items-center gap-2">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-ping"></div>
        Real-time Gaze
      </h2>
      
      <div className="flex gap-4 sm:gap-8">
        {/* X 좌표 */}
        <div className="text-center">
          <p className="text-2xl sm:text-3xl font-mono font-bold text-green-400 mb-1 drop-shadow-lg">
            {x}
          </p>
          <span className="text-xs text-slate-400 uppercase tracking-wide">X Axis</span>
        </div>
        
        {/* Y 좌표 */}
        <div className="text-center">
          <p className="text-2xl sm:text-3xl font-mono font-bold text-blue-400 mb-1 drop-shadow-lg">
            {y}
          </p>
          <span className="text-xs text-slate-400 uppercase tracking-wide">Y Axis</span>
        </div>
      </div>
      
      {/* Decorative elements */}
      <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-br from-green-400 to-blue-400 rounded-full opacity-75"></div>
      <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full opacity-50"></div>
    </div>
  );
};

export default GazeDashboard;