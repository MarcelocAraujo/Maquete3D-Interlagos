import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, Compass, Eye, Home, Layers, Map, Navigation, PanelLeftOpen, Tag, Users, Warehouse, Building2, Flag, Route } from 'lucide-react';
import { useAppStore, LAYER_KEYS, LAYER_LABELS, LABEL_KEYS, LABEL_LABELS, type CameraPreset } from '../../store/useAppStore';
import { CORNERS } from '../../data/circuit/corners';
import { STRAIGHTS } from '../../data/circuit/straights';
import { SECTORS } from '../../data/circuit/sectors';
import { GRANDSTANDS, PIT_GARAGES } from '../../data/facilities';
import type { Selection } from '../../data/types';
import { cx, Toggle } from '../ui/primitives';

function Section({ title, icon, children, defaultOpen = true, right }: { title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.06] py-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-1 text-left">
        <span className="text-ink-400">{icon}</span>
        <span className="flex-1 font-display text-[12px] font-bold uppercase tracking-[0.16em] text-ink-200">{title}</span>
        {right}
        <ChevronDown size={14} className={cx('text-ink-500 transition', !open && '-rotate-90')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-2 pt-1.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Item({ sel, children, accent }: { sel: Selection; children: ReactNode; accent?: string }) {
  const selection = useAppStore((s) => s.selection);
  const select = useAppStore((s) => s.select);
  const setHover = useAppStore((s) => s.setHover);
  const active = selection?.kind === sel.kind && selection.id === sel.id;
  return (
    <button
      type="button"
      onClick={() => select(active ? null : sel)}
      onMouseEnter={() => setHover(sel)}
      onMouseLeave={() => setHover(null)}
      className={cx(
        'group flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12.5px] transition',
        active ? 'bg-f1/15 text-white ring-1 ring-f1/50' : 'text-ink-200 hover:bg-white/[0.05] hover:text-white',
      )}
      style={active && accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
    >
      {children}
    </button>
  );
}

const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'top', label: 'Superior' },
  { id: 'side', label: 'Lateral' },
  { id: 'front', label: 'Frontal' },
  { id: 'iso', label: 'Isométrica' },
];

export function LeftPanel() {
  const open = useAppStore((s) => s.leftOpen);
  const setOpen = useAppStore((s) => s.setLeftOpen);
  const requestCamera = useAppStore((s) => s.requestCamera);
  const select = useAppStore((s) => s.select);
  const explore = useAppStore((s) => s.explore);
  const setExplore = useAppStore((s) => s.setExplore);
  const showSectors = useAppStore((s) => s.showSectors);
  const setShowSectors = useAppStore((s) => s.setShowSectors);
  const layers = useAppStore((s) => s.layers);
  const toggleLayer = useAppStore((s) => s.toggleLayer);
  const setAllLayers = useAppStore((s) => s.setAllLayers);
  const labelsOn = useAppStore((s) => s.labelsOn);
  const setLabelsOn = useAppStore((s) => s.setLabelsOn);
  const labels = useAppStore((s) => s.labels);
  const toggleLabel = useAppStore((s) => s.toggleLabel);
  const selection = useAppStore((s) => s.selection);

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="panel pointer-events-auto absolute left-3 top-3 z-10 flex h-9 items-center gap-2 rounded-lg px-3 text-xs text-ink-200 hover:text-white" title="Abrir menu">
        <PanelLeftOpen size={15} /> Menu
      </button>
    );

  return (
    <motion.aside initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="panel pointer-events-auto absolute bottom-3 left-3 top-3 z-10 flex w-[268px] flex-col overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2.5">
        <div className="font-display text-[13px] font-bold uppercase tracking-[0.2em] text-white">Explorar</div>
        <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-ink-400 hover:bg-white/5 hover:text-white" title="Recolher">
          <ChevronLeft size={16} />
        </button>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto pb-3">
        <Section title="Navegação" icon={<Navigation size={14} />}>
          <button
            type="button"
            onClick={() => {
              select(null);
              requestCamera({ kind: 'preset', preset: 'overview' });
            }}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-md bg-f1 py-2 font-display text-[13px] font-bold tracking-[0.14em] text-white shadow-lg shadow-f1/20 transition hover:bg-[#ff1a12]"
          >
            <Home size={14} /> VISÃO GERAL
          </button>
          <div className="grid grid-cols-4 gap-1">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => requestCamera({ kind: 'preset', preset: p.id })} className="rounded-md border border-white/10 bg-white/[0.03] py-1.5 text-[10.5px] text-ink-200 transition hover:border-white/25 hover:text-white">
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-1.5">
            <Toggle checked={explore} onChange={setExplore} label={<span className="flex items-center gap-1.5"><Compass size={13} /> Modo exploração livre</span>} />
            {explore && <p className="px-2 pb-1 text-[10.5px] leading-snug text-ink-400">WASD/setas movem, Q/E sobem e descem, Shift acelera. Cliques não selecionam.</p>}
          </div>
        </Section>

        <Section
          title="Setores F1"
          icon={<Flag size={14} />}
          right={
            <span onClick={(e) => e.stopPropagation()} className="mr-1">
              <button type="button" onClick={() => setShowSectors(!showSectors)} className={cx('rounded px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wider', showSectors ? 'bg-white text-ink-950' : 'bg-white/5 text-ink-300')}>
                {showSectors ? 'CORES ON' : 'CORES OFF'}
              </button>
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-1.5">
            {SECTORS.map((s) => {
              const sel = selection;
              const active = sel?.kind === 'sector' && sel.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => select(active ? null : { kind: 'sector', id: s.id })}
                  className={cx('rounded-md border px-2 py-2 text-left transition', active ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]')}
                  style={{ boxShadow: `inset 0 -3px 0 ${s.color}` }}
                >
                  <div className="font-display text-[15px] font-bold leading-none text-white">S{s.number}</div>
                  <div className="mt-1 font-mono text-[10px] text-ink-400">{Math.round(s.lengthM)} m</div>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 px-1 text-[10px] leading-snug text-ink-500">Limites conforme FIA Event Notes 2022: S1 a 168 m da T4; S2 a 85 m da T12.</p>
        </Section>

        <Section title="Curvas" icon={<Route size={14} />}>
          <div className="space-y-px">
            {CORNERS.map((c) => (
              <Item key={c.id} sel={{ kind: 'corner', id: c.id }} accent={c.sector === 1 ? '#e8160c' : c.sector === 2 ? '#bf8a10' : '#2b8fd6'}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] font-display text-[11px] font-bold text-white">{c.number}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-ink-500">{c.direction === 'esquerda' ? <ArrowLeft size={12} /> : <ArrowRight size={12} />}</span>
                <span className="h-3 w-[3px] rounded-full" style={{ background: c.sector === 1 ? '#e8160c' : c.sector === 2 ? '#bf8a10' : '#2b8fd6' }} />
              </Item>
            ))}
          </div>
        </Section>

        <Section title="Retas" icon={<Map size={14} />}>
          {STRAIGHTS.map((s) => (
            <Item key={s.id} sel={{ kind: 'straight', id: s.id }}>
              <span className="flex-1 truncate">{s.name}</span>
              <span className="font-mono text-[10.5px] text-ink-500">{Math.round(s.lengthM)} m</span>
            </Item>
          ))}
        </Section>

        <Section title="Boxes" icon={<Warehouse size={14} />}>
          <Item sel={{ kind: 'pit', id: 'pit' }}>
            <span className="flex-1">Prédio dos boxes e pit lane</span>
          </Item>
          <Item sel={{ kind: 'structure', id: 'control-tower' }}>
            <span className="flex-1">Torre / centro de operações</span>
          </Item>
          <div className="mt-1.5 grid grid-cols-8 gap-1 px-1">
            {Array.from({ length: PIT_GARAGES }, (_, i) => i + 1).map((n) => {
              const sel = selection;
              const active = sel?.kind === 'garage' && sel.id === `g-${n}`;
              return (
                <button
                  key={n}
                  type="button"
                  title={`Box ${n}`}
                  onClick={() => select({ kind: 'garage', id: `g-${n}` })}
                  className={cx('rounded py-1 font-mono text-[9.5px] transition', active ? 'bg-f1 text-white' : 'bg-white/[0.05] text-ink-300 hover:bg-white/10 hover:text-white')}
                >
                  {String(n).padStart(2, '0')}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Arquibancadas" icon={<Users size={14} />} defaultOpen={false}>
          {GRANDSTANDS.map((g) => (
            <Item key={g.id} sel={{ kind: 'grandstand', id: g.id }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: g.seatColor }} />
              <span className="flex-1 truncate">{g.name}</span>
              {g.temporary && <span className="text-[9px] uppercase tracking-wider text-ink-500">temp.</span>}
            </Item>
          ))}
        </Section>

        <Section title="Estruturas" icon={<Building2 size={14} />} defaultOpen={false}>
          {[
            { kind: 'building', id: 'paddock', label: 'Paddock e edifício das equipes', facility: true },
            { kind: 'structure', id: 'paddock-veiculos', label: 'Trailers e veículos do paddock' },
            { kind: 'structure', id: 'kart', label: 'Kartódromo Ayrton Senna' },
            { kind: 'water', id: 'lake', label: 'Lago interno' },
            { kind: 'structure', id: 'drag', label: 'Pista de arrancada' },
            { kind: 'structure', id: 'passarela', label: 'Passarela' },
            { kind: 'structure', id: 'marshal', label: 'Postos de fiscalização' },
          ].map((it) => (
            <Item key={it.id} sel={{ kind: (it.facility ? 'structure' : it.kind) as Selection['kind'], id: it.id }}>
              <span className="flex-1 truncate">{it.label}</span>
            </Item>
          ))}
        </Section>

        <Section title="Camadas da maquete" icon={<Layers size={14} />} defaultOpen={false} right={<span onClick={(e) => e.stopPropagation()} className="mr-1 flex gap-1"><button type="button" className="text-[9.5px] text-ink-400 hover:text-white" onClick={() => setAllLayers(true)}>todas</button></span>}>
          <div className="grid grid-cols-1">
            {LAYER_KEYS.map((k) => (
              <Toggle key={k} checked={layers[k]} onChange={() => toggleLayer(k)} label={LAYER_LABELS[k]} />
            ))}
          </div>
        </Section>

        <Section title="Identificações" icon={<Tag size={14} />} defaultOpen={false}>
          <Toggle checked={labelsOn} onChange={setLabelsOn} label={<span className="flex items-center gap-1.5"><Eye size={13} /> Mostrar identificações</span>} />
          <div className={cx(!labelsOn && 'pointer-events-none opacity-40')}>
            {LABEL_KEYS.map((k) => (
              <Toggle key={k} checked={labels[k]} onChange={() => toggleLabel(k)} label={LABEL_LABELS[k]} />
            ))}
          </div>
        </Section>
      </div>
    </motion.aside>
  );
}
