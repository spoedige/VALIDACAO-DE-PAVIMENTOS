import { describe, expect, it } from 'vitest';
import type { Estaca, NormalizedSolution } from '../../types/domain';
import { coletarErrosCadastrais } from '../errosCadastrais';

function unknown(categoriaPai: NormalizedSolution['categoriaPai'], valorBruto: string | number): NormalizedSolution {
  return { categoriaPai, subtipoCodigo: 'UNKNOWN', valorBruto, normalizationStatus: 'unresolved' };
}
function ok(): NormalizedSolution {
  return { categoriaPai: 'Revest', subtipoCodigo: 'M', valorBruto: 'M', normalizationStatus: 'recognized' };
}
function estaca(id: number, numero: string, faixas: NormalizedSolution[][]): Estaca {
  return {
    id,
    numeroEstaca: numero,
    hodometroContinuo: id,
    hodometroMarco: numero,
    latitude: null,
    longitude: null,
    tipoSecao: null,
    marcoKm: null,
    observacaoOriginal: null,
    dreno: 'ausente',
    faixas: faixas.map((solucoesOriginais, i) => ({ numero: i + 1, parametros: {}, solucoesOriginais })),
  };
}

describe('coletarErrosCadastrais', () => {
  it('sem nenhuma solução desconhecida, não há erros', () => {
    expect(coletarErrosCadastrais([estaca(0, '0+0', [[ok()]])])).toEqual([]);
  });

  it('agrupa por coluna + texto da célula, contando ocorrências em todas as faixas (caso real: Revest. = 3)', () => {
    const estacas = [
      estaca(0, '36+1820', [[unknown('Revest', 3)], [unknown('Revest', 3)]]),
      estaca(1, '36+1840', [[unknown('Revest', 3)], [unknown('Revest', 3), ok()]]),
      estaca(2, '36+1860', [[ok()], []]),
    ];
    const grupos = coletarErrosCadastrais(estacas);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ categoriaPai: 'Revest', coluna: 'Revest.', textoCelula: '3', ocorrencias: 4 });
    expect(grupos[0].exemplos[0]).toBe('36+1820 F1');
  });

  it('mesmo texto em colunas diferentes são grupos separados, e o mais frequente vem primeiro', () => {
    const estacas = [
      estaca(0, 'A', [[unknown('Selagem', 'XX')]]),
      estaca(1, 'B', [[unknown('Revest', 'XX')]]),
      estaca(2, 'C', [[unknown('Revest', 'XX')]]),
    ];
    const grupos = coletarErrosCadastrais(estacas);
    expect(grupos.map((g) => `${g.coluna}:${g.ocorrencias}`)).toEqual(['Revest.:2', 'Selagem:1']);
  });

  it('limita os exemplos, mas conta todas as ocorrências', () => {
    const estacas = Array.from({ length: 10 }, (_, i) => estaca(i, `E${i}`, [[unknown('Revest', 3)]]));
    const [grupo] = coletarErrosCadastrais(estacas);
    expect(grupo.ocorrencias).toBe(10);
    expect(grupo.exemplos).toHaveLength(4);
  });
});
