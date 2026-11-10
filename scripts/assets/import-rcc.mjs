// Importa os modelos do pacote "Cartoon Race Track Interlagos" (RCC Design, Unity Asset Store)
// para o formato web (GLB otimizado) e gera public/assets/rcc/manifest.json.
//
// O pacote é pago e licenciado (Standard Unity Asset Store EULA): os arquivos NÃO vêm com este
// repositório e a pasta public/assets/rcc/ está no .gitignore. Veja docs/ASSETS-RCC.md.
//
// Uso:
//   node scripts/assets/import-rcc.mjs <caminho>
//   <caminho> = arquivo .unitypackage exportado do Unity  OU  pasta com os .fbx/.png do pacote
//
// Etapas: extrai FBX + texturas → converte FBX→GLB (fbx2gltf) → otimiza (gltf-transform:
// dedup, weld, simplificação leve, texturas ≤1024 px em WebP, compressão meshopt) → classifica
// cada modelo por papel (árvore, muro, pneus, motorhome, tenda, placa, cone...) → manifest.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune, simplify, textureCompress, meshopt, center } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const SRC = process.argv[2];
const OUT = path.resolve('public/assets/rcc');
const WORK = path.resolve('research/rcc-work');
if (!SRC || !fs.existsSync(SRC)) {
  console.error('Uso: node scripts/assets/import-rcc.mjs <arquivo.unitypackage | pasta com .fbx>');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Extração (.unitypackage = tar.gz; cada entrada tem "pathname" e "asset")
// ---------------------------------------------------------------------------
function extractUnityPackage(file, dest) {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  const entries = new Map(); // guid -> { pathname, asset }
  for (let off = 0; off + 512 <= buf.length; ) {
    const name = buf.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(buf.toString('utf8', off + 124, off + 136).replace(/\0.*$/, '').trim() || '0', 8);
    const prefix = buf.toString('utf8', off + 345, off + 500).replace(/\0.*$/, '');
    const full = (prefix ? prefix + '/' : '') + name;
    const data = buf.subarray(off + 512, off + 512 + size);
    const [guid, part] = full.replace(/^\.\//, '').split('/');
    if (guid && part) {
      if (!entries.has(guid)) entries.set(guid, {});
      if (part === 'pathname') entries.get(guid).pathname = data.toString('utf8').split('\n')[0].trim();
      if (part === 'asset') entries.get(guid).asset = Buffer.from(data);
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  let n = 0;
  for (const { pathname, asset } of entries.values()) {
    if (!pathname || !asset) continue;
    if (!/\.(fbx|obj|png|jpe?g|tga|tif)$/i.test(pathname)) continue;
    const target = path.join(dest, pathname);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, asset);
    n++;
  }
  console.log(`extraídos ${n} arquivos de modelo/textura`);
  return dest;
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const root = SRC.toLowerCase().endsWith('.unitypackage') ? extractUnityPackage(SRC, path.join(WORK, 'extracted')) : SRC;
const fbxFiles = walk(root).filter((f) => /\.(fbx|obj)$/i.test(f));
console.log(`${fbxFiles.length} arquivos FBX encontrados`);

// ---------------------------------------------------------------------------
// 2. Classificação por nome de arquivo (ajustável à mão no manifest)
// ---------------------------------------------------------------------------
const ROLES = [
  ['skip', /track|terrain|ground|road|asphalt|curb|kerb|circuit|layout|lake|skybox/i],
  ['tree', /tree|palm|pine|bush|arvore|plant|cypress|acacia|oak|shrub/i],
  ['tyre', /tyre|tire|pneu/i],
  ['fence', /fence|grade|cerca|mesh.?wall|catch/i],
  ['wall', /wall|muro|barrier|barreira|concrete|guard.?rail/i],
  ['motorhome', /motorhome|motor.?home|trailer|truck|bus/i],
  ['tent', /tent|tenda|canopy|gazebo/i],
  ['grandstand', /grandstand|stand|bleacher|arquibancada|tribune/i],
  ['pitwall', /pit.?wall|desk|chair|computer|monitor/i],
  ['sign', /sign|board|banner|ad_|advert|placa|billboard|marker/i],
  ['cone', /cone/i],
  ['light', /light|lamp|poste|flood/i],
  ['building', /pit|garage|box|paddock|building|tower|house/i],
];
const roleOf = (name) => (ROLES.find(([, re]) => re.test(name)) ?? ['other'])[0];

// ---------------------------------------------------------------------------
// 3. Conversão e otimização
// ---------------------------------------------------------------------------
const fbx2gltf = path.join(path.dirname(require.resolve('fbx2gltf/package.json')), 'bin', process.platform === 'win32' ? 'Windows_NT' : process.platform === 'darwin' ? 'Darwin' : 'Linux', process.platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF');
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const manifest = [];
for (const fbx of fbxFiles) {
  const base = path.basename(fbx, path.extname(fbx));
  const role = roleOf(base + ' ' + path.dirname(fbx));
  if (role === 'skip') continue;
  const raw = path.join(WORK, 'raw', base + '.glb');
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  try {
    execFileSync(fbx2gltf, ['--binary', '--input', fbx, '--output', raw.replace(/\.glb$/, '')], { stdio: 'pipe' });
  } catch (e) {
    console.warn('falha na conversão', base, String(e.stderr || e).slice(0, 200));
    continue;
  }
  const doc = await io.read(raw);
  await doc.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: role === 'tree' ? 0.6 : 0.85, error: 0.002 }),
    center({ pivot: 'below' }), // base do objeto em y = 0
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
    meshopt({ encoder: MeshoptEncoder }),
  );
  // estatísticas
  let tris = 0;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
      const pos = prim.getAttribute('POSITION');
      const mn = pos.getMinNormalized([]);
      const mx = pos.getMaxNormalized([]);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], mn[k]);
        max[k] = Math.max(max[k], mx[k]);
      }
    }
  const file = `${role}/${base}.glb`;
  fs.mkdirSync(path.join(OUT, role), { recursive: true });
  await io.write(path.join(OUT, file), doc);
  // Escala: unidades de FBX variam (m/cm). Se a altura sair da faixa plausível do papel,
  // propõe uma escala que leve o objeto a um tamanho real típico (ajustável no manifest).
  const h = max[1] - min[1];
  const PLAUSIBLE = { tree: [3, 20, 9], wall: [0.6, 5, 1.2], fence: [1.5, 6, 3.5], tyre: [0.5, 2, 1.1], motorhome: [2.5, 4.5, 3.6], tent: [2.2, 6, 3.2], grandstand: [3, 30, 10], pitwall: [0.6, 3, 1.1], sign: [0.8, 6, 2], cone: [0.4, 1.2, 0.7], light: [5, 40, 18], building: [3, 40, 9], other: [0.1, 100, 1] };
  const [lo, hi, typ] = PLAUSIBLE[role] ?? PLAUSIBLE.other;
  const scale = h > 0 && (h < lo || h > hi) ? +(typ / h).toPrecision(3) : 1;
  manifest.push({ name: base, role, file, triangles: Math.round(tris), size: [max[0] - min[0], h, max[2] - min[2]].map((v) => +v.toFixed(2)), scale });
  console.log(`${role.padEnd(10)} ${base} — ${Math.round(tris)} triângulos`);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ source: 'Cartoon Race Track Interlagos — RCC Design (Unity Asset Store, licença Standard EULA)', generated: new Date().toISOString(), assets: manifest }, null, 2));
console.log(`\nok: ${manifest.length} modelos em ${OUT}. Revise "role" e "scale" em manifest.json se necessário.`);
