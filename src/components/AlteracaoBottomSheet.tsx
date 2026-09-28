import { useEffect, useState } from 'react';
import type { Estaca, FieldLog, NormalizedSolution } from '../types/domain';
import { catalogoSubtipos, type NormalizationConfig } from '../services/normalizer';
import { fieldLogKey } from '../db/projectService';
import { corSolucao } from '../config/paleta';

interface Props {
  estaca: Estaca;
  fieldLogs: Map<string, FieldLog>;
  faixaInicial: number;
  config: NormalizationConfig;
  onFechar: () => void;
  onConfirmarFaixa: (faixaNumero: number, novasSolucoes: NormalizedSolution[], nota?: string) => Promise<void>;
}

function chaveSubtipo(categoriaPai: string, subtipoCodigo: string) {
  return `${categoriaPai}:${subtipoCodigo}`;
}

function formatarOriginal(solucoes: NormalizedSolution[]): string {
  if (solucoes.length === 0) return 'Sem solução';
  return solucoes
    .map((s) => {
      if (s.normalizationStatus === 'unresolved') return `Não reconhecido (${s.valorBruto})`;
      const { label } = corSolucao(s.categoriaPai, s.subtipoCodigo);
      return s.valorComplementar !== undefined ? `${label} (${s.valorComplementar.toLocaleString('pt-BR')} cm)` : label;
    })
    .join(' + ');
}

// Estado de edição de uma faixa, preservado ao trocar de aba (item 3).
interface EstadoFaixa {
  selecao: Record<string, NormalizedSolution | null>; // chave -> solução selecionada (preserva espessura de origem) ou null
  naoEditaveis: NormalizedSolution[]; // unresolved/UNKNOWN da faixa, mantidos verbatim
  nota: string;
}

function estadoInicialFaixa(estaca: Estaca, faixaNumero: number, fieldLogs: Map<string, FieldLog>, catalogo: ReturnType<typeof catalogoSubtipos>): EstadoFaixa {
  const faixa = estaca.faixas.find((f) => f.numero === faixaNumero)!;
  const log = fieldLogs.get(fieldLogKey(estaca.id, faixaNumero));
  const atual = log?.solucoesCampo ?? faixa.solucoesOriginais;
  const catalogoChaves = new Set(catalogo.map((c) => chaveSubtipo(c.categoriaPai, c.subtipoCodigo)));

  const selecao: Record<string, NormalizedSolution | null> = {};
  for (const c of catalogo) {
    const key = chaveSubtipo(c.categoriaPai, c.subtipoCodigo);
    selecao[key] = atual.find((s) => chaveSubtipo(s.categoriaPai, s.subtipoCodigo) === key) ?? null;
  }
  const naoEditaveis = atual.filter((s) => !catalogoChaves.has(chaveSubtipo(s.categoriaPai, s.subtipoCodigo)));
  return { selecao, naoEditaveis, nota: log?.notaCampo ?? '' };
}

/**
 * Tela de alteração de solução — itens 1, 2 e 3 da 3ª rodada de UX:
 * - Sem campo de espessura editável: espessura é resultado de cálculo de
 *   dimensionamento estrutural, não uma estimativa de campo. Só aparece como
 *   informação, junto da solução original, nunca editável.
 * - Solução original sempre visível, somente leitura, no topo.
 * - Seleção múltipla por checkbox (não rádio) — o modelo já suporta mais de
 *   uma solução simultânea por faixa.
 * - Abas de faixa no topo: dá pra mexer em mais de uma faixa da mesma estaca
 *   sem fechar a tela. Cada faixa mantém seu próprio estado ao trocar de aba.
 * - "Confirmar" salva a faixa atual sem fechar a tela; só "Concluir" fecha.
 */
export function AlteracaoBottomSheet({ estaca, fieldLogs, faixaInicial, config, onFechar, onConfirmarFaixa }: Props) {
  const catalogo = catalogoSubtipos(config);
  const faixasNumeros = estaca.faixas.map((f) => f.numero);
  const [faixaSelecionada, setFaixaSelecionada] = useState(faixaInicial);
  const [estadoPorFaixa, setEstadoPorFaixa] = useState<Record<number, EstadoFaixa>>(() =>
    Object.fromEntries(faixasNumeros.map((n) => [n, estadoInicialFaixa(estaca, n, fieldLogs, catalogo)])),
  );
  const [salvando, setSalvando] = useState(false);
  const [avisoSalvo, setAvisoSalvo] = useState<number | null>(null);

  useEffect(() => {
    if (avisoSalvo === null) return;
    const t = setTimeout(() => setAvisoSalvo(null), 3000);
    return () => clearTimeout(t);
  }, [avisoSalvo]);

  const faixaOriginal = estaca.faixas.find((f) => f.numero === faixaSelecionada)!;
  const estado = estadoPorFaixa[faixaSelecionada];

  function atualizarEstadoFaixa(mutador: (e: EstadoFaixa) => EstadoFaixa) {
    setEstadoPorFaixa((prev) => ({ ...prev, [faixaSelecionada]: mutador(prev[faixaSelecionada]) }));
  }

  function toggle(categoriaPai: string, subtipoCodigo: string) {
    const key = chaveSubtipo(categoriaPai, subtipoCodigo);
    atualizarEstadoFaixa((e) => {
      const jaSelecionado = e.selecao[key] !== null;
      const novaSolucao: NormalizedSolution | null = jaSelecionado
        ? null
        : { categoriaPai: categoriaPai as NormalizedSolution['categoriaPai'], subtipoCodigo, valorBruto: subtipoCodigo, normalizationStatus: 'recognized' };
      return { ...e, selecao: { ...e.selecao, [key]: novaSolucao } };
    });
  }

  function setNota(nota: string) {
    atualizarEstadoFaixa((e) => ({ ...e, nota }));
  }

  // "Limpar Faixa" (item 2) volta pra solução original do projeto — reset
  // completo da faixa em edição, não é a mesma coisa que reverter um evento
  // específico do histórico (isso é a aba "Alterações").
  function limparFaixa() {
    atualizarEstadoFaixa(() => estadoInicialFaixaAPartirDe(faixaOriginal.solucoesOriginais, catalogo));
  }

  async function confirmar() {
    setSalvando(true);
    const novas = [...estado.naoEditaveis, ...Object.values(estado.selecao).filter((s): s is NormalizedSolution => s !== null)];
    await onConfirmarFaixa(faixaSelecionada, novas, estado.nota.trim() === '' ? undefined : estado.nota.trim());
    setSalvando(false);
    setAvisoSalvo(faixaSelecionada);
  }

  const categorias = [...new Set(catalogo.map((c) => c.categoriaPai))];

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onFechar}>
      <div className="flex max-h-[88vh] w-full flex-col rounded-t-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        {faixasNumeros.length > 1 && (
          <div className="flex shrink-0 gap-1 border-b border-neutral-200 p-2">
            {faixasNumeros.map((n) => (
              <button
                key={n}
                onClick={() => setFaixaSelecionada(n)}
                className={`h-9 flex-1 rounded-lg text-sm font-bold ${n === faixaSelecionada ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700'}`}
              >
                Faixa {n}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Solução original do projeto</p>
            <p className="text-base font-semibold text-neutral-900">{formatarOriginal(faixaOriginal.solucoesOriginais)}</p>
          </div>

          {estado.naoEditaveis.length > 0 && (
            <p className="mb-3 rounded bg-neutral-100 p-2 text-xs text-neutral-600">
              {estado.naoEditaveis.length} valor(es) não mapeado(s) (UNKNOWN) desta faixa serão mantidos como estão. Use "Limpar Faixa" pra removê-los.
            </p>
          )}

          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-500">Intervenções de campo</p>
          <div className="flex flex-col gap-3">
            {categorias.map((cat) => (
              <div key={cat}>
                <div className="flex flex-col gap-1.5">
                  {catalogo.filter((c) => c.categoriaPai === cat).map((c) => {
                    const key = chaveSubtipo(c.categoriaPai, c.subtipoCodigo);
                    const marcado = estado.selecao[key] !== null;
                    const { label, cor } = corSolucao(c.categoriaPai, c.subtipoCodigo);
                    return (
                      <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 active:bg-neutral-50">
                        <input type="checkbox" checked={marcado} onChange={() => toggle(c.categoriaPai, c.subtipoCodigo)} className="h-5 w-5 shrink-0 accent-neutral-900" />
                        <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
                        <span className="text-base font-semibold text-neutral-900">{label}</span>
                        <span className="ml-auto text-[11px] text-neutral-400">{c.subtipoCodigo}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Observação de campo (opcional)</span>
            <textarea value={estado.nota} onChange={(e) => setNota(e.target.value)} rows={2} className="rounded-lg border border-neutral-300 p-2 text-sm" />
          </label>
        </div>

        <div className="shrink-0 border-t border-neutral-200 p-3">
          {avisoSalvo === faixaSelecionada && <p className="mb-2 text-center text-xs font-bold text-emerald-700">Faixa {faixaSelecionada} salva</p>}
          <div className="flex gap-2">
            <button onClick={limparFaixa} className="h-11 flex-1 rounded-lg border-2 border-red-500 text-sm font-bold text-red-600">
              Limpar Faixa
            </button>
            <button onClick={confirmar} disabled={salvando} className="h-11 flex-1 rounded-lg border border-neutral-400 text-sm font-bold text-neutral-800 disabled:opacity-50">
              {salvando ? 'Salvando…' : 'Confirmar'}
            </button>
            <button onClick={onFechar} className="h-11 flex-1 rounded-lg bg-neutral-900 text-sm font-bold text-white">
              Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function estadoInicialFaixaAPartirDe(solucoesOriginais: NormalizedSolution[], catalogo: ReturnType<typeof catalogoSubtipos>): EstadoFaixa {
  const catalogoChaves = new Set(catalogo.map((c) => chaveSubtipo(c.categoriaPai, c.subtipoCodigo)));
  const selecao: Record<string, NormalizedSolution | null> = {};
  for (const c of catalogo) {
    const key = chaveSubtipo(c.categoriaPai, c.subtipoCodigo);
    selecao[key] = solucoesOriginais.find((s) => chaveSubtipo(s.categoriaPai, s.subtipoCodigo) === key) ?? null;
  }
  const naoEditaveis = solucoesOriginais.filter((s) => !catalogoChaves.has(chaveSubtipo(s.categoriaPai, s.subtipoCodigo)));
  return { selecao, naoEditaveis, nota: '' };
}
