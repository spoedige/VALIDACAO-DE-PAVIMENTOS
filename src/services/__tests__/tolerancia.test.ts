import { describe, expect, it } from 'vitest';
import { calcularForaDeTolerancia, type LimiaresToleranciaConfig } from '../tolerancia';

// Mesmo config extraído de public/config/limiares-tolerancia.json (item 7 da
// atualização de UX) — valores reais das regras de formatação condicional
// dos 2 arquivos .xlsx fornecidos, não inventados.
const config: LimiaresToleranciaConfig = {
  parametros: {
    iri: { tipo: 'numerico', operador: '>=', valor: 2.7 },
    percDefeitos: { tipo: 'numerico', operador: '>=', valor: 0.25 },
    hr: { tipo: 'numerico', operador: '>=', valor: 8 },
    rc: { tipo: 'numerico', operador: '<', valor: 70 },
    oprd: { tipo: 'naoVazio' },
    exafe: { tipo: 'naoVazio' },
  },
};

describe('calcularForaDeTolerancia', () => {
  it('marca fora de tolerância quando o valor numérico cruza o limiar real da planilha (IRI >= 2,7)', () => {
    expect(calcularForaDeTolerancia({ iri: 2.7 }, config).iri).toBe(true);
    expect(calcularForaDeTolerancia({ iri: 2.69 }, config).iri).toBe(false);
  });

  it('respeita o operador "<" (Rc é ruim quando BAIXO, não alto)', () => {
    expect(calcularForaDeTolerancia({ rc: 69 }, config).rc).toBe(true);
    expect(calcularForaDeTolerancia({ rc: 70 }, config).rc).toBe(false);
    expect(calcularForaDeTolerancia({ rc: 900 }, config).rc).toBe(false);
  });

  it('célula vazia nunca é fora de tolerância, mesmo com regra "naoVazio"', () => {
    expect(calcularForaDeTolerancia({}, config).oprd).toBe(false);
    expect(calcularForaDeTolerancia({ oprd: '' }, config).oprd).toBe(false);
  });

  it('qualquer valor presente em coluna "naoVazio" (ex: OPRD="X") conta como fora de tolerância', () => {
    expect(calcularForaDeTolerancia({ oprd: 'X' }, config).oprd).toBe(true);
    expect(calcularForaDeTolerancia({ exafe: 'X' }, config).exafe).toBe(true);
  });

  it('0 é um valor válido e é avaliado normalmente, nunca tratado como vazio', () => {
    expect(calcularForaDeTolerancia({ percDefeitos: 0 }, config).percDefeitos).toBe(false);
  });

  it('parâmetro sem regra no config nunca aparece no resultado', () => {
    const r = calcularForaDeTolerancia({ atrMax: 999 }, config);
    expect(r.atrMax).toBeUndefined();
  });
});
