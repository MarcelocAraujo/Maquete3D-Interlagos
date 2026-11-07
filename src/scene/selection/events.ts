import type { ThreeEvent } from '@react-three/fiber';
import type { Selection } from '../../data/types';
import { useAppStore } from '../../store/useAppStore';

/** Cliques com arraste (rotação da câmera) não devem selecionar. */
const isDrag = (e: ThreeEvent<MouseEvent>) => (e.delta ?? 0) > 5;

/** Handler de clique que seleciona um elemento fixo (ou resolvido a partir do evento). */
export function onSelectEvent(sel: Selection | ((e: ThreeEvent<MouseEvent>) => Selection | null)) {
  return (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (isDrag(e)) return;
    const st = useAppStore.getState();
    if (st.explore) return;
    const s = typeof sel === 'function' ? sel(e) : sel;
    if (s?.id === 'terreno') {
      st.select(null);
      return;
    }
    st.select(s);
  };
}

/** Handler de hover (passa o elemento sob o cursor para o tooltip). */
export function onHoverEvent(sel: Selection | ((e: ThreeEvent<PointerEvent>) => Selection | null)) {
  return {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const s = typeof sel === 'function' ? sel(e) : sel;
      useAppStore.getState().setHover(s);
      document.body.style.cursor = s ? 'pointer' : '';
    },
    onPointerOut: () => {
      useAppStore.getState().setHover(null);
      document.body.style.cursor = '';
    },
  };
}
