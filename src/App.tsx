import { useEffect, useState } from 'react';
import { loadWorld } from './scene/world/world';
import { useAppStore } from './store/useAppStore';
import { Scene } from './scene/Scene';
import { Interface } from './components/layout/Interface';
import { LoadingScreen } from './components/layout/LoadingScreen';
import { ErrorBoundary } from './components/layout/ErrorBoundary';

export function App() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setStep = useAppStore((s) => s.setLoadingStep);

  useEffect(() => {
    loadWorld(setStep)
      .then(() => {
        setStep('Construindo a maquete 3D…');
        setLoaded(true);
      })
      .catch((e) => setError(String(e)));
  }, [setStep]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950">
      {loaded && (
        <div className="absolute inset-0">
          <ErrorBoundary>
            <Scene />
          </ErrorBoundary>
        </div>
      )}
      {loaded && <Interface />}
      <LoadingScreen error={error} loaded={loaded} />
    </div>
  );
}
