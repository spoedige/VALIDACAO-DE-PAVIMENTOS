import { describe, expect, it } from 'vitest';
import { buildCsv } from '../csvExport';
import type { Estaca, FieldLog, NormalizedSolution, Projeto } from '../../types/domain';

function sol(categoriaPai: NormalizedSolution['categoriaPai'], subtipoCodigo: string, status: NormalizedSolution['normalizationStatus'] = 'recognized', valorBruto: NormalizedSolution['valorBruto'] = subtipoCodigo): NormalizedSolution {
  return { categoriaPai, subtipoCodigo, valorBruto, normalizationStatus: status };
}

const projeto: Projeto = {
  projectId: 'p1',
  sourceFileHash: 'hash',
  sourceFileName: 'teste.xlsx',
  nomeProjeto: 'Projeto Teste',
  metadata: { rodovia: 'BR-050/MG', sentido: 'Crescente', kmInicial: 0, kmFinal: 180, localBruto: null, dataImport: new Date().toISOString() },
};

function estaca(id: number, numeroEstaca: string, hodometroContinuo: number, solucoesOriginais: NormalizedSolution[]): Estaca {
  return {
    id,
    numeroEstaca,
    hodometroContinuo,
    hodometroMarco: numeroEstaca,
    latitude: -18.4,
    longitude: -48.0,
    tipoSecao: null,
    marcoKm: null,
    observacaoOriginal: null,
    dreno: 'ausente',
    faixas: [{ numero: 1, parametros: {}, solucoesOriginais }],
  };
}

describe('buildCsv', () => {
  it('critério 11: múltiplas soluções na mesma faixa separadas por "|"', () => {
    const estacas = [estaca(0, '0+20', 0.02, [sol('Estrutural', 'RPX'), sol('Selagem', 'ST')])];
    const log: FieldLog = {
      projectId: 'p1',
      estacaId: 0,
      faixa: 1,
      solucoesCampo: [sol('FresagemEstrutural', 'FresagemEstrutural'), sol('Microfres', 'MFS')],
      firstModifiedAt: '2026-01-01T00:00:00.000Z',
      lastModifiedAt: '2026-01-01T00:00:00.000Z',
    };
    const csv = buildCsv(projeto, estacas, [log]);
    const linha = csv.split('\n')[1];
    expect(linha).toContain('RPX|ST');
    expect(linha).toContain('FresagemEstrutural|MFS');
  });

  it('critério 11: só estacas/faixas com fieldLog aparecem, uma linha por estaca/faixa', () => {
    const estacas = [estaca(0, '0+0', 0, []), estaca(1, '0+20', 0.02, [])];
    const log: FieldLog = { projectId: 'p1', estacaId: 1, faixa: 1, solucoesCampo: [sol('Estrutural', 'RPX')], firstModifiedAt: 'x', lastModifiedAt: 'x' };
    const csv = buildCsv(projeto, estacas, [log]);
    const linhas = csv.split('\n');
    expect(linhas).toHaveLength(2); // cabeçalho + 1 linha
    expect(linhas[1]).toContain('0+20');
  });

  it('solução unresolved aparece como UNKNOWN:valorBruto, nunca omitida ou substituída', () => {
    const estacas = [estaca(0, '0+20', 0.02, [])];
    const log: FieldLog = {
      projectId: 'p1',
      estacaId: 0,
      faixa: 1,
      solucoesCampo: [sol('Revest', 'UNKNOWN', 'unresolved', 3)],
      firstModifiedAt: 'x',
      lastModifiedAt: 'x',
    };
    const csv = buildCsv(projeto, estacas, [log]);
    expect(csv).toContain('UNKNOWN:3');
  });

  it('lido de fieldLogs (estado atual), a SolucaoOriginal reflete a estaca importada, não o histórico', () => {
    const estacas = [estaca(0, '0+20', 0.02, [sol('Estrutural', 'RPX')])];
    const log: FieldLog = { projectId: 'p1', estacaId: 0, faixa: 1, solucoesCampo: [sol('Selagem', 'ST')], notaCampo: 'trinca visível', firstModifiedAt: 'x', lastModifiedAt: '2026-02-02T10:00:00.000Z' };
    const csv = buildCsv(projeto, estacas, [log]);
    const linha = csv.split('\n')[1];
    expect(linha).toContain('RPX'); // original
    expect(linha).toContain('ST'); // campo
    expect(linha).toContain('trinca visível');
    expect(linha).toContain('2026-02-02T10:00:00.000Z');
  });

  it('nenhum fieldLog -> CSV só com cabeçalho', () => {
    const estacas = [estaca(0, '0+0', 0, [sol('Estrutural', 'RPX')])];
    const csv = buildCsv(projeto, estacas, []);
    expect(csv.split('\n')).toHaveLength(1);
  });
});
