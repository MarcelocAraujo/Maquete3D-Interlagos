import { BarChart3, BookOpen, FileText, Gamepad2, HelpCircle, Maximize, Minimize, Moon, Settings, Sun, Sunset, Box } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { IconButton, Segmented } from '../ui/primitives';

export function TopBar() {
  const mode = useAppStore((s) => s.mode);
  const requestMode = useAppStore((s) => s.requestMode);
  const lighting = useAppStore((s) => s.lighting);
  const setLighting = useAppStore((s) => s.setLighting);
  const setModal = useAppStore((s) => s.setModal);
  const modal = useAppStore((s) => s.modal);
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <header className="pointer-events-auto relative z-20 flex h-14 items-center gap-4 border-b border-white/[0.07] bg-ink-950/85 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-md bg-f1">
          <svg viewBox="0 0 32 32" className="h-5 w-5">
            <path d="M8 22c2-6 4-11 9-12s7 3 6 6-5 2-6 5 3 4 6 3" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
        </div>
        <div className="leading-none">
          <div className="font-display text-[17px] font-extrabold tracking-wide text-white">
            INTERLAGOS <span className="text-f1">3D</span> EXPLORER
          </div>
          <div className="mt-0.5 text-[9.5px] uppercase tracking-[0.22em] text-ink-400">Autódromo José Carlos Pace · 4.309 m</div>
        </div>
      </div>

      <div className="mx-auto flex items-center gap-3">
        <Segmented
          value={mode}
          onChange={requestMode}
          options={[
            { value: 'game', label: <><Gamepad2 size={14} /> GAME MODE</>, title: 'Mapa tático estilizado, inspirado em jogos de gestão de F1' },
            { value: 'sim', label: <><Box size={14} /> SIMULATION MODE</>, title: 'Visual realista de simulador: texturas, céu, sombras e cidade' },
          ]}
        />
        <div className="h-6 w-px bg-white/10" />
        <Segmented
          size="sm"
          value={lighting}
          onChange={setLighting}
          options={[
            { value: 'day', label: <><Sun size={13} /> Dia</>, title: 'Sol do meio do dia (ao norte, hemisfério sul)' },
            { value: 'sunset', label: <><Sunset size={13} /> Fim de tarde</>, title: 'Sol baixo a oeste-noroeste' },
            { value: 'night', label: <><Moon size={13} /> Noite</>, title: 'Somente iluminação artificial existente (vias, pátios, prédios)' },
          ]}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <IconButton title="Histórico de Interlagos" onClick={() => setModal('history')} active={modal === 'history'}>
          <BookOpen size={15} />
        </IconButton>
        <IconButton title="Análise de desempenho" onClick={() => setModal('performance')} active={modal === 'performance'}>
          <BarChart3 size={15} />
        </IconButton>
        <IconButton title="Fontes e metodologia" onClick={() => setModal('sources')} active={modal === 'sources'}>
          <FileText size={15} />
        </IconButton>
        <IconButton title="Ajuda e controles" onClick={() => setModal('help')} active={modal === 'help'}>
          <HelpCircle size={15} />
        </IconButton>
        <IconButton title="Configurações" onClick={() => setModal('settings')} active={modal === 'settings'}>
          <Settings size={15} />
        </IconButton>
        <IconButton title={fs ? 'Sair da tela cheia' : 'Tela cheia'} onClick={toggleFs}>
          {fs ? <Minimize size={15} /> : <Maximize size={15} />}
        </IconButton>
      </div>
    </header>
  );
}
