import { Modal } from './Modal';
import { TIMELINE, LAYOUTS, HISTORY_FACTS, SENNA_S_HISTORY } from '../../data/history';
import { SOURCES, RELIABILITY_LABEL } from '../../data/sources';
import { ReliabilityBadge, SourceLinks, Segmented, Toggle, RELIABILITY_STYLE, cx } from '../ui/primitives';
import { useAppStore, type Quality } from '../../store/useAppStore';
import type { Reliability } from '../../data/types';

export function HistoryModal() {
  const select = useAppStore((s) => s.select);
  const setModal = useAppStore((s) => s.setModal);
  return (
    <Modal title="História de Interlagos" subtitle="Informações históricas — distintas dos dados do traçado atual">
      <div className="grid grid-cols-[1fr_300px] gap-6">
        <div>
          <ol className="relative border-l border-white/10 pl-5">
            {TIMELINE.map((e) => (
              <li key={e.year + e.title} className="mb-5">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-ink-900 bg-f1" />
                <div className="flex items-center gap-2">
                  <span className="font-display text-[15px] font-bold text-f1">{e.year}</span>
                  <span className="text-[13px] font-semibold text-white">{e.title}</span>
                  <ReliabilityBadge r={e.reliability} compact />
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-300">{e.text}</p>
                <SourceLinks ids={e.sources} className="mt-1" />
              </li>
            ))}
          </ol>
        </div>
        <aside className="space-y-4">
          <div className="rounded-xl border border-white/[0.07] bg-gradient-to-br from-f1/15 to-transparent p-4">
            <div className="font-display text-[12px] font-bold uppercase tracking-[0.18em] text-f1">O S do Senna</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{SENNA_S_HISTORY}</p>
            <button
              type="button"
              onClick={() => {
                setModal(null);
                select({ kind: 'corner', id: 't1' });
              }}
              className="mt-3 rounded-md bg-white/10 px-3 py-1.5 text-[12px] text-white hover:bg-white/15"
            >
              Ver na maquete →
            </button>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <div className="font-display text-[12px] font-bold uppercase tracking-[0.18em] text-ink-300">José Carlos Pace</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-300">
              Piloto paulistano, venceu o GP do Brasil de 1975 em Interlagos — sua única vitória na F1. Morreu em um acidente aéreo em 1977; em 1985 o autódromo passou a levar seu nome.
            </p>
            <SourceLinks ids={['pref-historia', 'wikipedia']} className="mt-2" />
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <div className="mb-2 font-display text-[12px] font-bold uppercase tracking-[0.18em] text-ink-300">Recordes e números</div>
            {HISTORY_FACTS.map((f) => (
              <div key={f.label} className="border-b border-white/[0.05] py-1.5 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-ink-400">{f.label}</span>
                  <ReliabilityBadge r={f.reliability} compact />
                </div>
                <div className="text-[12.5px] text-ink-100">{f.value}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
      <h3 className="mb-2 mt-2 font-display text-[13px] font-bold uppercase tracking-[0.18em] text-ink-300">Evolução do traçado</h3>
      <table className="w-full text-left text-[12px]">
        <thead className="text-ink-500">
          <tr>
            <th className="py-1.5 font-normal">Período</th>
            <th className="font-normal">Extensão</th>
            <th className="font-normal">Curvas</th>
            <th className="font-normal">Recorde de volta (F1)</th>
            <th className="font-normal">Dado</th>
          </tr>
        </thead>
        <tbody className="text-ink-200">
          {LAYOUTS.map((l) => (
            <tr key={l.period} className="border-t border-white/[0.05]">
              <td className="py-1.5 font-semibold text-white">{l.period}</td>
              <td className="tabular-nums">{l.length}</td>
              <td>{l.turns}</td>
              <td>{l.record}</td>
              <td>
                <ReliabilityBadge r={l.reliability} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-ink-500">Observação: as páginas da Prefeitura trazem valores divergentes para o traçado original (7.823 m, 7.960 m e "8 mil metros"); a tabela segue a Wikipedia, citando a divergência.</p>
    </Modal>
  );
}

export function SourcesModal() {
  const groups: { title: string; kind: string }[] = [
    { title: 'Fontes oficiais', kind: 'oficial' },
    { title: 'Fontes secundárias', kind: 'secundaria' },
    { title: 'Dados geográficos', kind: 'geodado' },
    { title: 'Referência visual', kind: 'referencia-visual' },
  ];
  return (
    <Modal title="Fontes e metodologia" subtitle="Toda informação do app é classificada quanto à confiabilidade" width={900}>
      <div className="mb-5 grid grid-cols-4 gap-2">
        {(Object.keys(RELIABILITY_LABEL) as Reliability[]).map((r) => (
          <div key={r} className="rounded-lg border border-white/[0.07] bg-black/20 p-3">
            <ReliabilityBadge r={r} />
            <div className={cx('mt-1.5 text-[12.5px] font-semibold', RELIABILITY_STYLE[r].text)}>{RELIABILITY_LABEL[r]}</div>
            <div className="mt-1 text-[11px] leading-snug text-ink-400">
              {r === 'oficial' && 'FIA, Formula 1, Prefeitura de São Paulo.'}
              {r === 'secundaria' && 'Wikipedia, equipes de F1, imprensa, OSM.'}
              {r === 'estimativa' && 'Medido no modelo ou inferido de imagens — método indicado.'}
              {r === 'indisponivel' && 'Sem fonte confiável: nenhum número é inventado.'}
            </div>
          </div>
        ))}
      </div>
      <div className="mb-6 rounded-xl border border-white/[0.07] bg-black/20 p-4 text-[12.5px] leading-relaxed text-ink-300">
        <div className="mb-1 font-semibold text-white">Como a maquete foi construída</div>
        <ul className="list-disc space-y-1 pl-5">
          <li>Traçado: 25 vias <code>highway=raceway</code> do OpenStreetMap encadeadas em laço fechado (4.308,2 m), suavizadas e reamostradas a cada 2 m. Comprimento oficial FIA: 4.309 m.</li>
          <li>Largura: distância da linha central às bordas do polígono <code>area:highway=raceway</code>, limitada ao intervalo oficial de 12–15 m.</li>
          <li>Relevo: SRTM 30 m (validado com altitudes de heliportos do OSM), suavizado ao longo da pista; o terreno é acomodado à pista em uma faixa de transição de ~45 m.</li>
          <li>Setores, speed trap e DRS: distâncias das FIA Event Notes 2022 aplicadas a partir do início de cada curva numerada no OSM.</li>
          <li>Zebras: posições derivadas da curvatura (interna no ápice, externa na saída); cores verde/amarela conforme pintura de 2024. Salsichas (zebras altas isoladas) não foram confirmadas em imagens ou fontes e por isso não foram modeladas.</li>
          <li>Áreas de escape, barreiras e arquibancadas temporárias: aproximadas a partir de imagens aéreas (Esri) — marcadas como estimativa.</li>
          <li>Prédios, vegetação, cercas, muros, torres e vias: OpenStreetMap; boxes com 23 garagens de 216 m² (Prefeitura).</li>
        </ul>
        <p className="mt-2">Documentação completa em <code>docs/FONTES.md</code> e <code>docs/METODOLOGIA.md</code>.</p>
      </div>
      {groups.map((g) => {
        const items = Object.values(SOURCES).filter((s) => s.kind === g.kind);
        if (!items.length) return null;
        return (
          <div key={g.kind} className="mb-5">
            <h3 className="mb-2 font-display text-[13px] font-bold uppercase tracking-[0.18em] text-ink-300">{g.title}</h3>
            <ul className="space-y-2">
              {items.map((s) => (
                <li key={s.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-white hover:underline">
                    {s.title}
                  </a>
                  <div className="text-[11px] text-ink-400">
                    {s.publisher}
                    {s.date ? ` · ${s.date}` : ''}
                  </div>
                  {s.note && <div className="mt-1 text-[11.5px] leading-snug text-ink-300">{s.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Modal>
  );
}

export function SettingsModal() {
  const quality = useAppStore((s) => s.quality);
  const setQuality = useAppStore((s) => s.setQuality);
  const shadows = useAppStore((s) => s.shadows);
  const setShadows = useAppStore((s) => s.setShadows);
  const ao = useAppStore((s) => s.ao);
  const setAO = useAppStore((s) => s.setAO);
  const labelsOn = useAppStore((s) => s.labelsOn);
  const setLabelsOn = useAppStore((s) => s.setLabelsOn);
  const showSectors = useAppStore((s) => s.showSectors);
  const setShowSectors = useAppStore((s) => s.setShowSectors);
  return (
    <Modal title="Configurações" width={520}>
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-[12px] font-semibold text-white">Qualidade gráfica</div>
          <Segmented<Quality>
            value={quality}
            onChange={setQuality}
            options={[
              { value: 'low', label: 'Baixa' },
              { value: 'medium', label: 'Média' },
              { value: 'high', label: 'Alta' },
            ]}
          />
          <p className="mt-2 text-[11.5px] leading-snug text-ink-400">
            Baixa: sem sombras e sem oclusão ambiente, menos vegetação e entorno até 800 m. Média: sombras 2048 px, 60% da vegetação, assentos simplificados. Alta: sombras 4096 px, terreno com malha de 4 m, todos os assentos 3D.
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-black/20 p-1">
          <Toggle checked={shadows} onChange={setShadows} label="Sombras dinâmicas" />
          <Toggle checked={ao} onChange={setAO} label="Oclusão ambiente (N8AO)" />
          <Toggle checked={labelsOn} onChange={setLabelsOn} label="Identificações sobre a maquete" />
          <Toggle checked={showSectors} onChange={setShowSectors} label="Colorir setores na pista" />
        </div>
      </div>
    </Modal>
  );
}

export function HelpModal() {
  const rows: [string, string][] = [
    ['Botão esquerdo + arrastar', 'Girar a câmera (360°)'],
    ['Botão direito + arrastar', 'Mover lateralmente (pan)'],
    ['Roda do mouse', 'Aproximar / afastar (em direção ao cursor)'],
    ['Clique', 'Selecionar curva, reta, boxes, arquibancada, prédio...'],
    ['Clique no vazio', 'Limpar seleção'],
    ['W A S D / setas', 'Mover a câmera (exploração)'],
    ['Q / E', 'Descer / subir'],
    ['Shift', 'Acelerar o movimento'],
    ['Esc', 'Fechar janelas'],
  ];
  return (
    <Modal title="Ajuda e controles" width={560}>
      <table className="w-full text-[12.5px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-white/[0.05]">
              <td className="py-2 pr-4">
                <span className="kbd">{k}</span>
              </td>
              <td className="text-ink-200">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-400">
        Use <b className="text-ink-200">GAME MODE</b> para o mapa tático estilizado e <b className="text-ink-200">SIMULATION MODE</b> para o visual realista de simulador. A troca preserva câmera e seleção. O painel direito mostra a confiabilidade de cada dado (oficial, secundária, estimativa ou não disponível).
      </p>
    </Modal>
  );
}
