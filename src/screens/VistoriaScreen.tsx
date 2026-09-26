import { useEffect, useState } from 'react';
import type { Estaca, FieldLog, NormalizedSolution, Projeto } from '../types/domain';
import type { NormalizationConfig } from '../services/normalizer';
import { getProject, getStations, getFieldLogsMap, applyFieldChange, fieldLogKey } from '../db/projectService';
import { useGps } from '../hooks/useGps';
import { useWakeLock } from '../hooks/useWakeLock';
import { FaixaCard } from '../components/FaixaCard';
import { DrenoBar } from '../components/DrenoBar';
import { AlteracaoBottomSheet } from '../components/AlteracaoBottomSheet';

interface Props {
  projectId: string;
  config: NormalizationConfig;
  onVoltar: () => void;
  onExportar: (projectId: string) => void;
}

const PRECISAO_LABEL = { boa: 'boa', moderada: 'moderada', baixa: 'baixa' } as const;

export function VistoriaScreen({ projectId, config, onVoltar, onExportar }: Props) {
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [estacas, setEstacas] = useState<Estaca[] | null>(null);
  const [fieldLogs, setFieldLogs] = useState<Map<string, FieldLog>>(new Map());
  const [faixaEmEdicao, setFaixaEmEdicao] = useState<number | null>(null);

  useEffect(() => {
    getProject(projectId).then((p) => setProjeto(p ?? null));
    getStations(projectId).then((e) => setEstacas(e.sort((a, b) => a.id - b.id)));
    getFieldLogsMap(projectId).then(setFieldLogs);
  }, [projectId]);

  const gps = useGps(
    (estacas ?? []).map((e, i) => ({ index: i, latitude: e.latitude, longitude: e.longitude })),
    0,
  );
  useWakeLock(true);

  if (!projeto || !estacas) return <p className="p-4 text-neutral-600">Carregando…</p>;

  const estacaAtual = estacas[gps.estacaAtualIndex];
  const estacaSugerida = gps.sugestao?.estacaSugeridaIndex != null ? estacas[gps.sugestao.estacaSugeridaIndex] : null;

  async function recarregarLogs() {
    setFieldLogs(await getFieldLogsMap(projectId));
  }

  async function confirmarAlteracao(faixaNumero: number, novasSolucoes: NormalizedSolution[], nota?: string) {
    const faixaOriginal = estacaAtual.faixas.find((f) => f.numero === faixaNumero)!;
    await applyFieldChange({
      projectId,
      estacaId: estacaAtual.id,
      faixa: faixaNumero,
      original: faixaOriginal.solucoesOriginais,
      novasSolucoes,
      nota,
    });
    await recarregarLogs();
  }

  const faixaEditando = faixaEmEdicao != null ? estacaAtual.faixas.find((f) => f.numero === faixaEmEdicao) : undefined;
  const logEditando = faixaEmEdicao != null ? fieldLogs.get(fieldLogKey(estacaAtual.id, faixaEmEdicao)) : undefined;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <button onClick={onVoltar} className="h-12 rounded-lg border border-neutral-400 px-4 text-neutral-700">
          ← Projetos
        </button>
        <h1 className="text-lg font-bold text-neutral-900">{projeto.nomeProjeto}</h1>
        <button onClick={() => onExportar(projectId)} className="h-12 rounded-lg border border-neutral-400 px-4 text-neutral-700">
          Exportar
        </button>
      </div>

      <div className="rounded-lg border border-neutral-300 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-4xl font-black tabular-nums text-neutral-900">{estacaAtual.numeroEstaca}</span>
          <span className="text-sm font-bold text-neutral-600">
            GPS: {gps.gpsDisponivel ? PRECISAO_LABEL[gps.sugestao?.precisao ?? 'baixa'] : 'sem sinal'}
            {gps.sugestao?.distanciaMetros != null && ` · estaca mais próxima a ${gps.sugestao.distanciaMetros.toFixed(0)}m`}
          </span>
        </div>

        {estacaSugerida && estacaSugerida.id !== estacaAtual.id && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 p-2">
            <span className="text-sm text-blue-900">Sugestão: {estacaSugerida.numeroEstaca}</span>
            <button onClick={gps.confirmarSugestao} className="h-10 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white">
              Ir para {estacaSugerida.numeroEstaca}
            </button>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button onClick={() => gps.avancarManual(-1)} className="h-12 min-w-12 flex-1 rounded-lg border border-neutral-400 text-lg font-bold">
            −20m
          </button>
          <button onClick={() => gps.avancarManual(1)} className="h-12 min-w-12 flex-1 rounded-lg border border-neutral-400 text-lg font-bold">
            +20m
          </button>
          {!gps.modoAutomatico && (
            <button onClick={gps.usarGpsNovamente} className="h-12 rounded-lg bg-neutral-900 px-4 text-sm font-bold text-white">
              Usar GPS novamente
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {estacaAtual.faixas.map((faixa) => {
          const key = fieldLogKey(estacaAtual.id, faixa.numero);
          const log = fieldLogs.get(key);
          return (
            <FaixaCard
              key={faixa.numero}
              numero={faixa.numero}
              solucoesAtuais={log?.solucoesCampo ?? faixa.solucoesOriginais}
              nota={log?.notaCampo}
              onAlterar={() => setFaixaEmEdicao(faixa.numero)}
            />
          );
        })}
        <DrenoBar status={estacaAtual.dreno} />
      </div>

      {faixaEditando && (
        <AlteracaoBottomSheet
          original={faixaEditando.solucoesOriginais}
          atual={logEditando?.solucoesCampo ?? faixaEditando.solucoesOriginais}
          notaAtual={logEditando?.notaCampo}
          config={config}
          onFechar={() => setFaixaEmEdicao(null)}
          onConfirmar={(novas, nota) => confirmarAlteracao(faixaEditando.numero, novas, nota)}
        />
      )}
    </div>
  );
}
