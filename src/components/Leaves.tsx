/** Leaf cluster in the mood board's palette: green leaves, one tan, one brown. Decorative only. */
const Leaf = ({ fill, vein, rot, x, y, s = 1 }: { fill: string; vein: string; rot: number; x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <path d="M0 0 C22 -34 78 -38 120 0 C78 38 22 34 0 0Z" fill={fill} />
    <path d="M4 0 H112" stroke={vein} strokeWidth="1.6" fill="none" opacity=".7" />
    {[18, 36, 54, 72, 90].map((n) => (<g key={n} stroke={vein} strokeWidth="1" opacity=".5" fill="none"><path d={`M${n} 0 L${n + 16} -15`} /><path d={`M${n} 0 L${n + 16} 15`} /></g>))}
  </g>
);
export function Leaves({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 190" aria-hidden="true" focusable="false">
      <Leaf x={40} y={150} rot={-58} s={1.15} fill="#3f8a63" vein="#d9f0dd" />
      <Leaf x={120} y={182} rot={-96} s={1.1} fill="#6aa26d" vein="#e6f6e4" />
      <Leaf x={70} y={175} rot={-24} s={1.05} fill="#a97c55" vein="#f2d9b8" />
      <Leaf x={150} y={150} rot={-128} s={.95} fill="#2f7458" vein="#cdeadb" />
      <Leaf x={20} y={110} rot={-88} s={.75} fill="#d2ad7d" vein="#fff0d6" />
    </svg>
  );
}
