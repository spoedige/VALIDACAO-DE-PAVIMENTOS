import { afterEach, describe, expect, it } from 'vitest';
import type { CadastroSolucao, NormalizedSolution } from '../../types/domain';
import { aplicarCadastros, legendasPersonalizadasDe } from '../cadastroSolucoes';
import { corSolucao, entradasLegenda, registrarLegendasPersonalizadas } from '../../config/paleta';

const unknown3: NormalizedSolution = { categoriaPai: 'Revest', subtipoCodigo: 'UNKNOWN', valorBruto: 3, normalizationStatus: 'unresolved' };
const micro: NormalizedSolution = { categoriaPai: 'Revest', subtipoCodigo: 'M', valorBruto: 'M', normalizationStatus: 'recognized' };

const comoLegenda: CadastroSolucao = { categoriaPai: 'Revest', textoCelula: '3', destino: { tipo: 'legenda', categoriaPai: 'FresagemFuncional', subtipoCodigo: 'FresagemFuncional', comEspessura: true } };
const comoPropria: CadastroSolucao = { categoriaPai: 'Revest', textoCelula: '3', destino: { tipo: 'personalizada', nome: 'GAP', cor: '#0EA5E9' } };

afterEach(() => registrarLegendasPersonalizadas([]));

describe('aplicarCadastros', () => {
  it('sem cadastro, nada muda', () => {
    expect(aplicarCadastros([unknown3, micro], [])).toEqual([unknown3, micro]);
    expect(aplicarCadastros([unknown3], undefined)).toEqual([unknown3]);
  });

  it('cadastro como legenda existente: vira a legenda escolhida, com o número da célula como espessura', () => {
    const [resultado] = aplicarCadastros([unknown3], [comoLegenda]);
    expect(resultado).toMatchObject({ categoriaPai: 'FresagemFuncional', subtipoCodigo: 'FresagemFuncional', valorComplementar: 3, normalizationStatus: 'recognized', valorBruto: 3 });
  });

  it('cadastro como legenda sem "comEspessura": não inventa espessura', () => {
    const semEspessura: CadastroSolucao = { ...comoLegenda, destino: { tipo: 'legenda', categoriaPai: 'Revest', subtipoCodigo: 'M' } };
    const [resultado] = aplicarCadastros([unknown3], [semEspessura]);
    expect(resultado).toMatchObject({ categoriaPai: 'Revest', subtipoCodigo: 'M', normalizationStatus: 'recognized' });
    expect(resultado.valorComplementar).toBeUndefined();
  });

  it('cadastro como legenda própria: ganha código PERSONALIZADA:<texto> e fica reconhecida', () => {
    const [resultado] = aplicarCadastros([unknown3], [comoPropria]);
    expect(resultado).toMatchObject({ categoriaPai: 'Revest', subtipoCodigo: 'PERSONALIZADA:3', normalizationStatus: 'recognized', valorBruto: 3 });
  });

  it('só casa com a MESMA coluna e o MESMO texto — outra coluna ou outro texto continuam UNKNOWN', () => {
    const outraColuna: NormalizedSolution = { ...unknown3, categoriaPai: 'Selagem' };
    const outroTexto: NormalizedSolution = { ...unknown3, valorBruto: 4 };
    expect(aplicarCadastros([outraColuna, outroTexto], [comoPropria])).toEqual([outraColuna, outroTexto]);
  });

  it('soluções reconhecidas passam intactas', () => {
    expect(aplicarCadastros([micro], [comoPropria, comoLegenda])).toEqual([micro]);
  });

  it('legenda própria já gravada num registro, cujo cadastro foi removido, volta a ser UNKNOWN', () => {
    const [aplicada] = aplicarCadastros([unknown3], [comoPropria]);
    const [depoisDeRemover] = aplicarCadastros([aplicada], []);
    expect(depoisDeRemover).toMatchObject({ categoriaPai: 'Revest', subtipoCodigo: 'UNKNOWN', valorBruto: 3, normalizationStatus: 'unresolved' });
  });
});

describe('legendas próprias na paleta', () => {
  it('só cadastros "personalizada" viram legenda própria', () => {
    expect(legendasPersonalizadasDe([comoLegenda, comoPropria])).toEqual([{ categoriaPai: 'Revest', textoCelula: '3', nome: 'GAP', cor: '#0EA5E9' }]);
  });

  it('corSolucao resolve a legenda própria registrada e a legenda lista as oficiais + as próprias', () => {
    const oficiais = entradasLegenda().length;
    registrarLegendasPersonalizadas(legendasPersonalizadasDe([comoPropria]));
    expect(corSolucao('Revest', 'PERSONALIZADA:3')).toMatchObject({ label: 'GAP', cor: '#0EA5E9', origem: 'cadastrada pelo usuário' });
    expect(entradasLegenda()).toHaveLength(oficiais + 1);
  });

  it('sem registro, a mesma solução cai no cinza "não reconhecido" (nunca numa cor oficial)', () => {
    expect(corSolucao('Revest', 'PERSONALIZADA:3').labelCurto).toBe('UNKNOWN');
  });

  it('a paleta oficial não é alterada por legendas próprias', () => {
    registrarLegendasPersonalizadas(legendasPersonalizadasDe([comoPropria]));
    expect(corSolucao('Revest', 'M').cor).toBe('#A9CF8F');
  });
});
