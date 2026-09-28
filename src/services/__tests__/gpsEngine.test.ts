import { describe, expect, it } from 'vitest';
import { GpsEngine, calcularJanela, calcularJanelaEstabilidadeMs, classificarPrecisao, distanciaMetros, type EstacaGps, type GpsReading } from '../gpsEngine';

// Estacas a cada ~20m ao longo de uma linha reta (aproximação simples: 1e-4 graus
// de latitude ~ 11m, suficiente para simular sem precisar de projeção real).
const INTERVALO_KM = 0.02;
function buildEstacas(n: number): EstacaGps[] {
  return Array.from({ length: n }, (_, i) => ({ index: i, latitude: -18.4 + i * 0.0002, longitude: -48.0, hodometroContinuo: i * INTERVALO_KM }));
}

function leitura(estaca: EstacaGps, opts: { jitterMetros?: number; accuracy?: number; timestamp?: number } = {}): GpsReading {
  const jitterGraus = (opts.jitterMetros ?? 0) / 111000;
  return { lat: (estaca.latitude ?? 0) + jitterGraus, lon: estaca.longitude ?? 0, accuracy: opts.accuracy ?? 8, timestamp: opts.timestamp ?? Date.now() };
}

describe('distanciaMetros / classificarPrecisao', () => {
  it('distância entre o mesmo ponto é ~0', () => {
    expect(distanciaMetros(-18.4, -48.0, -18.4, -48.0)).toBeCloseTo(0, 3);
  });
  it('classifica precisão pelas faixas (boa <10m, moderada 10-30m, baixa >30m)', () => {
    expect(classificarPrecisao(5)).toBe('boa');
    expect(classificarPrecisao(10)).toBe('moderada');
    expect(classificarPrecisao(30)).toBe('moderada');
    expect(classificarPrecisao(31)).toBe('baixa');
  });
});

describe('calcularJanela', () => {
  const base = { behindMin: 5, aheadMin: 15 };
  it('sem dados de velocidade/tempo, usa a janela mínima fixa', () => {
    expect(calcularJanela(base, undefined, undefined, undefined)).toEqual(base);
  });
  it('escala a janela pra frente a 100km/h para não ficar curta demais', () => {
    const janela = calcularJanela(base, 30, 100, 0.02);
    expect(janela.aheadMin).toBeGreaterThan(base.aheadMin);
    expect(janela.behindMin).toBe(base.behindMin);
  });
  it('carro parado (velocidade ~0) não dispara janela maior que a mínima', () => {
    expect(calcularJanela(base, 10, 0, 0.02)).toEqual(base);
  });
});

describe('calcularJanelaEstabilidadeMs', () => {
  it('sem velocidade/espaçamento conhecidos, usa a base fixa', () => {
    expect(calcularJanelaEstabilidadeMs(undefined, undefined)).toBe(2000);
  });
  it('em alta velocidade com estacas próximas, encolhe pra não pular estações inteiras na própria histerese', () => {
    const ms = calcularJanelaEstabilidadeMs(100, 0.02); // 100km/h, 20m entre estacas
    expect(ms).toBeLessThan(2000);
    expect(ms).toBeGreaterThanOrEqual(500);
  });
  it('em velocidade baixa com estacas espaçadas, não passa do teto', () => {
    const ms = calcularJanelaEstabilidadeMs(5, 1);
    expect(ms).toBe(3000);
  });
});

describe('GpsEngine — cadeia de confiança e histerese (seção 2)', () => {
  it('avanço automático em alta confiança: 2 leituras estáveis apontando pra frente promovem a estaca ativa, sem toque nenhum', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 0);
    const t0 = Date.now();
    const r1 = engine.processReading(leitura(estacas[3], { timestamp: t0 }));
    expect(r1.confianca).toBe('alta');
    expect(r1.estacaAtivaIndex).toBe(0); // ainda não comitou (1ª leitura estável)
    expect(r1.candidatoIndex).toBe(3);

    const r2 = engine.processReading(leitura(estacas[3], { timestamp: t0 + 300 }));
    expect(r2.confianca).toBe('alta');
    expect(r2.estacaAtivaIndex).toBe(3); // 2ª leitura consistente comita o avanço
  });

  it('baixa confiança (accuracy ruim) é só diagnóstico — a estaca ativa fica congelada, nenhuma ação a aplica', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 5);
    const r = engine.processReading(leitura(estacas[6], { accuracy: 45 }));
    expect(r.confianca).toBe('baixa');
    expect(r.diagnostico).toBeTruthy();
    expect(r.estacaAtivaIndex).toBe(5); // congelada
    expect(r.candidatoIndex).toBe(6); // candidato aparece só como informação
  });

  it('candidato quase equidistante entre duas estacas não conta como único mesmo com accuracy boa', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 10);
    const meio: GpsReading = {
      lat: ((estacas[14].latitude ?? 0) + (estacas[15].latitude ?? 0)) / 2,
      lon: -48.0,
      accuracy: 5, // accuracy boa — não é isso que está em jogo aqui
      timestamp: Date.now(),
    };
    const r = engine.processReading(meio);
    expect(r.confianca).toBe('baixa');
    expect(r.diagnostico).toMatch(/equidistante/i);
    expect(r.estacaAtivaIndex).toBe(10);
  });

  it('histerese/monotonicidade: leituras oscilando entre dois candidatos não produzem avanço nem recuo a cada leitura', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 10);
    const t0 = Date.now();
    // oscila entre 12 (à frente) e 11 (mais perto, mas ainda à frente) sem nunca
    // repetir o mesmo candidato duas vezes seguidas — histerese nunca fecha
    const sequencia = [12, 11, 12, 11, 12];
    const resultados = sequencia.map((idx, i) => engine.processReading(leitura(estacas[idx], { timestamp: t0 + i * 300 })));
    // nenhuma leitura isolada comita: a estaca ativa nunca sai de 10 nem chega a "piscar"
    for (const r of resultados) expect(r.estacaAtivaIndex).toBe(10);
  });

  it('depois da oscilação, duas leituras seguidas no mesmo candidato finalmente comitam o avanço', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 10);
    const t0 = Date.now();
    engine.processReading(leitura(estacas[12], { timestamp: t0 }));
    engine.processReading(leitura(estacas[11], { timestamp: t0 + 200 }));
    engine.processReading(leitura(estacas[12], { timestamp: t0 + 400 }));
    const r = engine.processReading(leitura(estacas[12], { timestamp: t0 + 600 }));
    expect(r.confianca).toBe('alta');
    expect(r.estacaAtivaIndex).toBe(12);
  });

  it('nunca recua a estaca ativa: candidato atrás fica congelado com diagnóstico, sem correção manual possível', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 10);
    const r = engine.processReading(leitura(estacas[8]));
    expect(r.confianca).toBe('baixa');
    expect(r.diagnostico).toMatch(/atrás/i);
    expect(r.estacaAtivaIndex).toBe(10);
  });

  it('retomada automática: depois de ficar congelado por candidato atrás, volta a avançar quando o GPS indica posição à frente com estabilidade', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 10);
    const t0 = Date.now();
    engine.processReading(leitura(estacas[8], { timestamp: t0 })); // congela (diagnóstico)
    engine.processReading(leitura(estacas[11], { timestamp: t0 + 200 }));
    const r = engine.processReading(leitura(estacas[11], { timestamp: t0 + 400 }));
    expect(r.confianca).toBe('alta');
    expect(r.estacaAtivaIndex).toBe(11);
  });

  it('sem nenhuma estaca com coordenada válida na janela -> baixa confiança, nunca lança erro', () => {
    const estacas: EstacaGps[] = [{ index: 0, latitude: null, longitude: null, hodometroContinuo: 0 }];
    const engine = new GpsEngine(estacas, 0);
    const r = engine.processReading({ lat: -18.4, lon: -48.0, accuracy: 8, timestamp: Date.now() });
    expect(r.confianca).toBe('baixa');
    expect(r.candidatoIndex).toBeNull();
    expect(r.estacaAtivaIndex).toBe(0);
  });

  it('sem leituras (perda de sinal), a estaca ativa simplesmente não muda — não existe via manual de correção', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 10);
    expect(engine.estacaAtivaIndex).toBe(10);
  });
});
