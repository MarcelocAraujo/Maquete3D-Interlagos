import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';

/**
 * Transição suave entre modos: captura o quadro atual (logo após a renderização,
 * ainda dentro do mesmo frame), troca o modo e deixa a interface fazer o
 * crossfade da imagem capturada sobre a nova cena. Câmera e seleção são preservadas.
 */
export function SnapshotGrabber() {
  const { gl } = useThree();
  useFrame(() => {
    const st = useAppStore.getState();
    if (!st.snapshotRequested) return;
    let url: string | null = null;
    try {
      url = gl.domElement.toDataURL('image/jpeg', 0.85);
    } catch {
      url = null;
    }
    const next = st.snapshotRequested;
    useAppStore.setState({ snapshotRequested: null, snapshot: url });
    st.setMode(next);
  }, 10);
  return null;
}
