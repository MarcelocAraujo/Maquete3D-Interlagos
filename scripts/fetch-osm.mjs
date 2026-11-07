// Baixa do OpenStreetMap (Overpass API) os dados usados pelo pipeline.
// Uso: node scripts/fetch-osm.mjs   →  research/raw/osm_raceway.json e osm_area.json
// Dados © colaboradores do OpenStreetMap, licença ODbL 1.0.
import fs from 'node:fs';

const OUT = 'research/raw';
fs.mkdirSync(OUT, { recursive: true });
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const UA = 'Interlagos3DExplorer/1.0 (projeto de visualização; contato via repositório)';

const queries = {
  osm_raceway: `[out:json][timeout:90];
(
  way["highway"="raceway"](-23.7150,-46.7080,-23.6930,-46.6890);
  relation["highway"="raceway"](-23.7150,-46.7080,-23.6930,-46.6890);
  relation["sport"="motor"](-23.7150,-46.7080,-23.6930,-46.6890);
  way["area:highway"](-23.7150,-46.7080,-23.6930,-46.6890);
);
out body geom;`,
  osm_area: `[out:json][timeout:180];
( nwr(-23.7175,-46.7120,-23.6905,-46.6860); );
out body geom;`,
};

for (const [name, q] of Object.entries(queries)) {
  console.log('baixando', name, '…');
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const txt = await res.text();
  fs.writeFileSync(`${OUT}/${name}.json`, txt);
  console.log('ok', name, (txt.length / 1e6).toFixed(1), 'MB');
}
