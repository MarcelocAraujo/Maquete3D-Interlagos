import { EffectComposer, N8AO, Bloom, SMAA, Vignette, ToneMapping, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useAppStore } from '../store/useAppStore';

/** Pós-processamento por modo visual e qualidade. */
export function Effects() {
  const mode = useAppStore((s) => s.mode);
  const quality = useAppStore((s) => s.quality);
  const time = useAppStore((s) => s.lighting);
  const ao = useAppStore((s) => s.ao);
  const useAO = ao && quality !== 'low';
  const night = time === 'night';

  if (mode === 'sim') {
    return (
      <EffectComposer multisampling={0} enableNormalPass={false}>
        {useAO ? <N8AO halfRes={false} aoRadius={6} distanceFalloff={1.2} intensity={2.2} quality={quality === 'high' ? 'medium' : 'performance'} /> : <></>}
        <Bloom mipmapBlur intensity={night ? 1.4 : 0.35} luminanceThreshold={night ? 0.55 : 0.92} luminanceSmoothing={0.25} />
        <HueSaturation saturation={0.06} />
        <BrightnessContrast contrast={0.06} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.32} darkness={0.42} />
        <SMAA />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {useAO ? <N8AO halfRes={false} aoRadius={8} distanceFalloff={1.5} intensity={2.4} color="#000000" quality={quality === 'high' ? 'medium' : 'performance'} /> : <></>}
      {night ? <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.6} /> : <></>}
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.25} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  );
}
