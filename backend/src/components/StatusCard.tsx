interface StatusCardProps {
  label: string;
  status: string;
  isActive: boolean;
  colorClass?: string;
}

const DOT_COLORS: Record<string, string> = {
  emerald: 'var(--color-success)',
  red: 'var(--color-danger)',
  blue: 'var(--color-brand-500)',
};

export const StatusCard = ({ label, status, isActive, colorClass = 'blue' }: StatusCardProps) => {
  const activeColor = DOT_COLORS[colorClass] ?? 'var(--color-brand-500)';
  return (
    <div className="ft-card" style={{ padding: '0.875rem 1rem' }}>
      <div className="flex items-center gap-2.5">
        <div
          className={`h-2 w-2 rounded-full ${isActive ? 'animate-pulse' : ''}`}
          style={{ background: isActive ? activeColor : 'var(--color-text-muted)' }}
        />
        <div>
          <p className="text-xs" style={{ color: 'var(--color-text-soft)' }}>{label}</p>
          <p className="text-sm font-medium" style={{ color: isActive ? activeColor : 'var(--color-text-muted)' }}>
            {status}
          </p>
        </div>
      </div>
    </div>
  );
};
