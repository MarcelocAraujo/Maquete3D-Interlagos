import { Component, type ReactNode } from 'react';

/** Evita tela preta: mostra o erro da cena 3D e permite recarregar. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[i3d] erro na cena 3D', error);
  }
  render() {
    if (this.state.error)
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-950 p-8 text-center">
          <div>
            <div className="font-display text-2xl font-bold text-white">Não foi possível renderizar a maquete</div>
            <p className="mt-2 font-mono text-xs text-ink-400">{this.state.error.message}</p>
            <p className="mt-2 text-sm text-ink-300">Tente reduzir a qualidade gráfica ou usar um navegador com WebGL 2 atualizado.</p>
            <button type="button" onClick={() => location.reload()} className="mt-4 rounded-md bg-f1 px-4 py-2 text-sm font-semibold text-white">
              Recarregar
            </button>
          </div>
        </div>
      );
    return this.props.children;
  }
}
