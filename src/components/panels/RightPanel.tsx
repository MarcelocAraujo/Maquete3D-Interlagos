import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Crosshair, Info, PanelRightOpen, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getInfo, type InfoView } from '../../data/info';
import { GENERAL_FACTS } from '../../data/facilities';
import { LAP_FACTS } from '../../data/circuit/sectors';
import { SOURCES } from '../../data/sources';
import type { Fact } from '../../data/types';
import { cx, ReliabilityBadge, SectionTitle, SourceLinks } from '../ui/primitives';
import { TRACK } from '../../data/circuit/track';

function FactRow({ f }: { f: Fact }) {
  const [open, setOpen] = useState(false);
  const hasMore = !!(f.note || f.sources?.length);
  return (
    <div className="border-b border-white/[0.05] py-2 last:border-0">
      <button type="button" onClick={() => hasMore && setOpen(!open)} className={cx('flex w-full items-start gap-2 text-left', hasMore && 'cursor-pointer')}>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] uppercase tracking-wider text-ink-400">{f.label}</div>
          <div className={cx('mt-0.5 text-[12.5px] leading-snug', f.reliability === 'indisponivel' ? 'italic text-ink-400' : 'text-ink-100')}>{f.value}</div>
        </div>
        <ReliabilityBadge r={f.reliability} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {f.note && <p className="mt-1.5 text-[11px] leading-snug text-ink-300">{f.note}</p>}
            <SourceLinks ids={f.sources} className="mt-1.5" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stats({ stats, accent }: { stats: NonNullable<InfoView['stats']>; accent?: string }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2">
          <div className="text-[9.5px] uppercase tracking-[0.14em] text-ink-500">{s.label}</div>
          <div className="mt-0.5 truncate font-display text-[15px] font-semibold text-white" style={accent && s.label === 'Dificuldade' ? { color: accent } : undefined} title={s.value}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoBody({ info }: { info: InfoView }) {
  return (
    <div className="space-y-4">
      {info.stats && <Stats stats={info.stats} accent={info.accent} />}
      {info.description && <p className="text-[12.5px] leading-relaxed text-ink-200">{info.description}</p>}
      {info.sections?.map((s) => (
        <div key={s.title}>
          <SectionTitle>{s.title}</SectionTitle>
          <p className="px-1 text-[12px] leading-relaxed text-ink-300">{s.text}</p>
        </div>
      ))}
      <div>
        <SectionTitle right={<span className="text-[9.5px] text-ink-500">clique para ver fonte</span>}>Dados</SectionTitle>
        <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5">
          {info.facts.map((f, i) => (
            <FactRow key={f.label + i} f={f} />
          ))}
        </div>
      </div>
      {info.sources.length > 0 && (
        <div>
          <SectionTitle>Fontes</SectionTitle>
          <ul className="space-y-1 px-1">
            {info.sources.map((id) => {
              const s = SOURCES[id];
              if (!s) return null;
              return (
                <li key={id} className="text-[11px] leading-snug text-ink-400">
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-ink-200 underline decoration-white/20 underline-offset-2 hover:text-white">
                    {s.publisher}
                  </a>{' '}
                  — {s.title}
                  {s.date ? ` (${s.date})` : ''}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function GeneralInfo() {
  const select = useAppStore((s) => s.select);
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-lg border border-white/[0.07] bg-gradient-to-br from-f1/20 via-transparent to-transparent p-3">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-f1">Circuito atual</div>
        <div className="mt-1 font-display text-2xl font-bold leading-none text-white">4.309 m</div>
        <div className="mt-1 text-[11.5px] text-ink-300">15 curvas · anti-horário · 3 setores de cronometragem</div>
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink-200">
        O Autódromo José Carlos Pace fica no bairro de Interlagos, zona sul de São Paulo, entre as represas Guarapiranga e Billings. Clique em qualquer curva, reta, setor, arquibancada ou estrutura da maquete para ver os detalhes.
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {(['s1', 's2', 's3'] as const).map((id, i) => (
          <button key={id} type="button" onClick={() => select({ kind: 'sector', id })} className="rounded-lg border border-white/[0.07] bg-white/[0.03] py-2 text-center transition hover:bg-white/[0.07]" style={{ boxShadow: `inset 0 -3px 0 ${['#e8160c', '#bf8a10', '#2b8fd6'][i]}` }}>
            <div className="font-display text-sm font-bold text-white">Setor {i + 1}</div>
          </button>
        ))}
      </div>
      <div>
        <SectionTitle>Ficha técnica</SectionTitle>
        <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5">
          {[LAP_FACTS.officialLength, LAP_FACTS.modelLength, ...GENERAL_FACTS.slice(1)].map((f, i) => (
            <FactRow key={f.label + i} f={f} />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[10.5px] leading-snug text-ink-400">
        Geometria: {TRACK.n} amostras a cada {TRACK.ds.toFixed(2)} m sobre o traçado do OpenStreetMap; relevo SRTM 30 m. Cada dado traz sua classificação de confiabilidade.
      </div>
    </div>
  );
}

export function RightPanel() {
  const open = useAppStore((s) => s.rightOpen);
  const setOpen = useAppStore((s) => s.setRightOpen);
  const selection = useAppStore((s) => s.selection);
  const select = useAppStore((s) => s.select);
  const requestCamera = useAppStore((s) => s.requestCamera);
  const info = selection ? getInfo(selection) : null;

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="panel pointer-events-auto absolute right-3 top-3 z-10 flex h-9 items-center gap-2 rounded-lg px-3 text-xs text-ink-200 hover:text-white" title="Abrir informações">
        <PanelRightOpen size={15} /> Informações
      </button>
    );

  return (
    <motion.aside initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="panel pointer-events-auto absolute bottom-3 right-3 top-3 z-10 flex w-[340px] flex-col overflow-hidden rounded-xl">
      <div className="relative border-b border-white/[0.07] px-4 pb-3 pt-3">
        <div className="flex items-start gap-3">
          {info?.number ? (
            <div className="flex h-11 min-w-11 items-center justify-center rounded-lg px-2 font-display text-2xl font-bold text-white" style={{ background: info.accent ?? '#e10600' }}>
              {info.number}
            </div>
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/[0.06] text-ink-300">
              <Info size={18} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{info ? info.kindLabel : 'Visão geral'}</div>
            <div className="truncate font-display text-[21px] font-bold leading-tight text-white" title={info?.title}>
              {info ? info.title : 'Autódromo de Interlagos'}
            </div>
            {info?.subtitle && <div className="truncate text-[11px] text-ink-400">{info.subtitle}</div>}
          </div>
          <div className="flex gap-1">
            {selection && (
              <button type="button" title="Centralizar câmera" onClick={() => requestCamera({ kind: 'focus' })} className="rounded p-1 text-ink-400 hover:bg-white/5 hover:text-white">
                <Crosshair size={15} />
              </button>
            )}
            {selection ? (
              <button type="button" title="Limpar seleção" onClick={() => select(null)} className="rounded p-1 text-ink-400 hover:bg-white/5 hover:text-white">
                <X size={16} />
              </button>
            ) : (
              <button type="button" title="Recolher" onClick={() => setOpen(false)} className="rounded p-1 text-ink-400 hover:bg-white/5 hover:text-white">
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
        {info?.accent && <div className="absolute bottom-0 left-0 h-[2px] w-full" style={{ background: `linear-gradient(90deg, ${info.accent}, transparent)` }} />}
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence mode="wait">
          <motion.div key={selection ? `${selection.kind}:${selection.id}` : 'general'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {info ? <InfoBody info={info} /> : selection ? <p className="text-sm text-ink-400">Sem informações para este elemento.</p> : <GeneralInfo />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
