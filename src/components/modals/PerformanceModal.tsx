import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { TRACK, altitude, frameAt } from '../../data/circuit/track';
import { CORNERS } from '../../data/circuit/corners';
import { SECTORS } from '../../data/circuit/sectors';
import { REF } from '../../data/circuit/markers';
import { ReliabilityBadge, SourceLinks } from '../ui/primitives';
import { useAppStore } from '../../store/useAppStore';

const SURFACE = '#0e1014';
const GRID = '#232830';
const AXIS = '#6b7582';

function Card({ title, subtitle, badge, sources, children }: { title: string; subtitle?: string; badge: Parameters<typeof ReliabilityBadge>[0]['r']; sources?: string[]; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/[0.07] bg-black/25 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13.5px] font-semibold text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11.5px] text-ink-400">{subtitle}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <ReliabilityBadge r={badge} />
          <SourceLinks ids={sources} />
        </div>
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="text-[11px] text-ink-400">{label}</div>
      <div className="mt-1 text-[26px] font-semibold leading-none text-white">{value}</div>
      <div className="mt-1.5 text-[11px] text-ink-300">{detail}</div>
    </div>
  );
}

/** Perfil de altitude ao longo da volta (linha única + faixa de setores + curvas). */
function ElevationChart() {
  const select = useAppStore((s) => s.select);
  const W = 800;
  const H = 230;
  const m = { l: 44, r: 14, t: 14, b: 44 };
  const data = useMemo(() => {
    const pts: { s: number; alt: number }[] = [];
    for (let i = 0; i < TRACK.n; i += 3) pts.push({ s: i * TRACK.ds, alt: altitude(TRACK.y[i]) });
    pts.push({ s: TRACK.length, alt: altitude(TRACK.y[0]) });
    return pts;
  }, []);
  const minA = Math.floor(Math.min(...data.map((d) => d.alt)) / 5) * 5 - 5;
  const maxA = Math.ceil(Math.max(...data.map((d) => d.alt)) / 5) * 5 + 5;
  const X = (s: number) => m.l + (s / TRACK.length) * (W - m.l - m.r);
  const Y = (a: number) => m.t + (1 - (a - minA) / (maxA - minA)) * (H - m.t - m.b);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${X(d.s).toFixed(1)},${Y(d.alt).toFixed(1)}`).join('');
  const area = `${path}L${X(TRACK.length)},${Y(minA)}L${X(0)},${Y(minA)}Z`;
  const [hx, setHx] = useState<number | null>(null);
  const hs = hx == null ? null : Math.max(0, Math.min(TRACK.length, ((hx - m.l) / (W - m.l - m.r)) * TRACK.length));
  const hAlt = hs == null ? 0 : altitude(frameAt(hs).y);
  const hCorner = hs == null ? null : CORNERS.find((c) => Math.abs(c.apexS - hs) < 45);
  const ticks: number[] = [];
  for (let a = minA; a <= maxA; a += 10) ticks.push(a);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setHx(((e.clientX - r.left) / r.width) * W); }} onMouseLeave={() => setHx(null)}>
        {ticks.map((a) => (
          <g key={a}>
            <line x1={m.l} x2={W - m.r} y1={Y(a)} y2={Y(a)} stroke={GRID} strokeWidth={1} />
            <text x={m.l - 6} y={Y(a) + 3.5} textAnchor="end" fontSize={10} fill={AXIS} className="tabular-nums">{a}</text>
          </g>
        ))}
        {[0, 1000, 2000, 3000, 4000].map((s) => (
          <text key={s} x={X(s)} y={H - m.b + 32} textAnchor="middle" fontSize={10} fill={AXIS}>{s === 0 ? '0' : `${s / 1000} km`}</text>
        ))}
        <path d={area} fill="#c4cad2" opacity={0.1} />
        <path d={path} fill="none" stroke="#e6e9ed" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* faixa de setores com vão de 2px */}
        {SECTORS.map((s) => (
          <rect key={s.id} x={X(s.s0) + 1} y={H - m.b + 6} width={Math.max(0, X(s.s1) - X(s.s0) - 2)} height={8} rx={4} fill={s.color} className="cursor-pointer" onClick={() => select({ kind: 'sector', id: s.id })}>
            <title>{s.name}</title>
          </rect>
        ))}
        {SECTORS.map((s) => (
          <text key={s.id + 't'} x={(X(s.s0) + X(s.s1)) / 2} y={H - m.b + 24} textAnchor="middle" fontSize={10} fill="#c4cad2">{`S${s.number}`}</text>
        ))}
        {/* curvas */}
        {CORNERS.map((c) => (
          <g key={c.id} className="cursor-pointer" onClick={() => select({ kind: 'corner', id: c.id })}>
            <line x1={X(c.apexS)} x2={X(c.apexS)} y1={Y(altitude(frameAt(c.apexS).y)) - 4} y2={Y(altitude(frameAt(c.apexS).y)) - 12} stroke={AXIS} strokeWidth={1} />
            <text x={X(c.apexS)} y={Y(altitude(frameAt(c.apexS).y)) - 15} textAnchor="middle" fontSize={9.5} fill="#98a1ad">{c.number}</text>
          </g>
        ))}
        <text x={m.l + 4} y={m.t + 4} fontSize={10} fill={AXIS}>m</text>
        {hs != null && (
          <g pointerEvents="none">
            <line x1={X(hs)} x2={X(hs)} y1={m.t} y2={H - m.b} stroke="#98a1ad" strokeWidth={1} />
            <circle cx={X(hs)} cy={Y(hAlt)} r={4} fill="#e6e9ed" stroke={SURFACE} strokeWidth={2} />
          </g>
        )}
      </svg>
      {hs != null && (
        <div className="pointer-events-none absolute top-1 rounded-md border border-white/10 bg-ink-900/95 px-2.5 py-1.5 text-[11px] shadow-lg" style={{ left: `calc(${(X(hs) / W) * 100}% + 10px)` }}>
          <div className="font-semibold text-white">{Math.round(hAlt)} m</div>
          <div className="text-ink-400">s = {Math.round(hs)} m{hCorner ? ` · T${hCorner.number} ${hCorner.name}` : ''}</div>
        </div>
      )}
    </div>
  );
}

const SPEEDS = [
  { point: 'Speed trap (90 m antes da T1)', y2022: 338.1, d2022: 'L. Stroll', y2025: 335.6, d2025: 'C. Sainz' },
  { point: 'Linha de chegada', y2022: 338.3, d2022: 'M. Verstappen', y2025: 339.9, d2025: 'C. Sainz' },
  { point: 'I1 – fim do Setor 1 (Reta Oposta)', y2022: 329.4, d2022: 'M. Verstappen', y2025: 340.4, d2025: 'A. Albon' },
  { point: 'I2 – fim do Setor 2 (antes da Junção)', y2022: 259.3, d2022: 'S. Pérez', y2025: 263.4, d2025: 'G. Russell' },
];

function SpeedBars() {
  const [hover, setHover] = useState<string | null>(null);
  const max = 360;
  const W = 800;
  const rowH = 46;
  const lab = 230;
  const X = (v: number) => lab + (v / max) * (W - lab - 60);
  const H = SPEEDS.length * rowH + 26;
  const c22 = '#6b7582';
  const c25 = '#e6e9ed';
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-ink-300">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c25 }} /> Corrida 2025</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c22 }} /> Corrida 2022</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 100, 200, 300].map((v) => (
          <g key={v}>
            <line x1={X(v)} x2={X(v)} y1={0} y2={H - 22} stroke={GRID} />
            <text x={X(v)} y={H - 8} textAnchor="middle" fontSize={10} fill={AXIS}>{v} km/h</text>
          </g>
        ))}
        {SPEEDS.map((s, i) => {
          const y = i * rowH + 6;
          return (
            <g key={s.point}>
              <text x={lab - 10} y={y + 17} textAnchor="end" fontSize={11} fill="#c4cad2">{s.point}</text>
              {[
                { k: '25', v: s.y2025, d: s.d2025, c: c25, dy: 0 },
                { k: '22', v: s.y2022, d: s.d2022, c: c22, dy: 16 },
              ].map((b) => {
                const id = s.point + b.k;
                return (
                  <g key={id} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
                    <rect x={X(0)} y={y + b.dy - 2} width={X(max) - X(0)} height={16} fill="transparent" />
                    <path d={`M${X(0)},${y + b.dy}h${X(b.v) - X(0) - 4}a4,4 0 0 1 4,4v4a4,4 0 0 1 -4,4h-${X(b.v) - X(0) - 4}z`} fill={b.c} opacity={hover && hover !== id ? 0.55 : 1} />
                    <text x={X(b.v) + 6} y={y + b.dy + 10} fontSize={10.5} fill={hover === id ? '#fff' : '#98a1ad'} className="tabular-nums">
                      {b.v.toFixed(1).replace('.', ',')}{hover === id ? ` · ${b.d}` : ''}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <table className="mt-3 w-full text-left text-[11.5px]">
        <thead className="text-ink-500">
          <tr><th className="py-1 font-normal">Ponto de medição</th><th className="font-normal">2025 (km/h)</th><th className="font-normal">2022 (km/h)</th></tr>
        </thead>
        <tbody className="text-ink-200">
          {SPEEDS.map((s) => (
            <tr key={s.point} className="border-t border-white/[0.05]">
              <td className="py-1.5">{s.point}</td>
              <td className="tabular-nums">{s.y2025.toFixed(1).replace('.', ',')} — {s.d2025}</td>
              <td className="tabular-nums">{s.y2022.toFixed(1).replace('.', ',')} — {s.d2022}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-snug text-ink-400">
        Valores máximos de cada ponto na corrida (tabela FIA "Race Maximum Speeds"). Velocidade de speed trap não é a velocidade máxima absoluta da volta: em 2025, o maior valor medido entre os pontos foi no I1 (Reta Oposta).
      </p>
    </div>
  );
}

/** Barra segmentada alta: partes de um todo (3 setores). */
function SegmentedBar({ label, values, fmt }: { label: string; values: number[]; fmt: (v: number) => string }) {
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[11.5px]">
        <span className="text-ink-300">{label}</span>
        <span className="tabular-nums text-ink-400">total {fmt(total)}</span>
      </div>
      <div className="flex h-7 gap-[2px]" role="img" aria-label={`${label}: ${values.map((v, i) => `Setor ${i + 1} ${fmt(v)}`).join(', ')}`}>
        {values.map((v, i) => (
          <div key={i} className="flex h-full items-center rounded px-2 text-[11px] font-semibold text-white" style={{ width: `${(v / total) * 100}%`, background: SECTORS[i].color }} title={`Setor ${i + 1}: ${fmt(v)} (${((v / total) * 100).toFixed(0)}%)`}>
            {((v / total) * 100).toFixed(0)}%
          </div>
        ))}
      </div>
    </div>
  );
}

function RadiusBars() {
  const select = useAppStore((s) => s.select);
  const [hover, setHover] = useState<string | null>(null);
  const sorted = [...CORNERS].sort((a, b) => a.minRadius - b.minRadius);
  const W = 800;
  const H = 210;
  const m = { l: 40, r: 10, t: 10, b: 40 };
  const max = 250;
  const bw = Math.min(24, (W - m.l - m.r) / sorted.length - 10);
  const step = (W - m.l - m.r) / sorted.length;
  const Y = (v: number) => m.t + (1 - Math.min(v, max) / max) * (H - m.t - m.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 50, 100, 150, 200, 250].map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke={GRID} />
          <text x={m.l - 6} y={Y(v) + 3.5} textAnchor="end" fontSize={10} fill={AXIS}>{v}</text>
        </g>
      ))}
      {sorted.map((c, i) => {
        const x = m.l + i * step + (step - bw) / 2;
        const v = Math.min(c.minRadius, max);
        const y = Y(v);
        const h = Y(0) - y;
        return (
          <g key={c.id} className="cursor-pointer" onClick={() => select({ kind: 'corner', id: c.id })} onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
            <rect x={m.l + i * step} y={m.t} width={step} height={H - m.t - m.b} fill="transparent" />
            <path d={`M${x},${Y(0)}v-${Math.max(0, h - 4)}a4,4 0 0 1 4,-4h${bw - 8}a4,4 0 0 1 4,4v${Math.max(0, h - 4)}z`} fill="#2b8fd6" opacity={hover && hover !== c.id ? 0.5 : 1} />
            <text x={x + bw / 2} y={H - m.b + 15} textAnchor="middle" fontSize={10.5} fill="#c4cad2">T{c.number}</text>
            {(hover === c.id || i === 0) && (
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize={10.5} fill="#e6e9ed" className="tabular-nums">{Math.round(c.minRadius)} m</text>
            )}
          </g>
        );
      })}
      <text x={m.l} y={H - 6} fontSize={10} fill={AXIS}>Ordenado do raio mais fechado ao mais aberto (valores acima de 250 m truncados)</text>
    </svg>
  );
}

export function PerformanceModal() {
  const lengths = SECTORS.map((s) => s.lengthM);
  return (
    <Modal title="Análise de desempenho" subtitle="Dados oficiais da FIA quando disponíveis; métricas geométricas do modelo identificadas como estimativa" width={940}>
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Maior velocidade medida · corrida 2025" value="340,4 km/h" detail="A. Albon · ponto I1 (Reta Oposta)" />
          <StatTile label="Speed trap · corrida 2025" value="335,6 km/h" detail="C. Sainz · 90 m antes da T1" />
          <StatTile label="Volta mais rápida · corrida 2025" value="1:12.400" detail="A. Albon · volta 59 · 214,3 km/h" />
          <StatTile label="Recorde de volta em corrida" value="1:10.540" detail="V. Bottas · 2018" />
        </div>
        <Card title="Perfil de altitude da volta" subtitle="Altitude da linha central (SRTM 30 m suavizado) · clique nos números para selecionar a curva" badge="estimativa" sources={['srtm', 'osm']}>
          <ElevationChart />
        </Card>
        <Card title="Velocidades máximas por ponto de medição" subtitle="Corridas do GP de São Paulo 2022 e 2025" badge="oficial" sources={['fia-2025-max-speeds', 'fia-2022-max-speeds', 'fia-2022-event-notes']}>
          <SpeedBars />
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card title="Distribuição dos setores" subtitle="Extensão no modelo × melhores tempos da corrida 2025" badge="oficial" sources={['fia-2022-event-notes', 'fia-2025-sectors']}>
            <div className="space-y-4">
              <SegmentedBar label="Extensão (m, medida no modelo)" values={lengths} fmt={(v) => `${Math.round(v)} m`} />
              <SegmentedBar label="Melhores setores · corrida 2025 (s)" values={[18.386, 36.746, 16.536]} fmt={(v) => `${v.toFixed(3).replace('.', ',')} s`} />
              <div className="flex gap-4 text-[11px] text-ink-300">
                {SECTORS.map((s) => (
                  <span key={s.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-ink-400">
                O Setor 2 ocupa {((lengths[1] / TRACK.length) * 100).toFixed(0)}% da extensão e ~51% do tempo: é o trecho mais lento. Melhores setores 2025: Albon (S1), Verstappen (S2), Russell (S3). A soma (1:11.668) é uma volta teórica, não realizada. Limites: S1 em s = {Math.round(REF.sector1End)} m e S2 em s = {Math.round(REF.sector2End)} m.
              </p>
            </div>
          </Card>
          <Card title="O que não está disponível" badge="indisponivel">
            <ul className="space-y-2 text-[12px] leading-snug text-ink-300">
              <li><b className="text-ink-100">Velocidade e marcha em cada curva, pontos de frenagem e zonas de aceleração:</b> exigem telemetria de carro. O F1 Live Timing passou a exigir autenticação (HTTP 401), e nenhuma outra fonte confiável foi encontrada. O script <code className="text-ink-200">scripts/telemetry/extract_telemetry.py</code> está pronto para quem tiver conta F1.</li>
              <li><b className="text-ink-100">Velocidades por curva de outras categorias:</b> não utilizadas para não misturar dados de carros diferentes.</li>
              <li><b className="text-ink-100">Ranking de curvas por velocidade:</b> substituído abaixo por um indicador geométrico (raio), claramente rotulado.</li>
            </ul>
          </Card>
        </div>
        <Card title="Raio mínimo da linha central por curva" subtitle="Indicador geométrico de quão fechada é cada curva (não é velocidade medida) · clique para selecionar" badge="estimativa" sources={['osm']}>
          <RadiusBars />
        </Card>
      </div>
    </Modal>
  );
}
