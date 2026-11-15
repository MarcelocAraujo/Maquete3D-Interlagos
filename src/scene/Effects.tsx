import { EffectComposer, N8AO, Bloom, SMAA, Vignette, ToneMapping, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { EdgeDetectionMode, SMAAPreset, ToneMappingMode } from 'postprocessing';
import { useAppStore } from '../store/useAppStore';
import { styleOf } from './modes/modeStyles';

const TONE = { aces: ToneMappingMode.ACES_FILMIC, agx: ToneMappingMode.AGX, neutral: ToneMappingMode.NEUTRAL } as const;

/**
 * Anti-aliasing por perfil: MSAA no alvo de renderização (resolve bordas geométricas —
 * postes, telas, zebras, beirais) + SMAA no fim (bordas de textura/sombra e o que o
 * MSAA não cobre). O MSAA do canvas (antialias: true) não vale nada aqui porque a cena
 * é renderizada num alvo intermediário pelo compositor.
 */
const MSAA = { low: 0, medium: 2, high: 4 } as const;
const SMAA_PRESET = { low: SMAAPreset.MEDIUM, medium: SMAAPreset.HIGH, high: SMAAPreset.ULTRA } as const;

/** Pós-processamento: parâmetros por modo/horário em modes/modeStyles.ts. */
export function Effects() {
  const mode = useAppStore((s) => s.mode);
  const quality = useAppStore((s) => s.quality);
  const time = useAppStore((s) => s.lighting);
  const ao = useAppStore((s) => s.ao);
  const p = styleOf(mode).post[time];
  const useAO = ao && quality !== 'low';

  return (
    <EffectComposer key={quality} multisampling={MSAA[quality]} enableNormalPass={false}>
      {useAO ? <N8AO halfRes={false} aoRadius={p.aoRadius} distanceFalloff={1.3} intensity={p.aoIntensity} color={p.aoColor} quality={quality === 'high' ? 'medium' : 'performance'} /> : <></>}
      {p.bloom > 0 ? <Bloom mipmapBlur intensity={p.bloom} luminanceThreshold={p.bloomThreshold} luminanceSmoothing={0.25} /> : <></>}
      <HueSaturation saturation={p.saturation} />
      <BrightnessContrast brightness={p.brightness} contrast={p.contrast} />
      <ToneMapping mode={TONE[p.toneMapping]} />
      {p.vignette > 0 ? <Vignette offset={0.3} darkness={p.vignette} /> : <></>}
      <SMAA preset={SMAA_PRESET[quality]} edgeDetectionMode={EdgeDetectionMode.COLOR} />
    </EffectComposer>
  );
}
