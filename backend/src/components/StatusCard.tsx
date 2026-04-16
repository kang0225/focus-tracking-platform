// src/components/StatusCard.tsx

interface StatusCardProps {
  label: string;
  status: string;
  isActive: boolean;
  colorClass: string;
}

// 명시적으로 export를 붙여줘야 합니다!
export const StatusCard = ({ label, status, isActive, colorClass }: StatusCardProps) => {
  return (
    <div className={`rounded-2xl bg-gradient-to-br from-${colorClass}-900/30 to-slate-900/70 p-4 ring-1 ring-${colorClass}-500/20`}>
      <div className="flex items-center gap-3">
        {/* Tailwind에서 동적 클래스를 사용할 때 주의: 
            컴파일러가 클래스명을 인식하지 못할 수 있으므로 안전한 방식은 아래와 같습니다. */}
        <div className={`h-3 w-3 rounded-full ${
          isActive 
            ? (colorClass === 'emerald' ? 'bg-emerald-400 animate-pulse' : 
               colorClass === 'red' ? 'bg-red-400 animate-pulse' : 'bg-blue-400 animate-pulse')
            : 'bg-slate-600'
        }`}></div>
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className={`font-semibold ${
            isActive 
              ? (colorClass === 'emerald' ? 'text-emerald-400' : 
                 colorClass === 'red' ? 'text-red-400' : 'text-blue-400')
              : 'text-slate-500'
          }`}>
            {status}
          </p>
        </div>
      </div>
    </div>
  );
};