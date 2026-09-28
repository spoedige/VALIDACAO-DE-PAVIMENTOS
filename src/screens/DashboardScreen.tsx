import { useMemo } from 'react';
import type { Estaca, FieldLog, Projeto } from '../types/domain';
import type { SessaoGpsInfo } from '../hooks/useGps';
import type { GpsStatus } from '../services/gpsEngine';
import { fieldLogKey } from '../db/projectService';
import { corSolucao } from '../config/paleta';
import { MapaReal } from '../components/MapaReal';

interface Props {
  projeto: Projeto;
  estacas: Estaca[];
  fieldLogs: Map<string, FieldLog>;
  status: GpsStatus | null;
  sessaoInfo: SessaoGpsInfo;
  estacaAtivaIndex: number;
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

interface ItemDistribuicao {
  categoriaPai: string;
  subtipoCodigo: string;
  extensaoKm: number;
}

/** Extensão real por subtipo, calculada a partir dos hodômetros das estacas —
 * nunca assumindo 20m fixos. Soluções simultâneas continuam contando cada
 * uma na sua extensão própria (sem "solução predominante"). */
function calcularDistribuicao(estacas: Estaca[], fieldLogs: Map<string, FieldLog>): ItemDistribuicao[] {
  const totais = new Map<string, ItemDistribuicao>();
  const faixasNumeros = estacas[0]?.faixas.map((f) => f.numero) ?? [];
  for (const numero of faixasNumeros) {
    for (let i = 0; i < estacas.length - 1; i++) {
      const atual = estacas[i];
      const deltaKm = estacas[i + 1].hodometroContinuo - atual.hodometroContinuo;
      if (deltaKm <= 0) continue;
      const faixa = atual.faixas.find((f) => f.numero === numero);
      if (!faixa) continue;
      const log = fieldLogs.get(fieldLogKey(atual.id, numero));
      const solucoes = log?.solucoesCampo ?? faixa.solucoesOriginais;
      for (const s of solucoes) {
        const chave = `${s.categoriaPai}:${s.subtipoCodigo}`;
        const item = totais.get(chave) ?? { categoriaPai: s.categoriaPai, subtipoCodigo: s.subtipoCodigo, extensaoKm: 0 };
        item.extensaoKm += deltaKm;
        totais.set(chave, item);
      }
    }
  }
  return [...totais.values()].sort((a, b) => b.extensaoKm - a.extensaoKm);
}

export function DashboardScreen({ projeto, estacas, fieldLogs, status, sessaoInfo, estacaAtivaIndex }: Props) {
  const estacaAtiva = estacas[estacaAtivaIndex];
  const extensaoTotalKm = (projeto.metadata.kmFinal ?? 0) - (projeto.metadata.kmInicial ?? 0) || (estacas[estacas.length - 1]?.hodometroContinuo ?? 0) - (estacas[0]?.hodometroContinuo ?? 0);

  // "trecho percorrido" NÃO é hodômetro atual - hodômetro inicial: é a extensão
  // entre o menor e o maior hodômetro que o motor confirmou como estaca ativa
  // de verdade durante a sessão (seção 5) — se houve perda de sinal, aquele
  // intervalo não entra na soma.
  const trechoPercorridoKm =
    sessaoInfo.hodometroMinConfirmado != null && sessaoInfo.hodometroMaxConfirmado != null
      ? sessaoInfo.hodometroMaxConfirmado - sessaoInfo.hodometroMinConfirmado
      : 0;
  const alteracoesRegistradas = new Set([...fieldLogs.values()].map((l) => `${l.estacaId}:${l.faixa}`)).size;

  const distribuicao = useMemo(() => calcularDistribuicao(estacas, fieldLogs), [estacas, fieldLogs]);
  const maiorExtensao = Math.max(...distribuicao.map((d) => d.extensaoKm), 0.001);

  return (
    <div className="flex flex-col gap-3">
      <Bloco titulo="Trecho">
        <Linha label="Km inicial" valor={projeto.metadata.kmInicial?.toFixed(3).replace('.', ',') ?? '—'} />
        <Linha label="Km final" valor={projeto.metadata.kmFinal?.toFixed(3).replace('.', ',') ?? '—'} />
        <Linha label="Extensão total" valor={`${extensaoTotalKm.toFixed(3).replace('.', ',')} km`} />
      </Bloco>

      <Bloco titulo="Vistoria">
        <Linha label="Estaca atual" valor={estacaAtiva?.numeroEstaca ?? '—'} />
        <Linha label="Trecho percorrido (confirmado)" valor={`${trechoPercorridoKm.toFixed(3).replace('.', ',')} km`} />
        <Linha label="Alterações registradas" valor={`${alteracoesRegistradas} estaca(s)/faixa(s)`} />
      </Bloco>

      <Bloco titulo="Sessão">
        <Linha label="Início" valor={formatarHora(sessaoInfo.horaInicioSessao)} />
      </Bloco>

      <Bloco titulo="GPS">
        <Linha label="Latitude" valor={sessaoInfo.latitude?.toFixed(6) ?? '—'} />
        <Linha label="Longitude" valor={sessaoInfo.longitude?.toFixed(6) ?? '—'} />
        <Linha label="Accuracy" valor={status ? `±${status.accuracy.toFixed(0)}m` : '—'} />
        <Linha label="Confiança da associação" valor={status?.confianca === 'alta' ? 'alta' : status ? 'baixa (diagnóstico)' : '—'} />
      </Bloco>

      <Bloco titulo="Distribuição das soluções">
        <div className="flex flex-col gap-1.5">
          {distribuicao.length === 0 && <p className="text-xs text-neutral-500">Nenhuma solução no trecho.</p>}
          {distribuicao.map((d) => {
            const { label, cor } = corSolucao(d.categoriaPai, d.subtipoCodigo);
            const pct = extensaoTotalKm > 0 ? (d.extensaoKm / extensaoTotalKm) * 100 : 0;
            return (
              <div key={`${d.categoriaPai}:${d.subtipoCodigo}`} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="truncate text-neutral-700">{d.subtipoCodigo === 'UNKNOWN' ? 'Não reconhecido' : label}</span>
                  <span className="shrink-0 font-bold tabular-nums text-neutral-900">
                    {d.extensaoKm.toFixed(2).replace('.', ',')}km · {pct.toFixed(1).replace('.', ',')}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-neutral-100">
                  <div className="h-1.5 rounded-full" style={{ width: `${(d.extensaoKm / maiorExtensao) * 100}%`, backgroundColor: cor }} />
                </div>
              </div>
            );
          })}
        </div>
      </Bloco>

      <Bloco titulo="Mapa do trecho">
        <MapaReal estacas={estacas} estacaAtualIndex={estacaAtivaIndex} />
      </Bloco>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-300 bg-white p-3">
      <h2 className="mb-2 border-b border-ocre/30 pb-1 text-xs font-bold uppercase tracking-wide text-ocre-dark">{titulo}</h2>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-neutral-600">{label}</span>
      <span className="font-bold tabular-nums text-neutral-900">{valor}</span>
    </div>
  );
}
