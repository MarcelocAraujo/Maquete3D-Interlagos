import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { TopBar } from './TopBar';
import { BottomBar } from './BottomBar';
import { LeftPanel } from '../panels/LeftPanel';
import { RightPanel } from '../panels/RightPanel';
import { MiniMap } from '../map/MiniMap';
import { PerformanceModal } from '../modals/PerformanceModal';
import { HelpModal, HistoryModal, SettingsModal, SourcesModal } from '../modals/OtherModals';
import { shortName, KIND_LABELS } from '../../data/info';
import { IconButton } from '../ui/primitives';

/** Rótulo flutuante do elemento sob o cursor. */
function HoverTooltip() {
  const hover = useAppStore((s) => s.hover);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: PointerEvent) => {
      if (!ref.current) return;
      ref.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
      // só exibe sobre a maquete (na lista lateral o próprio item já indica o elemento)
      ref.current.style.visibility = (e.target as HTMLElement)?.tagName === "CANVAS" ? "visible" : "hidden";
    };
    window.addEventListener('pointermove', h);
    return () => window.removeEventListener('pointermove', h);
  }, []);
  return (
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-30">
      {hover && (
        <div className="rounded-md border border-white/10 bg-ink-900/95 px-2 py-1 text-[11.5px] shadow-xl backdrop-blur">
          <span className="mr-1.5 text-[9.5px] uppercase tracking-wider text-ink-400">{KIND_LABELS[hover.kind] ?? hover.kind}</span>
          <span className="font-semibold text-white">{shortName(hover)}</span>
        </div>
      )}
    </div>
  );
}

/** Crossfade do quadro capturado ao trocar de modo (câmera e seleção preservadas). */
function ModeTransition() {
  const snapshot = useAppStore((s) => s.snapshot);
  const clear = useAppStore((s) => s.clearSnapshot);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (!snapshot) return;
    setFading(false);
    // espera alguns quadros para o novo modo compilar e renderizar
    const t1 = setTimeout(() => setFading(true), 450);
    const t2 = setTimeout(() => clear(), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [snapshot, clear]);
  if (!snapshot) return null;
  return <img src={snapshot} alt="" className="pointer-events-none absolute inset-0 z-[5] h-full w-full object-cover transition-opacity duration-[900ms] ease-out" style={{ opacity: fading ? 0 : 1 }} />;
}

function ViewControls() {
  const requestCamera = useAppStore((s) => s.requestCamera);
  const rightOpen = useAppStore((s) => s.rightOpen);
  const zoom = (k: number) => {
    const c = useAppStore.getState().camera;
    const t = c.target;
    const p = c.position;
    requestCamera({ kind: 'focus', target: t, position: [t[0] + (p[0] - t[0]) * k, t[1] + (p[1] - t[1]) * k, t[2] + (p[2] - t[2]) * k] });
  };
  const rotate = (deg: number) => {
    const c = useAppStore.getState().camera;
    const t = c.target;
    const p = c.position;
    const a = (deg * Math.PI) / 180;
    const dx = p[0] - t[0];
    const dz = p[2] - t[2];
    requestCamera({ kind: 'focus', target: t, position: [t[0] + dx * Math.cos(a) - dz * Math.sin(a), p[1], t[2] + dx * Math.sin(a) + dz * Math.cos(a)] });
  };
  return (
    <div className={`pointer-events-auto absolute bottom-3 z-10 flex flex-col gap-1 rounded-xl p-1 panel transition-all ${rightOpen ? 'right-[356px]' : 'right-3'}`}>
      <IconButton title="Aproximar" onClick={() => zoom(0.6)}>
        <Plus size={15} />
      </IconButton>
      <IconButton title="Afastar" onClick={() => zoom(1.6)}>
        <Minus size={15} />
      </IconButton>
      <IconButton title="Girar à esquerda" onClick={() => rotate(-30)}>
        <RotateCcw size={15} />
      </IconButton>
      <IconButton title="Girar à direita" onClick={() => rotate(30)}>
        <RotateCw size={15} />
      </IconButton>
    </div>
  );
}

export function Interface() {
  const modal = useAppStore((s) => s.modal);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <ModeTransition />
      <TopBar />
      <div className="relative flex-1">
        <LeftPanel />
        <RightPanel />
        <MiniMap />
        <ViewControls />
      </div>
      <BottomBar />
      <HoverTooltip />
      <AnimatePresence>
        {modal === 'performance' && <PerformanceModal key="p" />}
        {modal === 'history' && <HistoryModal key="h" />}
        {modal === 'sources' && <SourcesModal key="s" />}
        {modal === 'settings' && <SettingsModal key="c" />}
        {modal === 'help' && <HelpModal key="?" />}
      </AnimatePresence>
      <motion.div className="hidden" />
    </div>
  );
}
