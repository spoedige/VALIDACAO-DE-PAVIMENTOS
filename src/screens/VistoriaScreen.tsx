import { useEffect, useMemo, useState } from 'react';
import type { Estaca, FieldChangeHistoryEntry, FieldLog, NormalizedSolution, Projeto } from '../types/domain';
import type { NormalizationConfig } from '../services/normalizer';
import {
  getProject,
  getStations,
  getFieldLogsMap,
  applyFieldChange,
  fieldLogKey,
  requestPersistentStorage,
  getFieldChangeHistoryByProject,
  reverterEvento,
} from '../db/projectService';
import { useGps, MENSAGEM_PERMISSAO_NEGADA } from '../hooks/useGps';
import { useWakeLock } from '../hooks/useWakeLock';
import { useMunicipioAtual } from '../hooks/useMunicipioAtual';
import { FaixaCard } from '../components/FaixaCard';
import { AlteracaoBottomSheet } from '../components/AlteracaoBottomSheet';
import { AlteracoesTab } from '../components/AlteracoesTab';
import { ErrosCadastraisPanel } from '../components/ErrosCadastraisPanel';
import { coletarErrosCadastrais } from '../services/errosCadastrais';
import { VerticalRuler } from '../components/VerticalRuler';
import { ParametrosTable } from '../components/ParametrosTable';
import { DashboardScreen } from './DashboardScreen';
import { SolutionBadge } from '../components/SolutionBadge';
import { CORES_DRENO } from '../config/paleta';
import type { LimiaresToleranciaConfig } from '../services/tolerancia';

interface Props {
  projectId: string;
  config: NormalizationConfig;
  limiaresTolerancia: LimiaresToleranciaConfig | null;
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

// Painel de consulta (item 6): colunas de largura FIXA e igual (faixas + 1
// pro dreno) — nome longo de solução trunca/quebra dentro da própria coluna,
// nunca empurra as vizinhas nem desloca a posição do dreno. `grid-cols-N`
// já usa `minmax(0, 1fr)` pra cada trilha, então nenhuma coluna cresce além
// da fração que lhe cabe, seja qual for o conteúdo.
const GRID_CONSULTA_CLASSNAME: Record<number, string> = {
  2: 'grid grid-cols-2 gap-2',
  3: 'grid grid-cols-3 gap-2',
  4: 'grid grid-cols-4 gap-2',
  5: 'grid grid-cols-5 gap-1.5',
  6: 'grid grid-cols-6 gap-1.5',
  7: 'grid grid-cols-7 gap-1',
};
function gridConsultaClassName(numFaixas: number): string {
  return GRID_CONSULTA_CLASSNAME[numFaixas + 1] ?? 'grid grid-cols-7 gap-1';
}

export function VistoriaScreen({ projectId, config, limiaresTolerancia, onVoltar, onExportar }: Props) {
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [estacas, setEstacas] = useState<Estaca[] | null>(null);
  const [fieldLogs, setFieldLogs] = useState<Map<string, FieldLog>>(new Map());
  // guarda a estaca por ID, "congelada" no momento em que "Alterar" foi
  // tocado — nunca deriva de `estacaAtiva`/`gps.estacaAtivaIndex` de novo.
  // Bug real reportado: como o veículo não para durante a vistoria, o GPS
  // pode avançar a estaca ativa enquanto a folha de edição está aberta; se a
  // folha ficasse lendo `estacaAtiva` ao vivo, a edição em andamento passava
  // a valer, sem aviso, pra uma estaca diferente da que o operador via na
  // tela quando tocou em "Alterar".
  const [faixaEmEdicao, setFaixaEmEdicao] = useState<{ estacaId: number; faixaNumero: number } | null>(null);
  const [modo, setModo] = useState<'vistoria' | 'dashboard' | 'parametros' | 'alteracoes'>('vistoria');
  const [estacaConsultadaIndex, setEstacaConsultadaIndex] = useState<number | null>(null);
  const [historico, setHistorico] = useState<FieldChangeHistoryEntry[]>([]);
  // régua ocupando a altura real da coluna ao lado (GPS + consulta + cards),
  // não só a altura dos cards — pedido explícito: subir a régua até o topo
  // da tela, alinhando os dois lados e aproveitando mais espaço vertical de
  // verdade (não só decorativo: a régua mostra a mesma janela de 2km numa
  // área maior, ficando mais legível).
  // ref-callback, não `useRef` comum: a div só existe depois que os dados
  // terminam de carregar (e só quando `modo === 'vistoria'`), então um
  // `useEffect` com dependência em `modo` não dispararia de novo quando o
  // elemento aparecesse pela primeira vez (o valor de `modo` não muda entre
  // o "Carregando…" e o conteúdo real). O ref-callback roda exatamente
  // quando o elemento monta/desmonta, então o observer sempre acompanha o
  // elemento certo.
  const [colunaDireitaEl, setColunaDireitaEl] = useState<HTMLDivElement | null>(null);
  const [alturaColunaDireita, setAlturaColunaDireita] = useState<number | null>(null);

  useEffect(() => {
    // ResizeObserver não existe em todo ambiente (ex: jsdom nos testes) —
    // sem ele, a régua só cai no valor padrão de altura, nunca quebra.
    if (!colunaDireitaEl || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setAlturaColunaDireita(entry.contentRect.height));
    observer.observe(colunaDireitaEl);
    return () => observer.disconnect();
  }, [colunaDireitaEl]);

  useEffect(() => {
    getProject(projectId).then((p) => setProjeto(p ?? null));
    getStations(projectId).then((e) => setEstacas(e.sort((a, b) => a.id - b.id)));
    getFieldLogsMap(projectId).then(setFieldLogs);
    getFieldChangeHistoryByProject(projectId).then(setHistorico);
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
  // soluções da planilha que o normalizador não reconheceu (UNKNOWN) —
  // sinalizadas pra correção do cadastro, nunca "adivinhadas" pelo app.
  const errosCadastrais = useMemo(() => coletarErrosCadastrais(estacas ?? []), [estacas]);
  const totalErrosCadastrais = errosCadastrais.reduce((soma, g) => soma + g.ocorrencias, 0);
  const [errosAbertos, setErrosAbertos] = useState(false);
  const gps = useGps(estacasGps, 0);
  useWakeLock(true);
  const municipioAtual = useMunicipioAtual(gps.sessaoInfo.latitude, gps.sessaoInfo.longitude);

  if (!projeto || !estacas) return <p className="p-4 text-neutral-600">Carregando…</p>;

  const estacaAtiva = estacas[gps.estacaAtivaIndex];

  async function recarregarLogs() {
    setFieldLogs(await getFieldLogsMap(projectId));
    setHistorico(await getFieldChangeHistoryByProject(projectId));
  }

  async function confirmarAlteracao(estacaId: number, faixaNumero: number, novasSolucoes: NormalizedSolution[], nota?: string) {
    const estacaDaEdicao = estacas!.find((e) => e.id === estacaId)!;
    const faixaOriginal = estacaDaEdicao.faixas.find((f) => f.numero === faixaNumero)!;
    await applyFieldChange({
      projectId,
      estacaId,
      faixa: faixaNumero,
      original: faixaOriginal.solucoesOriginais,
      novasSolucoes,
      nota,
    });
    await recarregarLogs();
  }

  async function reverter(eventoId: number) {
    await reverterEvento(eventoId);
    await recarregarLogs();
  }

  const emConsulta = estacaConsultadaIndex != null && estacaConsultadaIndex !== gps.estacaAtivaIndex;
  const estacaConsultada = emConsulta ? estacas[estacaConsultadaIndex!] : null;
  // os cards de Faixa (com os 9 parâmetros) precisam refletir a estaca
  // CONSULTADA quando houver uma — antes liam sempre `estacaAtiva`, direto,
  // ignorando por completo o clique na régua (bug relatado na rodada 5).
  const estacaExibida = estacaConsultada ?? estacaAtiva;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 overscroll-y-contain p-3">
      <header className="flex items-center gap-2">
        <button onClick={onVoltar} className="h-10 shrink-0 rounded-lg border border-neutral-400 px-3 text-sm font-medium text-neutral-700">
          ← Projetos
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-neutral-900">{projeto.nomeProjeto}</h1>
        {errosCadastrais.length > 0 && (
          <button
            onClick={() => setErrosAbertos(true)}
            aria-label={`Erros cadastrais: ${totalErrosCadastrais} solução(ões) não reconhecida(s)`}
            className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-amber-500 bg-amber-50 px-2 text-sm font-bold text-amber-800"
          >
            <span aria-hidden>⚠</span>
            {totalErrosCadastrais}
          </button>
        )}
        <button onClick={() => onExportar(projectId)} className="h-10 shrink-0 rounded-lg bg-ocre px-3 text-sm font-bold text-white">
          Exportar
        </button>
      </header>

      {/* item 5: 4ª aba "Alterações" — com 4 abas em 375px, reduz padding/fonte
          em vez de deixar alguma sumir ou entrar em scroll horizontal
          (mesma regra das 3 abas da rodada anterior, só mais apertada). */}
      <nav className="flex gap-1">
        {(['vistoria', 'dashboard', 'parametros', 'alteracoes'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className={`h-9 flex-1 rounded-lg px-1 text-[11px] font-bold sm:text-sm ${modo === m ? 'bg-neutral-900 text-white' : 'border border-neutral-400 text-neutral-700'}`}
          >
            {m === 'vistoria'
              ? 'Vistoria'
              : m === 'dashboard'
                ? 'Dashboard'
                : m === 'parametros'
                  ? 'Parâmetros'
                  : historico.length > 0
                    ? `Alterações (${historico.filter((h) => !h.revertidoEm).length})`
                    : 'Alterações'}
          </button>
        ))}
      </nav>

      {(() => {
        const painelGps = (
          <div className="rounded-lg border border-neutral-300 bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="text-[26px] font-extrabold tabular-nums leading-none text-neutral-900 sm:text-[32px]">{estacaAtiva.numeroEstaca}</span>
              <StatusGps permissao={gps.permissao} status={gps.status} />
            </div>
            {gps.status?.confianca === 'baixa' && gps.status.diagnostico && (
              <p className="mt-1 text-xs text-neutral-500">GPS: associação incerta · {gps.status.diagnostico}</p>
            )}
            {gps.permissao === 'negada' && <p className="mt-1 text-xs font-medium text-red-700">{MENSAGEM_PERMISSAO_NEGADA}</p>}
            {gps.permissao === 'timeout' && !gps.status && (
              <p className="mt-1 text-xs text-neutral-500">
                Sem sinal de GPS até agora. Confira se a localização "precisa"/"alta precisão" está ativada no aparelho e se o navegador não está bloqueando a
                localização (em navegadores como o Brave, isso costuma ficar em Configurações do site → Localização).
              </p>
            )}
            {gps.sessaoInfo.latitude !== null && gps.sessaoInfo.longitude !== null && (
              <p className="mt-1 text-[10px] text-neutral-500">
                {municipioAtual.municipio
                  ? `${municipioAtual.municipio.nome}${municipioAtual.municipio.uf ? ` - ${municipioAtual.municipio.uf}` : ''}${municipioAtual.desatualizado ? ' (último registrado, sem sinal agora)' : ''}`
                  : municipioAtual.carregando
                    ? 'Localizando município…'
                    : 'Município indisponível offline'}
                {' · '}
                {gps.sessaoInfo.latitude.toFixed(5)}, {gps.sessaoInfo.longitude.toFixed(5)}
              </p>
            )}
          </div>
        );

        const painelConsulta = emConsulta && estacaConsultada && (
          <div className="rounded-lg border border-blue-400 bg-blue-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-blue-900">Consultando estaca {estacaConsultada.numeroEstaca}</span>
              <button onClick={() => setEstacaConsultadaIndex(null)} className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white">
                Voltar ao GPS
              </button>
            </div>
            <div className={`divide-x divide-neutral-300 ${gridConsultaClassName(estacaConsultada.faixas.length)}`}>
              {estacaConsultada.faixas.map((f) => {
                const log = fieldLogs.get(fieldLogKey(estacaConsultada.id, f.numero));
                const solucoes = log?.solucoesCampo ?? f.solucoesOriginais;
                return (
                  <div key={f.numero} className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[10px] font-bold text-neutral-500">F{f.numero}</span>
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      {solucoes.length === 0 ? (
                        <span className="text-xs text-neutral-400">—</span>
                      ) : (
                        solucoes.map((s, i) => (
                          <span key={i} className="max-w-full">
                            <SolutionBadge solucao={s} compacto />
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-[10px] font-bold text-neutral-500">Dreno</span>
                <span
                  className="inline-flex h-5 max-w-full items-center gap-1 truncate rounded-full border px-1.5 text-[10px] font-bold text-neutral-800"
                  style={{ borderColor: CORES_DRENO[estacaConsultada.dreno] }}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: CORES_DRENO[estacaConsultada.dreno] }} />
                  <span className="truncate">{DRENO_LABEL[estacaConsultada.dreno]}</span>
                </span>
              </div>
            </div>
          </div>
        );

        if (modo !== 'vistoria') {
          return (
            <>
              {painelGps}
              {painelConsulta}
            </>
          );
        }

        // Régua à esquerda, ocupando a altura inteira da coluna da direita
        // (GPS + consulta + cards) — antes só ia até a altura dos cards,
        // deixando os dois lados desalinhados e desperdiçando espaço
        // vertical. Mão direita nos cards (onde fica "Alterar") porque a
        // maioria dos operadores é destra e senta no banco do passageiro.
        return (
          <div className="flex items-start gap-2">
            <VerticalRuler
              estacas={estacas}
              estacaAtivaIndex={gps.estacaAtivaIndex}
              estacaConsultadaIndex={estacaConsultadaIndex}
              fieldLogs={fieldLogs}
              onConsultarHodometro={setEstacaConsultadaIndex}
              alturaDisponivelPx={alturaColunaDireita}
            />
            <div ref={setColunaDireitaEl} className="flex min-w-0 flex-1 flex-col gap-3">
              {painelGps}
              {painelConsulta}
              <div className={gridFaixasClassName(estacaExibida.faixas.length)}>
                {estacaExibida.faixas.map((faixa) => {
                  const key = fieldLogKey(estacaExibida.id, faixa.numero);
                  const log = fieldLogs.get(key);
                  return (
                    <FaixaCard
                      key={faixa.numero}
                      numero={faixa.numero}
                      solucoesAtuais={log?.solucoesCampo ?? faixa.solucoesOriginais}
                      parametros={faixa.parametros}
                      limiaresTolerancia={limiaresTolerancia}
                      nota={log?.notaCampo}
                      onAlterar={() => setFaixaEmEdicao({ estacaId: estacaExibida.id, faixaNumero: faixa.numero })}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {modo === 'dashboard' && (
        <DashboardScreen projeto={projeto} estacas={estacas} fieldLogs={fieldLogs} status={gps.status} sessaoInfo={gps.sessaoInfo} estacaAtivaIndex={gps.estacaAtivaIndex} />
      )}

      {modo === 'parametros' && <ParametrosTable estaca={estacaAtiva} />}

      {modo === 'alteracoes' && <AlteracoesTab estacas={estacas} historico={historico} onReverter={reverter} />}

      {errosAbertos && <ErrosCadastraisPanel grupos={errosCadastrais} onFechar={() => setErrosAbertos(false)} />}

      {faixaEmEdicao != null && (
        <AlteracaoBottomSheet
          estaca={estacas.find((e) => e.id === faixaEmEdicao.estacaId)!}
          fieldLogs={fieldLogs}
          faixaInicial={faixaEmEdicao.faixaNumero}
          config={config}
          onFechar={() => setFaixaEmEdicao(null)}
          onConfirmarFaixa={(faixaNumero, novasSolucoes, nota) => confirmarAlteracao(faixaEmEdicao.estacaId, faixaNumero, novasSolucoes, nota)}
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
