interface GazeDotProps {
  x: number;
  y: number;
  visible?: boolean;
}

export default function GazeDot({ x, y, visible = true }: GazeDotProps) {
  if (!visible || x <= 0 || y <= 0) return null;

  return (
    <div 
      aria-hidden="true"
      className="pointer-events-none fixed z-[95] h-5 w-5 rounded-full border-2 border-white bg-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.95)]"
      style={{ 
        left: `${x}px`, 
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
        transition: 'left 0.05s linear, top 0.05s linear',
      }}
    />
  );
}
