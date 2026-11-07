import fs from 'node:fs';
const t = JSON.parse(fs.readFileSync('src/data/generated/track.json','utf8'));
const f = JSON.parse(fs.readFileSync('public/data/features.json','utf8'));
const R=6371008.8,K=Math.PI/180,lat0=t.meta.origin.lat,lon0=t.meta.origin.lon,c0=Math.cos(lat0*K);
const ll=(x,z)=>[lon0+(x/(R*c0))/K, lat0+(-z/R)/K];
const feats=[];
const n=t.n; const L=[],Rr=[],Cc=[];
for(let i=0;i<n;i++){const a=(i-1+n)%n,b=(i+1)%n;let tx=t.x[b]-t.x[a],tz=t.z[b]-t.z[a];const l=Math.hypot(tx,tz);tx/=l;tz/=l;const lx=tz,lz=-tx;
L.push(ll(t.x[i]+lx*t.wl[i],t.z[i]+lz*t.wl[i]));Rr.push(ll(t.x[i]-lx*t.wr[i],t.z[i]-lz*t.wr[i]));Cc.push(ll(t.x[i],t.z[i]));
if(i%50===0) feats.push({type:'Feature',properties:{label:'s'+Math.round(i*t.ds)+' w'+(t.wl[i]+t.wr[i]).toFixed(1)},geometry:{type:'Point',coordinates:ll(t.x[i],t.z[i])}});}
feats.push({type:'Feature',properties:{kind:'edge'},geometry:{type:'LineString',coordinates:[...L,L[0]]}});
feats.push({type:'Feature',properties:{kind:'edge'},geometry:{type:'LineString',coordinates:[...Rr,Rr[0]]}});
feats.push({type:'Feature',properties:{kind:'center'},geometry:{type:'LineString',coordinates:[...Cc,Cc[0]]}});
feats.push({type:'Feature',properties:{kind:'pit'},geometry:{type:'LineString',coordinates:t.pit.x.map((x,i)=>ll(x,t.pit.z[i]))}});
for(const g of f.grandstands) feats.push({type:'Feature',properties:{kind:'gs',label:g.id+' '+(g.name||'')},geometry:{type:'Polygon',coordinates:[[...g.poly.map(p=>ll(p[0],p[1])),ll(g.poly[0][0],g.poly[0][1])]]}});
for(const b of f.buildings){const c=b.poly[0]; if(Math.abs(c[0])>800||Math.abs(c[1])>800) continue; feats.push({type:'Feature',properties:{kind:'bld',label:b.id+' '+(b.n||'')+' h'+b.h},geometry:{type:'Polygon',coordinates:[[...b.poly.map(p=>ll(p[0],p[1])),ll(c[0],c[1])]]}});}
for(const fe of f.lines.fence) feats.push({type:'Feature',properties:{kind:'fence'},geometry:{type:'LineString',coordinates:fe.map(p=>ll(p[0],p[1]))}});
for(const fe of f.lines.wall) feats.push({type:'Feature',properties:{kind:'wall'},geometry:{type:'LineString',coordinates:fe.map(p=>ll(p[0],p[1]))}});
fs.writeFileSync('public/debug/overlay.geojson', JSON.stringify({type:'FeatureCollection',features:feats}));
console.log('ok', feats.length);
