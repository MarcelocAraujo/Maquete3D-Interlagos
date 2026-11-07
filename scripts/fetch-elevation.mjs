// Baixa uma grade de elevação (SRTM 30m via OpenTopoData) cobrindo o autódromo e entorno.
// Uso: node scripts/fetch-elevation.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('research/raw/elevation_grid.json');
const CENTER = { lat: -23.7016, lon: -46.6965 };
const HALF_M = 1600;        // meia largura da grade (m)
const STEP_M = 30;          // espaçamento (m) ~ resolução SRTM
const R = 6371008.8;
const dLat = (m) => (m / R) * (180 / Math.PI);
const dLon = (m) => (m / (R * Math.cos((CENTER.lat * Math.PI) / 180))) * (180 / Math.PI);
const N = Math.round((2 * HALF_M) / STEP_M) + 1;
const dataset = process.argv[2] || 'srtm30m';

const pts = [];
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = -HALF_M + i * STEP_M; // leste
    const y = HALF_M - j * STEP_M;  // norte (linha 0 = norte)
    pts.push({ lat: CENTER.lat + dLat(y), lon: CENTER.lon + dLon(x) });
  }
}
let existing = null;
const outFile = OUT.replace('.json', `_${dataset}.json`);
if (fs.existsSync(outFile)) existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
const values = existing?.values?.length === pts.length ? existing.values : new Array(pts.length).fill(null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let k = 0; k < pts.length; k += 100) {
  if (values.slice(k, k + 100).every((v) => v !== null)) continue;
  const chunk = pts.slice(k, k + 100);
  const loc = chunk.map((p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`).join('|');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`https://api.opentopodata.org/v1/${dataset}?interpolation=bilinear&locations=${loc}`);
      if (res.status === 429) { await sleep(3000); continue; }
      const js = await res.json();
      if (js.status !== 'OK') throw new Error(JSON.stringify(js).slice(0, 200));
      js.results.forEach((r, i) => (values[k + i] = r.elevation));
      break;
    } catch (e) {
      console.error('erro', k, e.message);
      await sleep(3000);
    }
  }
  if ((k / 100) % 10 === 0) {
    console.log(`${dataset}: ${k + chunk.length}/${pts.length}`);
    fs.writeFileSync(outFile, JSON.stringify({ dataset, center: CENTER, halfM: HALF_M, stepM: STEP_M, n: N, values }));
  }
  await sleep(1100);
}
fs.writeFileSync(outFile, JSON.stringify({ dataset, center: CENTER, halfM: HALF_M, stepM: STEP_M, n: N, values }));
console.log('ok', outFile, 'nulls', values.filter((v) => v === null).length);
