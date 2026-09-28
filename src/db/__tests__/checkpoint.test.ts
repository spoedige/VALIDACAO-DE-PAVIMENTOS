import { afterEach, describe, expect, it } from 'vitest';
import type { Estaca, ImportResult } from '../../types/domain';
import { db } from '../schema';
import { applyFieldChange, createProjectFromImport, getProject } from '../projectService';
import { buildCheckpoint, checkpointHashMatches, restoreCheckpoint } from '../checkpoint';

function estaca(id: number): Estaca {
  return {
    id,
    numeroEstaca: `0+${id * 20}`,
    hodometroContinuo: id * 0.02,
    hodometroMarco: `0+${id * 20}`,
    latitude: -18.4,
    longitude: -48.0,
    tipoSecao: null,
    marcoKm: null,
    observacaoOriginal: null,
    dreno: 'ausente',
    faixas: [{ numero: 1, parametros: {}, solucoesOriginais: [] }],
  };
}

function buildImportResult(hash: string, estacas: Estaca[]): ImportResult {
  return {
    projeto: {
      projectId: crypto.randomUUID(),
      sourceFileHash: hash,
      sourceFileName: 'teste.xlsx',
      nomeProjeto: 'Projeto Teste',
      metadata: { rodovia: 'BR-050/MG', sentido: 'Crescente', kmInicial: 0, kmFinal: 1, localBruto: null, dataImport: new Date().toISOString() },
    },
    estacas,
    summary: { rodovia: 'BR-050/MG', sentido: 'Crescente', kmInicial: 0, kmFinal: 1, totalEstacas: estacas.length, faixasDetectadas: [1], intervaloMedioEstacas: 0.02 },
    issues: [],
    canProceed: true,
  };
}

afterEach(async () => {
  await db.projects.clear();
  await db.stations.clear();
  await db.fieldLogs.clear();
  await db.fieldChangeHistory.clear();
});

describe('checkpoint', () => {
  it('gera e restaura um checkpoint completo (metadata, estacas, fieldLogs, histórico)', async () => {
    const projectId = await createProjectFromImport(buildImportResult('hash-abc', [estaca(0), estaca(1)]));
    await applyFieldChange({ projectId, estacaId: 0, faixa: 1, original: [], novasSolucoes: [{ categoriaPai: 'Estrutural', subtipoCodigo: 'RPX', valorComplementar: 7, valorBruto: 'RP7,0', normalizationStatus: 'recognized' }] });

    const projeto = (await getProject(projectId))!;
    const checkpoint = await buildCheckpoint(projeto);
    expect(checkpoint.schemaVersion).toBe(1);
    expect(checkpoint.estacas).toHaveLength(2);
    expect(checkpoint.fieldLogs).toHaveLength(1);
    expect(checkpoint.fieldChangeHistory).toHaveLength(1);

    // limpa tudo e restaura a partir do checkpoint
    await db.projects.clear();
    await db.stations.clear();
    await db.fieldLogs.clear();
    await db.fieldChangeHistory.clear();

    await restoreCheckpoint(checkpoint, { sourceFileHashCarregado: 'hash-abc' });
    const restaurado = await getProject(projectId);
    expect(restaurado?.nomeProjeto).toBe('Projeto Teste');
    const estacasRestauradas = await db.stations.where('projectId').equals(projectId).toArray();
    expect(estacasRestauradas).toHaveLength(2);
    const logsRestaurados = await db.fieldLogs.where('projectId').equals(projectId).toArray();
    expect(logsRestaurados).toHaveLength(1);
  });

  it('critério 12: sourceFileHash diferente do arquivo carregado bloqueia sem "force"', async () => {
    const projectId = await createProjectFromImport(buildImportResult('hash-original', [estaca(0)]));
    const projeto = (await getProject(projectId))!;
    const checkpoint = await buildCheckpoint(projeto);

    expect(checkpointHashMatches(checkpoint, 'hash-diferente')).toBe(false);
    await expect(restoreCheckpoint(checkpoint, { sourceFileHashCarregado: 'hash-diferente' })).rejects.toThrow();
  });

  it('com force:true, aplica mesmo com hash diferente (usuário confirmou o aviso)', async () => {
    const projectId = await createProjectFromImport(buildImportResult('hash-original', [estaca(0)]));
    const projeto = (await getProject(projectId))!;
    const checkpoint = await buildCheckpoint(projeto);

    await expect(restoreCheckpoint(checkpoint, { sourceFileHashCarregado: 'hash-diferente', force: true })).resolves.not.toThrow();
  });
});
