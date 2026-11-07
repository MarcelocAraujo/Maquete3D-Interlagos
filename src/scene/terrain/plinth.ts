import { TRACK } from '../../data/circuit/track';

/** Recorte retangular da maquete (SIMULATION MODE): pista + margem de entorno. */
function computePlinth() {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < TRACK.n; i++) {
    x0 = Math.min(x0, TRACK.x[i]);
    x1 = Math.max(x1, TRACK.x[i]);
    z0 = Math.min(z0, TRACK.z[i]);
    z1 = Math.max(z1, TRACK.z[i]);
  }
  const m = 230;
  return { x0: Math.floor(x0 - m), x1: Math.ceil(x1 + m), z0: Math.floor(z0 - m), z1: Math.ceil(z1 + m) };
}

export const PLINTH = computePlinth();
/** Área útil da cena (autódromo + entorno imediato). */
export const AREA_MARGIN = -90; // negativo = recorte menor que o PLINTH (≈140 m além do traçado)
export const insideArea = (x: number, z: number) => insidePlinth(x, z, -AREA_MARGIN);

export const insidePlinth = (x: number, z: number, margin = 0) =>
  x > PLINTH.x0 + margin && x < PLINTH.x1 - margin && z > PLINTH.z0 + margin && z < PLINTH.z1 - margin;

export const TRACK_CENTER: [number, number] = [(PLINTH.x0 + PLINTH.x1) / 2, (PLINTH.z0 + PLINTH.z1) / 2];
