import { describe, expect, it } from 'vitest';
import { normalizeSolution, type NormalizationConfig } from '../normalizer';

const config: NormalizationConfig = {
  categorias: {
    Estrutural: {
      regras: [
        { tipo: 'prefixoComEspessura', prefixo: 'RP', subtipoCodigo: 'RPX' },
        { tipo: 'prefixoComEspessura', prefixo: 'RE', subtipoCodigo: 'REX' },
      ],
    },
    FresagemFuncional: { regras: [{ tipo: 'numeroPuro', subtipoCodigo: 'FresagemFuncional' }] },
    FresagemEstrutural: { regras: [{ tipo: 'numeroPuro', subtipoCodigo: 'FresagemEstrutural' }] },
    Microfres: {
      regras: [
        { tipo: 'sigla', valor: 'MF', subtipoCodigo: 'MFS' },
        { tipo: 'sigla', valor: 'MFS', subtipoCodigo: 'MFS' },
      ],
    },
    Revest: { regras: [{ tipo: 'sigla', valor: 'M', subtipoCodigo: 'M' }] },
  },
};

describe('normalizeSolution', () => {
  it('célula vazia de verdade retorna null, não um registro unresolved', () => {
    expect(normalizeSolution('Revest', '', config)).toBeNull();
    expect(normalizeSolution('Revest', '   ', config)).toBeNull();
    expect(normalizeSolution('Revest', null, config)).toBeNull();
    expect(normalizeSolution('Revest', undefined, config)).toBeNull();
  });

  it('código com espessura embutida (ex: "RP7,0") é reconhecido e a espessura preservada', () => {
    const r = normalizeSolution('Estrutural', 'RP7,0', config);
    expect(r).toEqual({
      categoriaPai: 'Estrutural',
      subtipoCodigo: 'RPX',
      valorComplementar: 7,
      valorBruto: 'RP7,0',
      normalizationStatus: 'recognized',
    });
  });

  it('número puro (espessura em cm) é reconhecido e preservado, nunca descartado', () => {
    expect(normalizeSolution('FresagemFuncional', 0.5, config)).toEqual({
      categoriaPai: 'FresagemFuncional',
      subtipoCodigo: 'FresagemFuncional',
      valorComplementar: 0.5,
      valorBruto: 0.5,
      normalizationStatus: 'recognized',
    });
    expect(normalizeSolution('FresagemEstrutural', 1, config)?.valorComplementar).toBe(1);
  });

  it('0 numérico é um valor válido, nunca tratado como célula vazia', () => {
    const r = normalizeSolution('FresagemFuncional', 0, config);
    expect(r).not.toBeNull();
    expect(r?.normalizationStatus).toBe('recognized');
    expect(r?.valorComplementar).toBe(0);
  });

  it('sigla reconhecida na categoria certa é normalizada (Microfres. "MF" -> "MFS")', () => {
    const r = normalizeSolution('Microfres', 'MF', config);
    expect(r).toEqual({
      categoriaPai: 'Microfres',
      subtipoCodigo: 'MFS',
      valorBruto: 'MF',
      normalizationStatus: 'recognized',
    });
  });

  it('mesmo código bruto ("M") só resolve na categoria onde está oficialmente definido', () => {
    expect(normalizeSolution('Revest', 'M', config)?.subtipoCodigo).toBe('M');
    // "M" não tem regra definida para Microfres — nunca inferir por coincidência
    expect(normalizeSolution('Microfres', 'M', config)).toEqual({
      categoriaPai: 'Microfres',
      subtipoCodigo: 'UNKNOWN',
      valorBruto: 'M',
      normalizationStatus: 'unresolved',
    });
  });

  it('valor numérico sem sigla definida na categoria (Revest. "3") fica unresolved, com o bruto preservado', () => {
    const r = normalizeSolution('Revest', 3, config);
    expect(r).toEqual({
      categoriaPai: 'Revest',
      subtipoCodigo: 'UNKNOWN',
      valorBruto: 3,
      normalizationStatus: 'unresolved',
    });
  });

  it('categoria sem nenhuma regra configurada sempre retorna unresolved, nunca lança erro', () => {
    const r = normalizeSolution('Selagem', 'ST', config);
    expect(r?.normalizationStatus).toBe('unresolved');
    expect(r?.valorBruto).toBe('ST');
  });
});
