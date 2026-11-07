import { useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function Modal({ title, subtitle, children, width = 880 }: { title: string; subtitle?: string; children: ReactNode; width?: number }) {
  const setModal = useAppStore((s) => s.setModal);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setModal(null);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setModal]);
  return (
    <motion.div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModal(null)}>
      <motion.div
        className="panel flex max-h-full w-full flex-col overflow-hidden rounded-2xl"
        style={{ maxWidth: width }}
        initial={{ y: 16, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 10, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-start justify-between border-b border-white/[0.07] px-6 py-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-ink-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={() => setModal(null)} className="rounded-md p-1.5 text-ink-400 hover:bg-white/5 hover:text-white" title="Fechar (Esc)">
            <X size={18} />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}
