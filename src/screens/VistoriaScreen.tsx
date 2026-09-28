import { useEffect, useMemo, useState } from 'react';
import type { Estaca, FieldLog, NormalizedSolution, Projeto } from '../types/domain';
import type { NormalizationConfig } from '../services/normalizer';
import { getProject, getStations, getFieldLogsMap, applyFieldChange, fieldLogKey, requestPersistentStorage } from '../db/projectService';
import { useGps, MENSAGEM_PERMISSAO_NEGADA } from '../hooks/useGps';
import { useWakeLock } from '../hooks/useWakeLock';
import { FaixaCard } from '../components/FaixaCard';
import { AlteracaoBottomSheet } from '../components/AlteracaoBottomSheet';
import { VerticalRuler } from '../components/VerticalRuler';
import { ParametrosTable } from '../components/ParametrosTable';
import { DashboardScreen } from './DashboardScreen';
import { SolutionBadge } from '../components/SolutionBadge';
import { CORES_DRENO } from '../config/paleta';

interface Props {
  projectId: string;
  config: NormalizationConfig;
  onVoltar: () => void;
  onExportar: (projectId: string) => void;
}

const PRECISAO_LABEL = { boa: 'boa', moderada: 'moderada', baixa: 'baixa' } as const;
const DRENO_LABEL = { raso: 'Raso', profundo: 'Profundo', ausente: 'Ausente' } as const;

// A régua vertical (seção 6) ocupa uma coluna lateral de largura fixa, então
// sobra menos espaço pros cards do que no layout anterior sem régua. Em
// celular, 1 card por linha garante largura suficiente pro título + botão
// "Alterar" lado a lado (nunca sobrepostos) mesmo com 6 faixas; a partir do
// breakpoint sm (mais espaço horizontal, ex: tablet) várias colunas cabem —
// classes por extenso porque o Tailwind v4 só gera CSS pra strings literais.
const GRID_FAIXAS_CLASSNAME: Record<number, string> = {
  1: 'grid gap-2 grid-cols-1',
  2: 'grid gap-2 grid-cols-1 sm:grid-cols-2',
  3: 'grid gap-2 grid-cols-1 sm:grid-cols-3',
  4: 'grid gap-2 grid-cols-1 sm:grid-cols-2',
  5: 'grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  6: 'grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};
function gridFaixasClassName(quantidade: number): string {
  return GRID_FAIXAS_CLASSNAME[quantidade] ?? 'grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
}

export function VistoriaScreen({ projectId, config, onVoltar, onExportar }: Props) {
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [estacas, setEstacas] = useState<Estaca[] | null>(null);
  const [fieldLogs, setFieldLogs] = useState<Map<string, FieldLog>>(new Map());
  const [faixaEmEdicao, setFaixaEmEdicao] = useState<number | null>(null);
  const [modo, setModo] = useState<'vistoria' | 'dashboard' | 'parametros'>('vistoria');
  const [estacaConsultadaIndex, setEstacaConsultadaIndex] = useState<number | null>(null);

  useEffect(() => {
    getProject(projectId).then((p) => setProjeto(p ?? null));
    getStations(projectId).then((e) => setEstacas(e.sort((a, b) => a.id - b.id)));
    getFieldLogsMap(projectId).then(setFieldLogs);
  }, [projectId]);

  // seção 2 da atualização de UX: solicitar persistência ao entrar na tela de
  // Vistoria (não bloqueia nem exige nada do operador se não for concedida).
  useEffect(() => {
    requestPersistentStorage();
  }, []);

  // memoizado: um array novo a cada render reiniciaria o watchPosition do
  // GPS sem necessidade (o efeito em useGps depende dessa referência).
  const estacasGps = useMemo(
    () => (estacas ?? []).map((e, i) => ({ index: i, latitude: e.latitude, longitude: e.longitude, hodometroContinuo: e.hodometroContinuo })),
    [estacas],
  );
  const gps = useGps(estacasGps, 0);
  useWakeLock(true);

  if (!projeto || !estacas) return <p className="p-4 text-neutral-600">Carregando…</p>;

  const estacaAtiva = estacas[gps.estacaAtivaIndex];

  async function recarregarLogs() {
    setFieldLogs(await getFieldLogsMap(projectId));
  }

  async function confirmarAlteracao(faixaNumero: number, novasSolucoes: NormalizedSolution[], nota?: string) {
    const faixaOriginal = estacaAtiva.faixas.find((f) => f.numero === faixaNumero)!;
    await applyFieldChange({
      projectId,
      estacaId: estacaAtiva.id,
      faixa: faixaNumero,
      original: faixaOriginal.solucoesOriginais,
      novasSolucoes,
      nota,
    });
    await recarregarLogs();
  }

  const faixaEditando = faixaEmEdicao != null ? estacaAtiva.faixas.find((f) => f.numero === faixaEmEdicao) : undefined;
  const logEditando = faixaEmEdicao != null ? fieldLogs.get(fieldLogKey(estacaAtiva.id, faixaEmEdicao)) : undefined;
  const emConsulta = estacaConsultadaIndex != null && estacaConsultadaIndex !== gps.estacaAtivaIndex;
  const estacaConsultada = emConsulta ? estacas[estacaConsultadaIndex!] : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 overscroll-y-contain p-3">
      <header className="flex items-center gap-2">
        <button onClick={onVoltar} className="h-10 shrink-0 rounded-lg border border-neutral-400 px-3 text-sm font-medium text-neutral-700">
          ← Projetos
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-neutral-900">{projeto.nomeProjeto}</h1>
        <button onClick={() => onExportar(projectId)} className="h-10 shrink-0 rounded-lg bg-ocre px-3 text-sm font-bold text-white">
          Exportar
        </button>
      </header>

      <nav className="flex gap-1">
        {(['vistoria', 'dashboard', 'parametros'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className={`h-9 flex-1 rounded-lg text-xs font-bold sm:text-sm ${modo === m ? 'bg-neutral-900 text-white' : 'border border-neutral-400 text-neutral-700'}`}
          >
            {m === 'vistoria' ? 'Vistoria' : m === 'dashboard' ? 'Dashboard' : 'Parâmetros'}
          </button>
        ))}
      </nav>

      <div className="rounded-lg border border-neutral-300 bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="text-[32px] font-extrabold tabular-nums leading-none text-neutral-900 sm:text-[40px]">{estacaAtiva.numeroEstaca}</span>
          <StatusGps permissao={gps.permissao} status={gps.status} />
        </div>
        {gps.status?.confianca === 'baixa' && gps.status.diagnostico && (
          <p className="mt-1 text-xs text-neutral-500">GPS: associação incerta · {gps.status.diagnostico}</p>
        )}
        {gps.permissao === 'negada' && <p className="mt-1 text-xs font-medium text-red-700">{MENSAGEM_PERMISSAO_NEGADA}</p>}
      </div>

      {emConsulta && estacaConsultada && (
        <div className="rounded-lg border border-blue-400 bg-blue-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-blue-900">Consultando estaca {estacaConsultada.numeroEstaca}</span>
            <button onClick={() => setEstacaConsultadaIndex(null)} className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white">
              Voltar ao GPS
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {estacaConsultada.faixas.map((f) => {
              const log = fieldLogs.get(fieldLogKey(estacaConsultada.id, f.numero));
              const solucoes = log?.solucoesCampo ?? f.solucoesOriginais;
              return (
                <div key={f.numero} className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-neutral-500">Faixa {f.numero}</span>
                  <div className="flex flex-wrap gap-1">
                    {solucoes.length === 0 ? <span className="text-xs text-neutral-400">Sem solução</span> : solucoes.map((s, i) => <SolutionBadge key={i} solucao={s} />)}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-neutral-500">Dreno</span>
              <span className="inline-flex h-7 items-center gap-1 rounded-full border px-2 text-sm font-bold text-neutral-800" style={{ borderColor: CORES_DRENO[estacaConsultada.dreno] }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CORES_DRENO[estacaConsultada.dreno] }} />
                {DRENO_LABEL[estacaConsultada.dreno]}
              </span>
            </div>
          </div>
        </div>
      )}

      {modo === 'vistoria' && (
        // Régua à esquerda, cards (onde fica o botão "Alterar") à direita:
        // a maioria dos operadores é destra e senta no banco do passageiro,
        // então a mão direita — a mais funcional pra editar durante o
        // trajeto — fica mais perto dos cards, não da régua de consulta.
        <div className="flex gap-2">
          <VerticalRuler
            estacas={estacas}
            estacaAtivaIndex={gps.estacaAtivaIndex}
            estacaConsultadaIndex={estacaConsultadaIndex}
            fieldLogs={fieldLogs}
            onConsultarHodometro={setEstacaConsultadaIndex}
          />
          <div className={`min-w-0 flex-1 ${gridFaixasClassName(estacaAtiva.faixas.length)}`}>
            {estacaAtiva.faixas.map((faixa) => {
              const key = fieldLogKey(estacaAtiva.id, faixa.numero);
              const log = fieldLogs.get(key);
              return (
                <FaixaCard
                  key={faixa.numero}
                  numero={faixa.numero}
                  solucoesAtuais={log?.solucoesCampo ?? faixa.solucoesOriginais}
                  parametros={faixa.parametros}
                  nota={log?.notaCampo}
                  onAlterar={() => setFaixaEmEdicao(faixa.numero)}
                />
              );
            })}
          </div>
        </div>
      )}

      {modo === 'dashboard' && (
        <DashboardScreen projeto={projeto} estacas={estacas} fieldLogs={fieldLogs} status={gps.status} sessaoInfo={gps.sessaoInfo} estacaAtivaIndex={gps.estacaAtivaIndex} />
      )}

      {modo === 'parametros' && <ParametrosTable estaca={estacaAtiva} />}

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

function StatusGps({ permissao, status }: { permissao: string; status: ReturnType<typeof useGps>['status'] }) {
  if (permissao === 'indisponivel') return <span className="text-sm text-neutral-500">GPS indisponível</span>;
  if (permissao === 'negada') return <span className="text-sm font-medium text-red-700">GPS sem permissão</span>;
  if (permissao === 'timeout' && !status) return <span className="text-sm text-neutral-500">GPS: aguardando sinal…</span>;
  if (!status) return <span className="text-sm text-neutral-500">GPS: buscando…</span>;
  return (
    <span className="text-sm font-medium text-neutral-600">
      GPS: {PRECISAO_LABEL[status.precisaoGps]} · ±{status.accuracy.toFixed(0)}m
    </span>
  );
}
