import { useMemo } from 'react';
import { Crosshair, MapPin, Mountain, Ruler, Video } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { altitude, nearestS, toLatLon } from '../../data/circuit/track';
import { sectorOf, cornerAt } from '../../data/circuit/corners';
import { shortName } from '../../data/info';
import { getWorld } from '../../scene/world/world';

const SECTOR_COLORS = ['#e8160c', '#bf8a10', '#2b8fd6'];

function ScaleBar({ distance }: { distance: number }) {
  // largura de referência ~ 90 px; escala aproximada pela distância e FOV (38°)
  const metersPerPx = (2 * distance * Math.tan((38 * Math.PI) / 360)) / window.innerHeight;
  const target = metersPerPx * 90;
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const nice = steps.find((s) => s >= target) ?? 1000;
  const px = nice / metersPerPx;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 border-x border-b border-ink-300" style={{ width: Math.min(140, px) }} />
      <span className="font-mono text-[10.5px] text-ink-200">{nice >= 1000 ? `${nice / 1000} km` : `${nice} m`}</span>
    </div>
  );
}

export function BottomBar() {
  const cam = useAppStore((s) => s.camera);
  const selection = useAppStore((s) => s.selection);
  const mode = useAppStore((s) => s.mode);
  const explore = useAppStore((s) => s.explore);

  const info = useMemo(() => {
    const [tx, , tz] = cam.target;
    const ns = nearestS(tx, tz);
    const ground = getWorld().height.sample(tx, tz);
    const [lat, lon] = toLatLon(tx, tz);
    const corner = ns.d < 60 ? cornerAt(ns.s) : undefined;
    return { ns, ground, lat, lon, sector: sectorOf(ns.s), corner };
  }, [cam.target]);

  return (
    <footer className="pointer-events-auto relative z-20 flex h-8 items-center gap-5 border-t border-white/[0.07] bg-ink-950/85 px-4 text-[11px] text-ink-300 backdrop-blur-xl">
      <span className="flex items-center gap-1.5" title="Alvo da câmera (coordenadas geográficas)">
        <MapPin size={12} className="text-ink-500" />
        <span className="font-mono">
          {info.lat.toFixed(5)}, {info.lon.toFixed(5)}
        </span>
      </span>
      <span className="flex items-center gap-1.5" title="Altitude do terreno no alvo (SRTM, estimativa)">
        <Mountain size={12} className="text-ink-500" />
        <span className="font-mono">{Math.round(altitude(info.ground))} m</span>
      </span>
      <span className="flex items-center gap-1.5" title="Posição da câmera (m, relativo à origem do modelo)">
        <Video size={12} className="text-ink-500" />
        <span className="font-mono">
          x {cam.position[0].toFixed(0)} · z {cam.position[2].toFixed(0)} · alt {Math.round(altitude(cam.position[1]))} m
        </span>
      </span>
      <span className="flex items-center gap-1.5" title="Trecho de pista mais próximo do alvo">
        <Crosshair size={12} className="text-ink-500" />
        <span className="h-2 w-2 rounded-full" style={{ background: SECTOR_COLORS[info.sector - 1] }} />
        <span>
          Setor {info.sector}
          {info.corner ? ` · T${info.corner.number} ${info.corner.name}` : ''}
          <span className="ml-1 font-mono text-ink-500">s={Math.round(info.ns.s)} m</span>
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <Ruler size={12} className="text-ink-500" />
        <ScaleBar distance={cam.distance || 1000} />
      </span>
      <span className="ml-auto flex items-center gap-3">
        <span>
          Selecionado: <span className="text-white">{shortName(selection)}</span>
        </span>
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-display text-[10px] font-bold tracking-widest text-ink-200">{explore ? 'EXPLORAÇÃO' : mode === 'game' ? 'GAME' : 'SIMULATION'}</span>
      </span>
    </footer>
  );
}
