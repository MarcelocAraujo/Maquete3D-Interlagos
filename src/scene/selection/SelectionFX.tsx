import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../../store/useAppStore';
import { sceneUniforms, trackUniforms } from '../materials/patch';
import { getSelectable, trackRangeOf } from './bounds';
import { sectorById } from '../../data/circuit/sectors';

const damp = THREE.MathUtils.damp;

/**
 * Anima os uniforms de destaque (pista) e desenha o "realce" dos objetos
 * selecionados (prédios, arquibancadas, boxes...): casca luminosa + contorno.
 */
export function SelectionFX() {
  const selection = useAppStore((s) => s.selection);
  const hover = useAppStore((s) => s.hover);
  const mode = useAppStore((s) => s.mode);

  const range = trackRangeOf(selection);
  const hoverRange = trackRangeOf(hover && hover.kind !== 'sector' ? hover : null);

  useFrame((_, dt) => {
    const st = useAppStore.getState();
    const u = trackUniforms;
    const r = trackRangeOf(st.selection);
    if (r) {
      u.uSel.value.x = r[0];
      u.uSel.value.y = r[1];
    }
    const lift = st.selection?.kind === 'sector' ? 2.5 : st.selection?.kind === 'straight' ? 3.5 : 5;
    u.uSel.value.w = damp(u.uSel.value.w, lift, 4, dt);
    u.uSel.value.z = damp(u.uSel.value.z, r ? 1 : 0, 5, dt);
    if (st.selection?.kind === 'sector') {
      const sec = sectorById(st.selection.id);
      if (sec) u.uSelColor.value.lerp(new THREE.Color(sec.color), Math.min(1, dt * 6));
    } else u.uSelColor.value.lerp(new THREE.Color(st.mode === 'sim' ? '#ff2a1a' : '#e10600'), Math.min(1, dt * 6));
    u.uDim.value = damp(u.uDim.value, st.selection ? 1 : 0, 5, dt);
    u.uSectorMix.value = damp(u.uSectorMix.value, st.showSectors ? 1 : 0, 5, dt);
    const hr = trackRangeOf(st.hover && st.hover.kind !== 'sector' && st.hover.id !== st.selection?.id ? st.hover : null);
    if (hr) {
      u.uHover.value.x = hr[0];
      u.uHover.value.y = hr[1];
    }
    u.uHover.value.z = damp(u.uHover.value.z, hr ? 1 : 0, 10, dt);
    sceneUniforms.uSceneDim.value = damp(sceneUniforms.uSceneDim.value, st.selection ? 1 : 0, 5, dt);
  });

  const obj = useMemo(() => (selection && !range ? getSelectable(selection) : null), [selection, range]);
  const hoverObj = useMemo(() => (hover && !hoverRange && hover.id !== selection?.id ? getSelectable(hover) : null), [hover, hoverRange, selection]);

  return (
    <>
      {obj?.geometry && <Highlight geometry={obj.geometry} matrix={obj.matrix} color={mode === 'sim' ? '#ff3b2a' : '#e10600'} strong />}
      {hoverObj?.geometry && <Highlight geometry={hoverObj.geometry} matrix={hoverObj.matrix} color="#ffffff" />}
    </>
  );
}

function Highlight({ geometry, matrix, color, strong }: { geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4; color: string; strong?: boolean }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 25), [geometry]);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: strong ? 0.16 : 0.08, depthWrite: false, depthTest: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, toneMapped: false }),
    [color, strong],
  );
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color, transparent: true, opacity: strong ? 1 : 0.6, depthTest: false, toneMapped: false }), [color, strong]);
  const group = useMemo(() => {
    const g = new THREE.Group();
    if (matrix) {
      g.matrixAutoUpdate = false;
      g.matrix.copy(matrix);
    }
    return g;
  }, [matrix]);
  useFrame(({ clock }) => {
    if (strong) {
      mat.opacity = 0.1 + 0.07 * Math.sin(clock.elapsedTime * 3);
      group.position.y = 0;
    }
  });
  return (
    <primitive object={group}>
      <mesh geometry={geometry} material={mat} renderOrder={10} />
      <lineSegments geometry={edges} material={lineMat} renderOrder={11} />
    </primitive>
  );
}
