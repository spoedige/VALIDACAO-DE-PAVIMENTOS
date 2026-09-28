import type { Checkpoint, Projeto } from '../types/domain';
import { db, type StationRow } from './schema';
import { getFieldLogsByProject, getStations } from './projectService';

const SCHEMA_VERSION = 1;

export async function buildCheckpoint(projeto: Projeto): Promise<Checkpoint> {
  const estacas = await getStations(projeto.projectId);
  const fieldLogs = await getFieldLogsByProject(projeto.projectId);
  const fieldChangeHistory = await db.fieldChangeHistory.where('projectId').equals(projeto.projectId).toArray();
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: projeto.projectId,
    sourceFileHash: projeto.sourceFileHash,
    metadata: projeto.metadata,
    nomeProjeto: projeto.nomeProjeto,
    estacas,
    fieldLogs,
    fieldChangeHistory,
    exportedAt: new Date().toISOString(),
  };
}

export function checkpointHashMatches(checkpoint: Checkpoint, sourceFileHashCarregado: string): boolean {
  return checkpoint.sourceFileHash === sourceFileHashCarregado;
}

export interface RestoreCheckpointOptions {
  /** true = aplica mesmo com sourceFileHash diferente do arquivo carregado (usuário confirmou o aviso). */
  force?: boolean;
  sourceFileHashCarregado?: string;
}

export async function restoreCheckpoint(checkpoint: Checkpoint, options: RestoreCheckpointOptions = {}): Promise<void> {
  if (options.sourceFileHashCarregado && !checkpointHashMatches(checkpoint, options.sourceFileHashCarregado) && !options.force) {
    throw new Error('sourceFileHash do checkpoint não bate com a planilha carregada — confirme antes de aplicar.');
  }

  const projeto: Projeto = {
    projectId: checkpoint.projectId,
    sourceFileHash: checkpoint.sourceFileHash,
    sourceFileName: checkpoint.metadata.localBruto ?? checkpoint.nomeProjeto,
    nomeProjeto: checkpoint.nomeProjeto,
    metadata: checkpoint.metadata,
  };
  const stations: StationRow[] = checkpoint.estacas.map((e) => ({ ...e, projectId: checkpoint.projectId }));

  await db.transaction('rw', db.projects, db.stations, db.fieldLogs, db.fieldChangeHistory, async () => {
    await db.projects.put(projeto);
    await db.stations.where('projectId').equals(checkpoint.projectId).delete();
    await db.stations.bulkPut(stations);
    await db.fieldLogs.where('projectId').equals(checkpoint.projectId).delete();
    await db.fieldLogs.bulkAdd(checkpoint.fieldLogs.map(({ id: _id, ...rest }) => rest));
    await db.fieldChangeHistory.where('projectId').equals(checkpoint.projectId).delete();
    await db.fieldChangeHistory.bulkAdd(checkpoint.fieldChangeHistory.map(({ id: _id, ...rest }) => rest));
  });
}
