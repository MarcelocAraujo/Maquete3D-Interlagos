import { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore, type LabelKey } from '../../store/useAppStore';
import { CORNERS } from '../../data/circuit/corners';
import { STRAIGHTS } from '../../data/circuit/straights';
import { SECTORS } from '../../data/circuit/sectors';
import { MARKERS } from '../../data/circuit/markers';
import { GRANDSTANDS } from '../../data/facilities';
import { frameAt, rangeLength } from '../../data/circuit/track';
import { getSelectable, registerSelectable } from '../selection/bounds';
import type { Selection } from '../../data/types';
import { getWorld, polyCentroid } from '../world/world';

interface LabelDef {
  key: string;
  group: LabelKey;
  pos: THREE.Vector3 | (() => THREE.Vector3 | null);
  sel?: Selection;
  minD?: number; // visível acima desta distância
  maxD?: number; // visível abaixo desta distância
  render: (active: boolean) => React.ReactNode;
}

const SECTOR_OF = (n: number) => (n === 1 ? '#e8160c' : n === 2 ? '#bf8a10' : '#2b8fd6');

function buildDefs(): LabelDef[] {
  const defs: LabelDef[] = [];
  for (const c of CORNERS) {
    const f = frameAt(c.apexS);
    const sign = c.direction === 'esquerda' ? -1 : 1; // lado externo
    const w = sign > 0 ? f.wl : f.wr;
    const base = new THREE.Vector3(f.x + f.lx * sign * (w + 14), f.y + 7, f.z + f.lz * sign * (w + 14));
    defs.push({
      key: `cn-${c.id}`,
      group: 'cornerNumbers',
      pos: base,
      sel: { kind: 'corner', id: c.id },
      render: (active) => (
        <div className={`flex h-[22px] min-w-[22px] items-center justify-center rounded-full border font-display text-[12px] font-bold text-white shadow-lg ${active ? 'border-white bg-[#e10600] scale-125' : 'border-white/60 bg-[#111317]/90'}`} style={{ boxShadow: `0 0 0 2px ${SECTOR_OF(c.sector)}55` }}>
          {c.number}
        </div>
      ),
    });
    defs.push({
      key: `cnm-${c.id}`,
      group: 'cornerNames',
      pos: base.clone().add(new THREE.Vector3(0, -0.01, 0)),
      sel: { kind: 'corner', id: c.id },
      maxD: 950,
      render: (active) => <div className={`mt-[30px] rounded px-1.5 py-[1px] text-[11px] font-semibold ${active ? 'bg-white text-black' : 'bg-black/55 text-white'}`}>{c.name}</div>,
    });
  }
  for (const s of STRAIGHTS) {
    const mid = s.s0 + rangeLength(s.s0, s.s1) / 2;
    const f = frameAt(mid);
    defs.push({
      key: `st-${s.id}`,
      group: 'straights',
      pos: new THREE.Vector3(f.x - f.lx * (f.wr + 18), f.y + 5, f.z - f.lz * (f.wr + 18)),
      sel: { kind: 'straight', id: s.id },
      maxD: 1500,
      render: (active) => (
        <div className={`whitespace-nowrap rounded-sm border-l-2 px-2 py-0.5 font-display text-[12px] font-semibold uppercase tracking-wider ${active ? 'border-white bg-white text-black' : 'border-white/70 bg-black/55 text-white'}`}>{s.name}</div>
      ),
    });
  }
  for (const s of SECTORS) {
    const mid = s.s0 + rangeLength(s.s0, s.s1) / 2;
    const f = frameAt(mid + (s.number === 2 ? 220 : 0));
    defs.push({
      key: `sec-${s.id}`,
      group: 'sectors',
      pos: new THREE.Vector3(f.x, f.y + 40, f.z),
      sel: { kind: 'sector', id: s.id },
      minD: 700,
      render: (active) => (
        <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-display text-[13px] font-bold tracking-[0.14em] text-white ${active ? 'ring-2 ring-white' : ''}`} style={{ background: `${s.color}dd` }}>
          SETOR {s.number}
        </div>
      ),
    });
  }
  for (const m of MARKERS) {
    const f = frameAt(m.s);
    defs.push({
      key: `mk-${m.id}`,
      group: 'markers',
      pos: new THREE.Vector3(f.x + f.lx * (f.wl + 4), f.y + 3, f.z + f.lz * (f.wl + 4)),
      maxD: 900,
      render: () => (
        <div className="whitespace-nowrap rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-semibold text-black" style={{ background: m.color }} title={m.note}>
          {m.short}
        </div>
      ),
    });
  }
  const facility = (key: string, label: string, sel: Selection, offY = 18, maxD = 2200) =>
    defs.push({
      key,
      group: 'facilities',
      sel,
      maxD,
      pos: () => {
        const b = getSelectable(sel)?.box;
        if (!b) return null;
        const c = b.getCenter(new THREE.Vector3());
        return new THREE.Vector3(c.x, b.max.y + offY, c.z);
      },
      render: (active) => (
        <div className={`whitespace-nowrap rounded px-2 py-0.5 font-display text-[12px] font-bold uppercase tracking-[0.12em] ${active ? 'bg-[#e10600] text-white' : 'bg-white/90 text-black'}`}>{label}</div>
      ),
    });
  facility('f-pit', 'Boxes', { kind: 'pit', id: 'pit' }, 8);
  facility('f-tower', 'Centro de operações', { kind: 'structure', id: 'control-tower' }, 6, 900);
  facility('f-paddock', 'Paddock', { kind: 'structure', id: 'paddock' }, 8, 1400);
  facility('f-kart', 'Kartódromo', { kind: 'structure', id: 'kart' }, 10, 1800);
  facility('f-lake', 'Lago', { kind: 'water', id: 'lake' }, 6, 1800);
  for (const g of GRANDSTANDS) {
    defs.push({
      key: `gs-${g.id}`,
      group: 'grandstands',
      sel: { kind: 'grandstand', id: g.id },
      maxD: 1100,
      pos: () => {
        const b = getSelectable({ kind: 'grandstand', id: g.id })?.box;
        if (!b) return null;
        const c = b.getCenter(new THREE.Vector3());
        return new THREE.Vector3(c.x, b.max.y + 4, c.z);
      },
      render: (active) => (
        <div className={`flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-[1px] text-[11px] font-semibold ${active ? 'bg-white text-black' : 'bg-black/60 text-white'}`}>
          <span className="h-2 w-2 rounded-sm" style={{ background: g.seatColor }} />
          {g.name}
        </div>
      ),
    });
  }
  return defs;
}

export function Labels() {
  const labelsOn = useAppStore((s) => s.labelsOn);
  const labels = useAppStore((s) => s.labels);
  const selection = useAppStore((s) => s.selection);
  const showSectors = useAppStore((s) => s.showSectors);
  const select = useAppStore((s) => s.select);
  const defs = useMemo(buildDefs, []);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const anchors = useRef<Record<string, THREE.Group | null>>({});
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    for (const d of defs) {
      const el = refs.current[d.key];
      const g = anchors.current[d.key];
      if (!el || !g) continue;
      if (typeof d.pos === 'function') {
        const p = d.pos();
        if (!p) {
          el.style.opacity = '0';
          continue;
        }
        g.position.copy(p);
      }
      const dist = camera.position.distanceTo(g.getWorldPosition(tmp));
      const active = !!selection && !!d.sel && selection.kind === d.sel.kind && selection.id === d.sel.id;
      let vis = true;
      if (d.maxD && dist > d.maxD && !active) vis = false;
      if (d.minD && dist < d.minD && !active && !(d.group === 'sectors' && showSectors)) vis = false;
      el.style.opacity = vis ? '1' : '0';
      el.style.pointerEvents = vis && d.sel ? 'auto' : 'none';
    }
  });

  if (!labelsOn) return null;
  return (
    <group>
      {defs
        .filter((d) => labels[d.group])
        .map((d) => {
          const active = !!selection && !!d.sel && selection.kind === d.sel.kind && selection.id === d.sel.id;
          return (
            <group key={d.key} ref={(g) => { anchors.current[d.key] = g; }} position={d.pos instanceof THREE.Vector3 ? d.pos : [0, -9999, 0]}>
              <Html center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
                <div
                  ref={(el) => {
                    refs.current[d.key] = el;
                  }}
                  className="label-chip cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (d.sel) select(d.sel);
                  }}
                >
                  {d.render(active)}
                </div>
              </Html>
            </group>
          );
        })}
    </group>
  );
}

/** Registra caixas de estruturas sem componente próprio (paddock, kartódromo, arrancada, passarela). */
let registered = false;
export function registerFacilityBounds() {
  if (registered) return;
  registered = true;
  {
    const { features, height } = getWorld();
    const boxOfPts = (pts: [number, number][], h = 6) => {
      const b = new THREE.Box3();
      for (const p of pts) {
        const y = height.sample(p[0], p[1]);
        b.expandByPoint(new THREE.Vector3(p[0], y, p[1]));
        b.expandByPoint(new THREE.Vector3(p[0], y + h, p[1]));
      }
      return b;
    };
    const paddock = features.buildings.find((b) => b.id === 138433083);
    if (paddock) registerSelectable({ kind: 'structure', id: 'paddock' }, boxOfPts(paddock.poly, paddock.h + 2));
    const kartPts = features.lines.kart.flat();
    if (kartPts.length) registerSelectable({ kind: 'structure', id: 'kart' }, boxOfPts(kartPts, 4));
    const drag = features.lines.drag.flat();
    if (drag.length) registerSelectable({ kind: 'structure', id: 'drag' }, boxOfPts(drag, 4));
    const fb = features.lines.footbridge.flat();
    if (fb.length) registerSelectable({ kind: 'structure', id: 'passarela' }, boxOfPts(fb, 10));
    const posts = features.buildings.filter((b) => /^\d+$/.test(b.n ?? ''));
    if (posts.length) registerSelectable({ kind: 'structure', id: 'marshal' }, boxOfPts(posts.map((p) => polyCentroid(p.poly)), 4));
  }
}
