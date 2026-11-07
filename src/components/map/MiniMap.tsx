import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Tags } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { TRACK, frameAt, rangeLength } from '../../data/circuit/track';
import { CORNERS } from '../../data/circuit/corners';
import { SECTORS } from '../../data/circuit/sectors';
import { STRAIGHTS } from '../../data/circuit/straights';
import { MARKERS } from '../../data/circuit/markers';
import { trackRangeOf } from '../../scene/selection/bounds';
import { cx } from '../ui/primitives';

const W = 250;
const PAD = 16;

/** Mapa esquemático (norte para cima), sincronizado com a maquete 3D. */
export function MiniMap() {
  const open = useAppStore((s) => s.miniMapOpen);
  const setOpen = useAppStore((s) => s.setMiniMapOpen);
  const selection = useAppStore((s) => s.selection);
  const hover = useAppStore((s) => s.hover);
  const select = useAppStore((s) => s.select);
  const setHover = useAppStore((s) => s.setHover);
  const cam = useAppStore((s) => s.camera);
  const showSectors = useAppStore((s) => s.showSectors);
  const leftOpen = useAppStore((s) => s.leftOpen);
  const [allLabels, setAllLabels] = useState(true);

  const geo = useMemo(() => {
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
    const k = (W - PAD * 2) / (maxX - minX);
    const H = (maxZ - minZ) * k + PAD * 2;
    const P = (x: number, z: number): [number, number] => [PAD + (x - minX) * k, PAD + (z - minZ) * k];
    const pathOf = (s0: number, s1: number) => {
      const len = rangeLength(s0, s1);
      const n = Math.max(2, Math.ceil(len / 6));
      let d = '';
      for (let i = 0; i <= n; i++) {
        const f = frameAt(s0 + (len * i) / n);
        const [x, y] = P(f.x, f.z);
        d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      }
      return d;
    };
    const full = pathOf(0, TRACK.length - 0.01) + 'Z';
    const pit = TRACK.pit.x.map((x, i) => P(x, TRACK.pit.z[i])).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const corners = CORNERS.map((c) => {
      const f = frameAt(c.apexS);
      // rótulo deslocado para o lado de fora da curva
      const sign = c.direction === 'esquerda' ? -1 : 1;
      const [x, y] = P(f.x + f.lx * sign * 38, f.z + f.lz * sign * 38);
      const [ax, ay] = P(f.x, f.z);
      return { c, x, y, ax, ay, path: pathOf(c.s0, c.s1) };
    });
    const straights = STRAIGHTS.map((s) => {
      const mid = s.s0 + rangeLength(s.s0, s.s1) / 2;
      const f = frameAt(mid);
      const [x, y] = P(f.x - f.lx * 40, f.z - f.lz * 40);
      return { s, x, y, path: pathOf(s.s0, s.s1) };
    });
    const sectors = SECTORS.map((s) => ({ s, path: pathOf(s.s0, s.s1 - 0.01) }));
    const markers = MARKERS.filter((m) => m.kind === 'line' || m.kind === 'timing').map((m) => {
      const f = frameAt(m.s);
      const half = 9;
      const [x1, y1] = P(f.x + f.lx * half, f.z + f.lz * half);
      const [x2, y2] = P(f.x - f.lx * half, f.z - f.lz * half);
      return { m, x1, y1, x2, y2 };
    });
    return { H, P, full, pit, corners, straights, sectors, markers, k };
  }, []);

  const selRange = trackRangeOf(selection);
  const selPath = useMemo(() => {
    if (!selRange) return null;
    const len = rangeLength(selRange[0], selRange[1]);
    const n = Math.max(2, Math.ceil(len / 6));
    let d = '';
    for (let i = 0; i <= n; i++) {
      const f = frameAt(selRange[0] + (len * i) / n);
      const [x, y] = geo.P(f.x, f.z);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
  }, [selRange?.[0], selRange?.[1], geo]); // eslint-disable-line react-hooks/exhaustive-deps

  // câmera: posição + cone de visão
  const [cx_, cy_] = geo.P(cam.position[0], cam.position[2]);
  const [tx, ty] = geo.P(cam.target[0], cam.target[2]);
  const ang = Math.atan2(ty - cy_, tx - cx_);
  const coneLen = 26;
  const spread = 0.42;

  const selColor = selection?.kind === 'sector' ? SECTORS.find((s) => s.id === selection.id)?.color : '#ffffff';

  return (
    <div className={cx('panel pointer-events-auto absolute bottom-3 z-10 rounded-xl transition-all', leftOpen ? 'left-[284px]' : 'left-3')} style={{ width: W + 2 }}>
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">Mapa do circuito</span>
        <div className="flex items-center gap-1">
          <button type="button" title="Mostrar/ocultar todas as identificações" onClick={() => setAllLabels(!allLabels)} className={cx('rounded p-1', allLabels ? 'text-white' : 'text-ink-500')}>
            <Tags size={13} />
          </button>
          <button type="button" onClick={() => setOpen(!open)} className="rounded p-1 text-ink-400 hover:text-white" title={open ? 'Recolher' : 'Expandir'}>
            {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>
      {open && (
        <svg width={W} height={geo.H} className="block" onMouseLeave={() => setHover(null)}>
          {/* pit lane */}
          <path d={geo.pit} fill="none" stroke="#ff8a00" strokeOpacity={0.55} strokeWidth={1.4} strokeDasharray="3 2" />
          {/* traçado / setores */}
          {showSectors || selection?.kind === 'sector' ? (
            geo.sectors.map(({ s, path }) => (
              <path key={s.id} d={path} fill="none" stroke={s.color} strokeWidth={5} strokeLinecap="round" className="cursor-pointer" onClick={() => select({ kind: 'sector', id: s.id })} onMouseEnter={() => setHover({ kind: 'sector', id: s.id })} opacity={selection?.kind === 'sector' && selection.id !== s.id ? 0.35 : 1} />
            ))
          ) : (
            <path d={geo.full} fill="none" stroke="#c4cad2" strokeWidth={4.5} strokeLinejoin="round" />
          )}
          {/* retas clicáveis */}
          {geo.straights.map(({ s, path }) => (
            <path key={s.id} d={path} fill="none" stroke="transparent" strokeWidth={12} className="cursor-pointer" onClick={() => select({ kind: 'straight', id: s.id })} onMouseEnter={() => setHover({ kind: 'straight', id: s.id })} />
          ))}
          {/* curvas clicáveis */}
          {geo.corners.map(({ c, path }) => (
            <path key={c.id} d={path} fill="none" stroke={hover?.id === c.id ? 'rgba(255,255,255,0.6)' : 'transparent'} strokeWidth={10} strokeLinecap="round" className="cursor-pointer" onClick={() => select({ kind: 'corner', id: c.id })} onMouseEnter={() => setHover({ kind: 'corner', id: c.id })} />
          ))}
          {/* destaque da seleção */}
          {selPath && <path d={selPath} fill="none" stroke={selColor ?? '#fff'} strokeWidth={6.5} strokeLinecap="round" className="pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px rgba(225,6,0,0.9))' }} />}
          {selPath && selection?.kind !== 'sector' && <path d={selPath} fill="none" stroke="#e10600" strokeWidth={3.5} strokeLinecap="round" className="pointer-events-none" />}
          {/* linhas de chegada/largada e cronometragem */}
          {geo.markers.map(({ m, x1, y1, x2, y2 }) => (
            <line key={m.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={m.kind === 'line' ? '#fff' : m.color} strokeWidth={m.kind === 'line' ? 2 : 1.5} className="pointer-events-none" />
          ))}
          {/* números das curvas */}
          {geo.corners.map(({ c, x, y }) => {
            const active = selection?.kind === 'corner' && selection.id === c.id;
            if (!allLabels && !active) return null;
            return (
              <g key={c.id} className="cursor-pointer" onClick={() => select({ kind: 'corner', id: c.id })} onMouseEnter={() => setHover({ kind: 'corner', id: c.id })}>
                <circle cx={x} cy={y} r={7} fill={active ? '#e10600' : '#0e1014'} stroke={active ? '#fff' : 'rgba(255,255,255,0.35)'} strokeWidth={1} />
                <text x={x} y={y + 3} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#fff" fontFamily="Saira Condensed, sans-serif">
                  {c.number}
                </text>
              </g>
            );
          })}
          {allLabels &&
            geo.straights.map(({ s, x, y }) => (
              <text key={s.id} x={x} y={y} textAnchor="middle" fontSize={7.5} fill="#98a1ad" className="pointer-events-none" fontFamily="Inter, sans-serif">
                {s.name.replace(' (Reta Principal)', '').replace(' (T5–T6)', '')}
              </text>
            ))}
          {/* câmera */}
          <g className="pointer-events-none">
            <path d={`M${cx_},${cy_} L${cx_ + Math.cos(ang - spread) * coneLen},${cy_ + Math.sin(ang - spread) * coneLen} A${coneLen},${coneLen} 0 0 1 ${cx_ + Math.cos(ang + spread) * coneLen},${cy_ + Math.sin(ang + spread) * coneLen} Z`} fill="rgba(225,6,0,0.18)" stroke="rgba(225,6,0,0.6)" strokeWidth={0.8} />
            <circle cx={cx_} cy={cy_} r={3.2} fill="#e10600" stroke="#fff" strokeWidth={1} />
            <circle cx={tx} cy={ty} r={1.8} fill="#fff" />
          </g>
          <text x={W - 8} y={12} textAnchor="end" fontSize={8} fill="#6b7582" fontFamily="JetBrains Mono, monospace">
            N ↑
          </text>
        </svg>
      )}
    </div>
  );
}
