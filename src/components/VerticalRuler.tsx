import { useMemo, useRef, useState } from 'react';
import type { DrenoStatus, Estaca, FieldLog, NormalizedSolution } from '../types/domain';
import { fieldLogKey } from '../db/projectService';
import { solutionSetsEqual } from '../db/solutionSet';
import { PALETA_SOLUCOES, CORES_DRENO, corSolucao } from '../config/paleta';

// Régua vertical (seção 6 da atualização de UX) — substitui o mini-unifilar
// horizontal. Cima = à frente, linha da posição atual = onde estou, baixo =
// atrás. Ordenada por hodômetro contínuo (nunca km bruto da planilha), pra
// funcionar igual em trecho crescente ou decrescente. Blocos só de cor, sem
// texto embutido — a identificação por extenso mora na legenda fixa e no
// painel de detalhe por toque.

const RULER_WIDTH_PX = 88; // faixa de 64-96px pedida; não cresce com o nº de faixas
const MIN_SEGMENT_PX = 5; // altura mínima garantida por segmento, nunca invisível
const JANELA_KM_TOTAL = 2; // ~1-2km antes/depois, ponto de partida (seção 6)
const JANELA_FRACAO_ATRAS = 1 / 3; // marca da posição atual a 1/3 de baixo pra cima
const ALTURA_JANELA_PADRAO_PX = 420; // usado só antes da primeira medição real do pai

interface SegmentoFaixa {
  hodometroInicio: number;
  hodometroFim: number;
  solucoes: NormalizedSolution[];
}
interface SegmentoDreno {
  hodometroInicio: number;
  hodometroFim: number;
  status: DrenoStatus;
}

function agruparSegmentosFaixa(estacas: Estaca[], faixaNumero: number, fieldLogs: Map<string, FieldLog>): SegmentoFaixa[] {
  const segmentos: SegmentoFaixa[] = [];
  for (const estaca of estacas) {
    const faixa = estaca.faixas.find((f) => f.numero === faixaNumero);
    if (!faixa) continue;
    const log = fieldLogs.get(fieldLogKey(estaca.id, faixaNumero));
    const solucoes = log?.solucoesCampo ?? faixa.solucoesOriginais;
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && solutionSetsEqual(ultimo.solucoes, solucoes)) {
      ultimo.hodometroFim = estaca.hodometroContinuo;
    } else {
      segmentos.push({ hodometroInicio: estaca.hodometroContinuo, hodometroFim: estaca.hodometroContinuo, solucoes });
    }
  }
  return segmentos;
}

function agruparSegmentosDreno(estacas: Estaca[]): SegmentoDreno[] {
  const segmentos: SegmentoDreno[] = [];
  for (const estaca of estacas) {
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.status === estaca.dreno) {
      ultimo.hodometroFim = estaca.hodometroContinuo;
    } else {
      segmentos.push({ hodometroInicio: estaca.hodometroContinuo, hodometroFim: estaca.hodometroContinuo, status: estaca.dreno });
    }
  }
  return segmentos;
}

function escolherPassoKm(totalKm: number): number {
  const passos = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];
  for (const p of passos) if (totalKm / p <= 8) return p;
  return 100;
}

interface Props {
  estacas: Estaca[];
  estacaAtivaIndex: number;
  estacaConsultadaIndex: number | null;
  fieldLogs: Map<string, FieldLog>;
  onConsultarHodometro: (estacaIndex: number) => void;
  // altura real (px) da coluna irmã (GPS + consulta + cards), medida pelo
  // pai via ResizeObserver — pedido explícito: subir a régua até o topo da
  // tela, alinhada com o resto do layout, aproveitando o espaço vertical de
  // verdade (a mesma janela de 2km fica maior/mais legível, não só decorativa).
  // Antes da primeira medição (ou se o pai não passar), cai no valor padrão.
  alturaDisponivelPx?: number | null;
}

export function VerticalRuler({ estacas, estacaAtivaIndex, estacaConsultadaIndex, fieldLogs, onConsultarHodometro, alturaDisponivelPx }: Props) {
  const [modoCompleto, setModoCompleto] = useState(false);
  const [legendaAberta, setLegendaAberta] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  // item 2 da rodada 7: arrastar a régua com o dedo pra navegar pra
  // frente/trás sem depender do GPS. `seguindoAtiva=false` destrava a janela
  // da posição da estaca ativa; só volta a acompanhar o GPS de novo quando o
  // operador toca em "centralizar" — nunca sozinho, nunca redefine qual
  // estaca é a ativa (isso continua 100% do motor de GPS).
  const [seguindoAtiva, setSeguindoAtiva] = useState(true);
  const [inicioManual, setInicioManual] = useState<number | null>(null);
  const arrastoRef = useRef<{ startY: number; startInicio: number; moved: boolean } | null>(null);

  const estacaAtiva = estacas[estacaAtivaIndex];
  const faixasNumeros = useMemo(() => estacaAtiva?.faixas.map((f) => f.numero) ?? [], [estacaAtiva]);
  const estacaDestacada = estacaConsultadaIndex != null ? estacas[estacaConsultadaIndex] : estacaAtiva;

  const hodometroMin = estacas[0]?.hodometroContinuo ?? 0;
  const hodometroMax = estacas[estacas.length - 1]?.hodometroContinuo ?? 0;

  const janela = useMemo(() => {
    if (modoCompleto) return { inicio: hodometroMin, fim: hodometroMax };
    if (!seguindoAtiva && inicioManual !== null) {
      const inicio = Math.max(hodometroMin, Math.min(inicioManual, hodometroMax - JANELA_KM_TOTAL));
      return { inicio, fim: Math.min(hodometroMax, inicio + JANELA_KM_TOTAL) };
    }
    const atras = JANELA_KM_TOTAL * JANELA_FRACAO_ATRAS;
    const frente = JANELA_KM_TOTAL - atras;
    return {
      inicio: Math.max(hodometroMin, (estacaAtiva?.hodometroContinuo ?? 0) - atras),
      fim: Math.min(hodometroMax, (estacaAtiva?.hodometroContinuo ?? 0) + frente),
    };
  }, [modoCompleto, estacaAtiva, hodometroMin, hodometroMax, seguindoAtiva, inicioManual]);

  const totalKm = Math.max(janela.fim - janela.inicio, 0.001);
  // nunca ENCOLHE abaixo do padrão antigo (poucas faixas deixariam a régua
  // pequena/apertada demais) — só CRESCE quando a coluna ao lado é maior,
  // que é o caso comum agora que ela inclui o card de GPS e o de consulta.
  const alturaJanelaPadrao = Math.max(alturaDisponivelPx ?? 0, ALTURA_JANELA_PADRAO_PX);
  const alturaPx = modoCompleto ? Math.max(alturaJanelaPadrao, totalKm * 240) : alturaJanelaPadrao;
  const pxPerKm = alturaPx / totalKm;

  // hodômetro -> posição vertical em px, dentro do container desta régua.
  // cima = à frente = maior hodômetro (sempre, independente de crescente/decrescente).
  function topPx(hodometro: number): number {
    return alturaPx - (hodometro - janela.inicio) * pxPerKm;
  }

  const estacasNaJanela = useMemo(
    () => estacas.filter((e) => e.hodometroContinuo >= janela.inicio - 0.05 && e.hodometroContinuo <= janela.fim + 0.05),
    [estacas, janela],
  );

  const larguraFaixa = RULER_WIDTH_PX / (faixasNumeros.length + 0.5);
  const larguraDreno = larguraFaixa / 2;

  const segmentosPorFaixa = useMemo(
    () => faixasNumeros.map((n) => ({ numero: n, segmentos: agruparSegmentosFaixa(estacasNaJanela, n, fieldLogs) })),
    [faixasNumeros, estacasNaJanela, fieldLogs],
  );
  const segmentosDreno = useMemo(() => agruparSegmentosDreno(estacasNaJanela), [estacasNaJanela]);

  const passoKm = escolherPassoKm(totalKm);
  const marcasKm = useMemo(() => {
    const marcas: number[] = [];
    const primeira = Math.ceil(janela.inicio / passoKm) * passoKm;
    for (let km = primeira; km <= janela.fim; km += passoKm) marcas.push(km);
    return marcas;
  }, [janela, passoKm]);

  function aoTocarNaRegua(clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = clientY - rect.top;
    const hodometroTocado = janela.inicio + (alturaPx - y) / pxPerKm;
    let maisProxima = estacas[0];
    let menorDiff = Infinity;
    for (const est of estacas) {
      const diff = Math.abs(est.hodometroContinuo - hodometroTocado);
      if (diff < menorDiff) {
        menorDiff = diff;
        maisProxima = est;
      }
    }
    onConsultarHodometro(estacas.indexOf(maisProxima));
  }

  const LIMIAR_ARRASTO_PX = 8;

  function aoPressionarRegua(e: React.PointerEvent<HTMLDivElement>) {
    // sempre registra o toque, mesmo em "ver trecho todo" — só o PAN por
    // arrasto não se aplica nesse modo (ver abaixo); o toque simples pra
    // consultar uma posição continua funcionando em qualquer modo.
    arrastoRef.current = { startY: e.clientY, startInicio: janela.inicio, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function aoMoverNaRegua(e: React.PointerEvent<HTMLDivElement>) {
    const arrasto = arrastoRef.current;
    if (!arrasto) return;
    const deltaY = e.clientY - arrasto.startY;
    if (Math.abs(deltaY) > LIMIAR_ARRASTO_PX) arrasto.moved = true;
    if (!arrasto.moved || modoCompleto) return; // "ver trecho todo" já mostra tudo, nada pra arrastar
    // ponto sob o dedo continua sob o dedo (rolagem natural) — nunca redefine
    // a estaca ativa, só desloca a janela visível.
    setSeguindoAtiva(false);
    setInicioManual(arrasto.startInicio + deltaY / pxPerKm);
  }

  function aoSoltarRegua(e: React.PointerEvent<HTMLDivElement>) {
    const arrasto = arrastoRef.current;
    arrastoRef.current = null;
    if (!arrasto) return;
    if (!arrasto.moved) aoTocarNaRegua(e.clientY); // foi um toque, não um arrasto — consulta normal
  }

  function centralizarNaEstacaAtiva() {
    setSeguindoAtiva(true);
    setInicioManual(null);
  }

  return (
    <div className="flex shrink-0 flex-col gap-2" style={{ width: RULER_WIDTH_PX + 40 }}>
      <div className="flex items-center justify-between text-[10px] font-bold text-neutral-500">
        <button onClick={() => setModoCompleto((v) => !v)} className="underline">
          {modoCompleto ? 'ver janela' : 'ver trecho todo'}
        </button>
        {/* só aparece depois que o operador arrasta a régua pra outro lugar —
            "centralizar" volta a acompanhar a estaca ativa do GPS. */}
        {!seguindoAtiva && !modoCompleto && (
          <button onClick={centralizarNaEstacaAtiva} className="text-ocre-dark underline">
            centralizar
          </button>
        )}
      </div>

      <div className="relative flex" style={{ height: alturaPx }}>
        {/* escala de km */}
        <div className="relative mr-1 w-7 shrink-0">
          {marcasKm.map((km) => (
            <div key={km} className="absolute right-0 flex items-center gap-0.5" style={{ top: topPx(km) }}>
              <span className="text-[8px] text-neutral-400">{km.toFixed(passoKm < 1 ? 2 : 0)}</span>
              <span className="h-px w-1.5 bg-neutral-300" />
            </div>
          ))}
        </div>

        <div
          ref={containerRef}
          onPointerDown={aoPressionarRegua}
          onPointerMove={aoMoverNaRegua}
          onPointerUp={aoSoltarRegua}
          role="button"
          tabIndex={0}
          aria-label="Régua de consulta por hodômetro — toque para consultar uma posição, ou arraste pra navegar"
          className={`relative touch-none overflow-hidden rounded-md border border-neutral-300 bg-neutral-50 ${modoCompleto ? 'overflow-y-auto' : ''}`}
          style={{ width: RULER_WIDTH_PX }}
        >
          {segmentosPorFaixa.map((faixa, faixaIdx) => (
            <div key={faixa.numero}>
              {faixa.segmentos.map((seg, i) => {
                const top = topPx(seg.hodometroFim);
                const altura = Math.max(topPx(seg.hodometroInicio) - top, MIN_SEGMENT_PX);
                const largura = larguraFaixa / Math.max(seg.solucoes.length, 1);
                if (seg.solucoes.length === 0) {
                  return (
                    <div
                      key={i}
                      className="absolute bg-neutral-200"
                      style={{ top, height: altura, left: faixaIdx * larguraFaixa, width: larguraFaixa }}
                    />
                  );
                }
                return seg.solucoes.map((s, si) => (
                  <div
                    key={`${i}-${si}`}
                    className="absolute"
                    style={{ top, height: altura, left: faixaIdx * larguraFaixa + si * largura, width: largura, backgroundColor: corSolucao(s.categoriaPai, s.subtipoCodigo).cor }}
                  />
                ));
              })}
            </div>
          ))}

          {/* linha separatória fina entre colunas de faixa adjacentes (item 9) —
              só divisor visual, não interfere nos blocos internos (só cor) */}
          {faixasNumeros.slice(0, -1).map((_, faixaIdx) => (
            <div key={`divisor-${faixaIdx}`} className="absolute inset-y-0 w-px bg-neutral-300" style={{ left: (faixaIdx + 1) * larguraFaixa }} />
          ))}
          {faixasNumeros.length > 0 && (
            <div className="absolute inset-y-0 w-px bg-neutral-300" style={{ left: faixasNumeros.length * larguraFaixa }} />
          )}

          {/* coluna de dreno — mais fina que uma coluna de faixa */}
          {segmentosDreno.map((seg, i) => {
            const top = topPx(seg.hodometroFim);
            const altura = Math.max(topPx(seg.hodometroInicio) - top, MIN_SEGMENT_PX);
            return (
              <div
                key={i}
                className="absolute"
                style={{ top, height: altura, left: faixasNumeros.length * larguraFaixa, width: larguraDreno, backgroundColor: CORES_DRENO[seg.status] }}
              />
            );
          })}

          {/* linha da posição ativa (GPS), atravessa todas as colunas */}
          <div className="absolute inset-x-0 h-0.5 bg-neutral-900" style={{ top: topPx(estacaAtiva?.hodometroContinuo ?? 0) }} />
          {/* posição consultada (modo consulta), se diferente da ativa */}
          {estacaConsultadaIndex != null && estacaConsultadaIndex !== estacaAtivaIndex && (
            <div className="absolute inset-x-0 h-0.5 border-t-2 border-dashed border-blue-600" style={{ top: topPx(estacas[estacaConsultadaIndex].hodometroContinuo) }} />
          )}
        </div>
      </div>

      <p className="text-center text-[9px] text-neutral-500">
        {estacaDestacada?.numeroEstaca} · km {estacaDestacada ? (estacaDestacada.hodometroContinuo).toFixed(3).replace('.', ',') : '—'}
      </p>

      <RulerLegend aberta={legendaAberta} onToggle={() => setLegendaAberta((v) => !v)} />
    </div>
  );
}

function RulerLegend({ aberta, onToggle }: { aberta: boolean; onToggle: () => void }) {
  const entradas = Object.values(PALETA_SOLUCOES);
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-1.5">
      <button onClick={onToggle} className="mb-1 text-[9px] font-bold text-neutral-500 underline">
        {aberta ? 'ocultar legenda' : 'ver legenda'}
      </button>
      {aberta && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {entradas.map((e) => (
            <div key={e.label} className="flex items-center gap-1">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: e.cor }} />
              <span className="truncate text-[8px] leading-tight text-neutral-700">{e.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
