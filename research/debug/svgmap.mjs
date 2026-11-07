import fs from 'node:fs';
const osm = JSON.parse(fs.readFileSync('research/raw/osm_area.json','utf8'));
const lat0=-23.7016, lon0=-46.6965, R=6371008.8, k=Math.PI/180;
const P=(g)=>[ (g.lon-lon0)*k*Math.cos(lat0*k)*R, (g.lat-lat0)*k*R ];
const W=1500, S=0.75; // px per m
const tx=([x,y])=>[(x+950)*S,(950-y)*S];
let out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${1900*S}" height="${1900*S}" style="background:#eee;font:9px sans-serif">`];
const path=(g,st)=>{const p=g.map(P).map(tx);out.push(`<path d="M${p.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join('L')}" style="${st}"/>`)};
for(const e of osm.elements){ if(e.type!=='way'||!e.geometry) continue; const t=e.tags||{};
  const c=P({lat:(e.bounds.minlat+e.bounds.maxlat)/2,lon:(e.bounds.minlon+e.bounds.maxlon)/2}); if(Math.abs(c[0])>950||Math.abs(c[1])>950) continue;
  if(t.natural==='water') path(e.geometry,'fill:#7ad;stroke:none');
  else if(t.landuse==='grass'||t.leisure==='park'||t.natural==='wood'||t.landuse==='forest'||t.natural==='scrub'||t.natural==='wetland') path(e.geometry,'fill:#9c8;opacity:.6;stroke:none');
  else if(t.amenity==='parking') path(e.geometry,'fill:#bbb;stroke:#888');
  else if(t.building==='grandstand'||t.leisure==='bleachers') {path(e.geometry,'fill:#e44;stroke:#900'); const p=tx(c); out.push(`<text x="${p[0]}" y="${p[1]}" fill="#900">GS ${e.id} ${t.name||''}</text>`);}
  else if(t.building) { path(e.geometry, 'fill:#776;stroke:none;opacity:.8'); if(t.name){const p=tx(c);out.push(`<text x="${p[0]}" y="${p[1]}" fill="#00f">${t.name}</text>`);} }
  else if(t.highway==='raceway') path(e.geometry, t.sport==='motor'?'fill:none;stroke:#222;stroke-width:3':'fill:none;stroke:#a60;stroke-width:2');
  else if(t['area:highway']) path(e.geometry,'fill:none;stroke:#f0f;stroke-width:.6');
  else if(t.barrier==='fence') path(e.geometry,'fill:none;stroke:#0a0;stroke-width:.7');
  else if(t.barrier==='wall') path(e.geometry,'fill:none;stroke:#f80;stroke-width:1.2');
  else if(t.highway && t.highway!=='footway') path(e.geometry,'fill:none;stroke:#fff;stroke-width:1.5');
  else if(t.highway==='footway') path(e.geometry,'fill:none;stroke:#c9c;stroke-width:.5');
  else if(t.power==='line') path(e.geometry,'fill:none;stroke:#f00;stroke-dasharray:4 2;stroke-width:.6');
}
for(const e of osm.elements){ if(e.type!=='relation') continue; const t=e.tags||{}; if(t['area:highway']) for(const m of e.members) if(m.geometry) path(m.geometry,'fill:none;stroke:#f0f;stroke-width:.8'); }
for(const e of osm.elements){ if(e.type!=='node'||!e.tags) continue; const t=e.tags; const p=tx(P(e)); if(Math.abs(p[0]-950*S)>950*S) continue;
  if(t.natural==='tree') out.push(`<circle cx="${p[0]}" cy="${p[1]}" r="1.5" fill="#060"/>`);
  if(t.power==='tower'||t.man_made==='tower') out.push(`<rect x="${p[0]-2}" y="${p[1]-2}" width="4" height="4" fill="#f00"/>`);
  if(t.name==='Start Line'||t.name==='Finish Line') out.push(`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#f0f"/><text x="${p[0]+4}" y="${p[1]}">${t.name}</text>`);
}
// raceway names
const rw = JSON.parse(fs.readFileSync('research/raw/osm_raceway.json','utf8'));
for(const e of rw.elements){ if(e.type!=='way'||!e.tags.name) continue; const g=e.geometry[Math.floor(e.geometry.length/2)]; const p=tx(P(g)); out.push(`<text x="${p[0]}" y="${p[1]}" fill="#c00" font-weight="bold">${e.tags['raceway:corner_number']||''} ${e.tags.name}</text>`); }
// grid
for(let v=-900;v<=900;v+=100){const a=tx([v,-950]),b=tx([v,950]);out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#ccc" stroke-width=".3"/>`);const c=tx([-950,v]),d=tx([950,v]);out.push(`<line x1="${c[0]}" y1="${c[1]}" x2="${d[0]}" y2="${d[1]}" stroke="#ccc" stroke-width=".3"/><text x="2" y="${c[1]}">${v}</text><text x="${a[0]}" y="10">${v}</text>`);}
out.push('</svg>');
fs.writeFileSync('research/debug/map.svg', out.join('\n'));
console.log('ok');
