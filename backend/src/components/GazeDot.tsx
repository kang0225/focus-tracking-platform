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
      className="pointer-events-none fixed z-[95] h-4 w-4 rounded-full border-2 border-white bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.22),0_0_24px_rgba(244,63,94,0.95)]"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
        transition: 'left 0.05s linear, top 0.05s linear',
      }}
    />
  );
}
