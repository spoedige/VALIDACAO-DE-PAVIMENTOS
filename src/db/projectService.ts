import type { CadastroSolucao, Estaca, FieldChangeHistoryEntry, FieldLog, ImportResult, NormalizedSolution, Projeto } from '../types/domain';
import { db, type StationRow } from './schema';
import { solutionSetsEqual } from './solutionSet';
import { calcularEstadoAtualDaCadeia } from './historico';
import { aplicarCadastros } from '../services/cadastroSolucoes';

export interface ProjetoComAtividade extends Projeto {
  ultimaAtividade: string; // ISO — max(fieldLogs.lastModifiedAt) ou metadata.dataImport
}

export async function createProjectFromImport(result: ImportResult): Promise<string> {
  const { projeto, estacas } = result;
  const stations: StationRow[] = estacas.map((e) => ({ ...e, projectId: projeto.projectId }));
  await db.transaction('rw', db.projects, db.stations, async () => {
    await db.projects.put(projeto);
    await db.stations.bulkPut(stations);
  });
  return projeto.projectId;
}

export async function listProjects(): Promise<ProjetoComAtividade[]> {
  const projetos = await db.projects.toArray();
  const resultado: ProjetoComAtividade[] = [];
  for (const p of projetos) {
    const ultimoLog = await db.fieldLogs.where('projectId').equals(p.projectId).last();
    resultado.push({ ...p, ultimaAtividade: ultimoLog?.lastModifiedAt ?? p.metadata.dataImport });
  }
  return resultado.sort((a, b) => (a.ultimaAtividade < b.ultimaAtividade ? 1 : -1));
}

export async function getProject(projectId: string): Promise<Projeto | undefined> {
  return db.projects.get(projectId);
}

/** Estacas exatamente como foram importadas — usado pelo checkpoint (backup fiel) e por quem precisa do dado bruto. */
export async function getStationsBrutas(projectId: string): Promise<Estaca[]> {
  return db.stations.where('projectId').equals(projectId).toArray();
}

export async function getCadastrosSolucao(projectId: string): Promise<CadastroSolucao[]> {
  return (await db.projects.get(projectId))?.cadastrosSolucao ?? [];
}

/** Estacas com os cadastros de solução do usuário aplicados (UNKNOWN → legenda escolhida). */
export async function getStations(projectId: string): Promise<Estaca[]> {
  const [estacas, cadastros] = await Promise.all([getStationsBrutas(projectId), getCadastrosSolucao(projectId)]);
  if (cadastros.length === 0) return estacas;
  return estacas.map((e) => ({ ...e, faixas: e.faixas.map((f) => ({ ...f, solucoesOriginais: aplicarCadastros(f.solucoesOriginais, cadastros) })) }));
}

/**
 * Salva (ou substitui) o cadastro de uma célula não reconhecida. A chave é
 * coluna + texto da célula: cadastrar de novo o mesmo texto troca o destino.
 */
export async function salvarCadastroSolucao(projectId: string, cadastro: CadastroSolucao): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    const projeto = await db.projects.get(projectId);
    if (!projeto) return;
    const outros = (projeto.cadastrosSolucao ?? []).filter((c) => !(c.categoriaPai === cadastro.categoriaPai && c.textoCelula === cadastro.textoCelula));
    await db.projects.update(projectId, { cadastrosSolucao: [...outros, cadastro] });
  });
}

export async function removerCadastroSolucao(projectId: string, categoriaPai: CadastroSolucao['categoriaPai'], textoCelula: string): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    const projeto = await db.projects.get(projectId);
    if (!projeto) return;
    const restantes = (projeto.cadastrosSolucao ?? []).filter((c) => !(c.categoriaPai === categoriaPai && c.textoCelula === textoCelula));
    await db.projects.update(projectId, { cadastrosSolucao: restantes });
  });
}

/** Renomear só troca `nomeProjeto` — `projectId` nunca muda (critério de aceitação 15). */
export async function renameProject(projectId: string, novoNome: string): Promise<void> {
  await db.projects.update(projectId, { nomeProjeto: novoNome });
}

export async function deleteProject(projectId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.stations, db.fieldLogs, db.fieldChangeHistory, async () => {
    await db.projects.delete(projectId);
    await db.stations.where('projectId').equals(projectId).delete();
    await db.fieldLogs.where('projectId').equals(projectId).delete();
    await db.fieldChangeHistory.where('projectId').equals(projectId).delete();
  });
}

/** Registros de campo como gravados — usado pelo checkpoint. */
export async function getFieldLogsBrutos(projectId: string): Promise<FieldLog[]> {
  return db.fieldLogs.where('projectId').equals(projectId).toArray();
}

export async function getFieldLogsByProject(projectId: string): Promise<FieldLog[]> {
  const [logs, cadastros] = await Promise.all([getFieldLogsBrutos(projectId), getCadastrosSolucao(projectId)]);
  return logs.map((l) => ({ ...l, solucoesCampo: aplicarCadastros(l.solucoesCampo, cadastros) }));
}

export function fieldLogKey(estacaId: number, faixa: number): string {
  return `${estacaId}:${faixa}`;
}

export async function getFieldLogsMap(projectId: string): Promise<Map<string, FieldLog>> {
  const logs = await getFieldLogsByProject(projectId);
  return new Map(logs.map((l) => [fieldLogKey(l.estacaId, l.faixa), l]));
}

export interface ApplyFieldChangeInput {
  projectId: string;
  estacaId: number;
  faixa: number;
  original: NormalizedSolution[];
  novasSolucoes: NormalizedSolution[];
  nota?: string;
}

export type ApplyFieldChangeResult = 'sem-alteracao' | 'salvo' | 'revertido-para-original';

/**
 * Regra da seção 7: "sem alteração real, sem registro". Se o conjunto de
 * soluções confirmado for idêntico ao original e não houver nota, não cria
 * nem atualiza fieldLogs/fieldChangeHistory. O documento não cobre
 * explicitamente o caso de reverter uma alteração já salva de volta pro
 * original — decisão conservadora aqui: apagar o fieldLog existente (sem
 * registrar esse passo no histórico), porque mantê-lo geraria uma entrada
 * indistinguível do original tanto no app quanto no CSV, contradizendo a
 * garantia de que essa estaca/faixa "não aparece no CSV final" (critério 14).
 * Sinalizado no checklist para confirmação do usuário.
 */
export async function applyFieldChange(input: ApplyFieldChangeInput): Promise<ApplyFieldChangeResult> {
  const { projectId, estacaId, faixa, original, novasSolucoes, nota } = input;
  const semNota = !nota || nota.trim() === '';

  return db.transaction('rw', db.fieldLogs, db.fieldChangeHistory, async () => {
    const existente = await db.fieldLogs.where('[projectId+estacaId+faixa]').equals([projectId, estacaId, faixa]).first();

    if (solutionSetsEqual(novasSolucoes, original) && semNota) {
      if (existente) {
        await db.fieldLogs.delete(existente.id!);
        return 'revertido-para-original';
      }
      return 'sem-alteracao';
    }

    const agora = new Date().toISOString();
    const de = existente?.solucoesCampo ?? original;

    if (existente) {
      await db.fieldLogs.update(existente.id!, { solucoesCampo: novasSolucoes, notaCampo: nota, lastModifiedAt: agora });
    } else {
      await db.fieldLogs.add({ projectId, estacaId, faixa, solucoesCampo: novasSolucoes, notaCampo: nota, firstModifiedAt: agora, lastModifiedAt: agora });
    }
    await db.fieldChangeHistory.add({ projectId, timestamp: agora, estacaId, faixa, de, para: novasSolucoes, nota });
    return 'salvo';
  });
}

export async function getFieldChangeHistoryByProject(projectId: string): Promise<FieldChangeHistoryEntry[]> {
  const eventos = await db.fieldChangeHistory.where('projectId').equals(projectId).toArray();
  return eventos.sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // mais recente primeiro
}

/**
 * Reverte um evento específico do histórico (aba "Alterações", item 5). O
 * evento nunca é apagado — só marcado `revertidoEm` — e o estado atual da
 * faixa é recalculado a partir da cadeia inteira de eventos ainda válidos,
 * preservando alterações posteriores (ver `calcularEstadoAtualDaCadeia`).
 * Diferente da regra de não ter estaca ativa manual: aqui não se mexe em
 * GPS nem em qual estaca é a ativa, só em registros de solução já salvos.
 */
export async function reverterEvento(eventoId: number): Promise<void> {
  await db.transaction('rw', db.fieldChangeHistory, db.fieldLogs, db.stations, db.projects, async () => {
    const evento = await db.fieldChangeHistory.get(eventoId);
    if (!evento || evento.revertidoEm) return;

    await db.fieldChangeHistory.update(eventoId, { revertidoEm: new Date().toISOString() });

    const { projectId, estacaId, faixa } = evento;
    const eventosDaFaixa = await db.fieldChangeHistory
      .where('projectId').equals(projectId)
      .filter((e) => e.estacaId === estacaId && e.faixa === faixa)
      .toArray();

    const estacao = await db.stations.where('[projectId+id]').equals([projectId, estacaId]).first();
    const faixaOriginal = estacao?.faixas.find((f) => f.numero === faixa);
    const cadastros = (await db.projects.get(projectId))?.cadastrosSolucao;
    const solucaoOriginal = aplicarCadastros(faixaOriginal?.solucoesOriginais ?? [], cadastros);

    const novoEstado = calcularEstadoAtualDaCadeia(eventosDaFaixa, solucaoOriginal);
    const fieldLog = await db.fieldLogs.where('[projectId+estacaId+faixa]').equals([projectId, estacaId, faixa]).first();

    // mesma regra de "sem alteração real, sem registro": se o estado
    // recalculado bate com o original e não tem nota, não deixa um
    // fieldLog órfão indistinguível do original.
    if (solutionSetsEqual(novoEstado, solucaoOriginal) && !fieldLog?.notaCampo) {
      if (fieldLog) await db.fieldLogs.delete(fieldLog.id!);
      return;
    }

    const agora = new Date().toISOString();
    if (fieldLog) {
      await db.fieldLogs.update(fieldLog.id!, { solucoesCampo: novoEstado, lastModifiedAt: agora });
    } else {
      await db.fieldLogs.add({ projectId, estacaId, faixa, solucoesCampo: novoEstado, firstModifiedAt: agora, lastModifiedAt: agora });
    }
  });
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
