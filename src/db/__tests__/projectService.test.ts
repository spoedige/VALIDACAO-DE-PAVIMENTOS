import { afterEach, describe, expect, it } from 'vitest';
import type { Estaca, ImportResult, NormalizedSolution } from '../../types/domain';
import { db } from '../schema';
import {
  applyFieldChange,
  createProjectFromImport,
  deleteProject,
  getFieldLogsByProject,
  getStations,
  listProjects,
  renameProject,
} from '../projectService';

function sol(categoriaPai: NormalizedSolution['categoriaPai'], subtipoCodigo: string, valorComplementar?: number): NormalizedSolution {
  return { categoriaPai, subtipoCodigo, valorComplementar, valorBruto: subtipoCodigo, normalizationStatus: 'recognized' };
}

function estaca(id: number, solucoes: NormalizedSolution[] = []): Estaca {
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
    faixas: [{ numero: 1, parametros: {}, solucoesOriginais: solucoes }],
  };
}

function buildImportResult(estacas: Estaca[]): ImportResult {
  return {
    projeto: {
      projectId: crypto.randomUUID(),
      sourceFileHash: 'hash-teste',
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

describe('projectService', () => {
  it('cria projeto e estacas, e permite reabrir depois', async () => {
    const result = buildImportResult([estaca(0, [sol('Estrutural', 'RPX', 7)]), estaca(1)]);
    const projectId = await createProjectFromImport(result);
    const estacas = await getStations(projectId);
    expect(estacas).toHaveLength(2);
    expect(estacas[0].faixas[0].solucoesOriginais[0].subtipoCodigo).toBe('RPX');
  });

  it('critério 15: renomear projeto não muda o projectId', async () => {
    const result = buildImportResult([estaca(0)]);
    const projectId = await createProjectFromImport(result);
    await renameProject(projectId, 'Novo Nome');
    const projetos = await listProjects();
    const p = projetos.find((x) => x.projectId === projectId)!;
    expect(p.projectId).toBe(projectId);
    expect(p.nomeProjeto).toBe('Novo Nome');
  });

  it('critério 13: mais de um projeto pode existir, cada um preservando seu progresso', async () => {
    const p1 = await createProjectFromImport(buildImportResult([estaca(0)]));
    const p2 = await createProjectFromImport(buildImportResult([estaca(0), estaca(1)]));
    await applyFieldChange({ projectId: p1, estacaId: 0, faixa: 1, original: [], novasSolucoes: [sol('Estrutural', 'RPX', 7)] });
    const estacasP1 = await getStations(p1);
    const estacasP2 = await getStations(p2);
    expect(estacasP1).toHaveLength(1);
    expect(estacasP2).toHaveLength(2);
    const logsP1 = await getFieldLogsByProject(p1);
    const logsP2 = await getFieldLogsByProject(p2);
    expect(logsP1).toHaveLength(1);
    expect(logsP2).toHaveLength(0);
  });

  it('critério 6: alterar soluções gera fieldLog e um passo em fieldChangeHistory com timestamp', async () => {
    const projectId = await createProjectFromImport(buildImportResult([estaca(0, [sol('Estrutural', 'RPX', 7), sol('FresagemFina', 'FF')])]));
    const original = [sol('Estrutural', 'RPX', 7), sol('FresagemFina', 'FF')];
    const novas = [sol('Estrutural', 'RPX', 7), sol('Selagem', 'ST')];
    const r = await applyFieldChange({ projectId, estacaId: 0, faixa: 1, original, novasSolucoes: novas });
    expect(r).toBe('salvo');
    const logs = await getFieldLogsByProject(projectId);
    expect(logs).toHaveLength(1);
    expect(logs[0].solucoesCampo.map((s) => s.subtipoCodigo).sort()).toEqual(['RPX', 'ST']);
    const historico = await db.fieldChangeHistory.where('projectId').equals(projectId).toArray();
    expect(historico).toHaveLength(1);
    expect(historico[0].timestamp).toBeTruthy();
  });

  it('critério 14: confirmar o mesmo conjunto do original (ordem diferente), sem nota, não cria registro', async () => {
    const projectId = await createProjectFromImport(buildImportResult([estaca(0)]));
    const original = [sol('Estrutural', 'RPX', 7), sol('Selagem', 'ST')];
    const mesmoConjuntoOutraOrdem = [sol('Selagem', 'ST'), sol('Estrutural', 'RPX', 7)];
    const r = await applyFieldChange({ projectId, estacaId: 0, faixa: 1, original, novasSolucoes: mesmoConjuntoOutraOrdem });
    expect(r).toBe('sem-alteracao');
    expect(await getFieldLogsByProject(projectId)).toHaveLength(0);
    expect(await db.fieldChangeHistory.where('projectId').equals(projectId).toArray()).toHaveLength(0);
  });

  it('reverter uma alteração já salva de volta pro conjunto original remove o fieldLog (não fica órfão no CSV)', async () => {
    const projectId = await createProjectFromImport(buildImportResult([estaca(0)]));
    const original = [sol('Estrutural', 'RPX', 7)];
    await applyFieldChange({ projectId, estacaId: 0, faixa: 1, original, novasSolucoes: [sol('Selagem', 'ST')] });
    expect(await getFieldLogsByProject(projectId)).toHaveLength(1);

    const r = await applyFieldChange({ projectId, estacaId: 0, faixa: 1, original, novasSolucoes: original });
    expect(r).toBe('revertido-para-original');
    expect(await getFieldLogsByProject(projectId)).toHaveLength(0);
  });

  it('nota de texto sozinha (mesmo conjunto de soluções) ainda conta como alteração real', async () => {
    const projectId = await createProjectFromImport(buildImportResult([estaca(0)]));
    const original = [sol('Estrutural', 'RPX', 7)];
    const r = await applyFieldChange({ projectId, estacaId: 0, faixa: 1, original, novasSolucoes: original, nota: 'drenagem obstruída' });
    expect(r).toBe('salvo');
    const logs = await getFieldLogsByProject(projectId);
    expect(logs[0].notaCampo).toBe('drenagem obstruída');
  });

  it('excluir projeto remove estacas, fieldLogs e histórico junto', async () => {
    const projectId = await createProjectFromImport(buildImportResult([estaca(0)]));
    await applyFieldChange({ projectId, estacaId: 0, faixa: 1, original: [], novasSolucoes: [sol('Estrutural', 'RPX', 7)] });
    await deleteProject(projectId);
    expect(await getStations(projectId)).toHaveLength(0);
    expect(await getFieldLogsByProject(projectId)).toHaveLength(0);
    expect(await db.fieldChangeHistory.where('projectId').equals(projectId).toArray()).toHaveLength(0);
  });
});
