import type { Estaca, FieldLog } from '../types/domain';
import { fieldLogKey } from '../db/projectService';

interface Props {
  estacas: Estaca[];
  estacaAtualIndex: number;
  fieldLogs: Map<string, FieldLog>;
  janela?: number;
}

function codigoEstacaFaixa(estaca: Estaca, faixaNumero: number, fieldLogs: Map<string, FieldLog>): string {
  const faixa = estaca.faixas.find((f) => f.numero === faixaNumero);
  if (!faixa) return '—';
  const log = fieldLogs.get(fieldLogKey(estaca.id, faixaNumero));
  const solucoes = log?.solucoesCampo ?? faixa.solucoesOriginais;
  if (solucoes.length === 0) return '—';
  // códigos empilhados/concatenados, sem inventar "solução predominante" (seção 7)
  return solucoes.map((s) => (s.normalizationStatus === 'unresolved' ? 'UNKNOWN' : s.subtipoCodigo)).join('/');
}

interface Segmento {
  codigo: string;
  quantidade: number;
  contemAtual: boolean;
}

function agruparSegmentos(estacas: Estaca[], faixaNumero: number, estacaAtualIndex: number, fieldLogs: Map<string, FieldLog>): Segmento[] {
  const segmentos: Segmento[] = [];
  estacas.forEach((estaca, i) => {
    const codigo = codigoEstacaFaixa(estaca, faixaNumero, fieldLogs);
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.codigo === codigo) {
      ultimo.quantidade++;
      if (i === estacaAtualIndex) ultimo.contemAtual = true;
    } else {
      segmentos.push({ codigo, quantidade: 1, contemAtual: i === estacaAtualIndex });
    }
  });
  return segmentos;
}

/** Régua horizontal por trechos consecutivos — seção 7. Não é um mapa, é uma
 * visão por hodômetro; janela pequena ao redor da estaca atual. */
export function MiniUnifilar({ estacas, estacaAtualIndex, fieldLogs, janela = 15 }: Props) {
  const inicio = Math.max(0, estacaAtualIndex - janela);
  const fim = Math.min(estacas.length, estacaAtualIndex + janela + 1);
  const janelaEstacas = estacas.slice(inicio, fim);
  const indiceAtualRelativo = estacaAtualIndex - inicio;
  const faixasNumeros = estacas[estacaAtualIndex]?.faixas.map((f) => f.numero) ?? [];

  return (
    <div className="flex flex-col gap-1 overflow-x-auto rounded-lg border border-neutral-300 bg-white p-2">
      {faixasNumeros.map((numero) => (
        <div key={numero} className="flex items-center gap-1">
          <span className="w-14 shrink-0 text-xs font-bold text-neutral-500">Faixa {numero}</span>
          <div className="flex h-8 flex-1">
            {agruparSegmentos(janelaEstacas, numero, indiceAtualRelativo, fieldLogs).map((seg, i) => (
              <div
                key={i}
                className={`flex items-center justify-center overflow-hidden truncate whitespace-nowrap border-r border-neutral-200 px-0.5 text-[9px] font-bold text-neutral-700 ${seg.contemAtual ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-neutral-50'}`}
                style={{ flexGrow: seg.quantidade, minWidth: 20 }}
                title={`${seg.codigo} (${seg.quantidade} estaca${seg.quantidade > 1 ? 's' : ''})`}
              >
                {seg.codigo}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
