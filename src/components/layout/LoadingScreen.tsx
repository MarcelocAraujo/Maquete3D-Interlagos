import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { TRACK } from '../../data/circuit/track';

/** Silhueta do traçado (dados reais) usada na abertura. */
function TrackGlyph({ className = '' }: { className?: string }) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < TRACK.n; i++) {
    minX = Math.min(minX, TRACK.x[i]);
    maxX = Math.max(maxX, TRACK.x[i]);
    minZ = Math.min(minZ, TRACK.z[i]);
    maxZ = Math.max(maxZ, TRACK.z[i]);
  }
  const w = maxX - minX;
  const h = maxZ - minZ;
  let d = '';
  for (let i = 0; i < TRACK.n; i += 4) d += `${i ? 'L' : 'M'}${(TRACK.x[i] - minX).toFixed(1)},${(TRACK.z[i] - minZ).toFixed(1)}`;
  return (
    <svg viewBox={`-20 -20 ${w + 40} ${h + 40}`} className={className}>
      <path d={d + 'Z'} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={26} strokeLinejoin="round" />
      <motion.path d={d + 'Z'} fill="none" stroke="#e10600" strokeWidth={12} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, repeatType: 'loop', repeatDelay: 0.3 }} />
    </svg>
  );
}

export function LoadingScreen({ loaded, error }: { loaded: boolean; error: string | null }) {
  const ready = useAppStore((s) => s.ready);
  const step = useAppStore((s) => s.loadingStep);
  const show = !(loaded && ready);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-ink-950" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
          <TrackGlyph className="relative h-56 w-56" />
          <div className="relative mt-8 text-center">
            <div className="font-display text-3xl font-bold tracking-wide text-white">
              INTERLAGOS <span className="text-f1">3D</span> EXPLORER
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.3em] text-ink-400">Autódromo José Carlos Pace · São Paulo</div>
            <div className="mt-6 font-mono text-xs text-ink-300">{error ? <span className="text-f1">Erro: {error}</span> : step}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
