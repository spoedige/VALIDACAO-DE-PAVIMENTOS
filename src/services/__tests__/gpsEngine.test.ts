import { describe, expect, it } from 'vitest';
import { GpsEngine, calcularJanela, classificarPrecisao, distanciaMetros, type EstacaGps, type GpsReading } from '../gpsEngine';

// Estacas a cada ~20m ao longo de uma linha reta (aproximação simples: 1e-4 graus
// de latitude ~ 11m, suficiente para simular sem precisar de projeção real).
function buildEstacas(n: number): EstacaGps[] {
  return Array.from({ length: n }, (_, i) => ({ index: i, latitude: -18.4 + i * 0.0002, longitude: -48.0 }));
}

// Simulador simples de leituras de GPS: segue as estacas em ordem, com jitter
// controlado, incluindo ruído pra trás (seção 13: "motor GPS→estaca").
function simularLeituraProxima(estaca: EstacaGps, jitterMetros = 0, timestamp = Date.now()): GpsReading {
  const jitterGraus = jitterMetros / 111000;
  return { lat: (estaca.latitude ?? 0) + jitterGraus, lon: estaca.longitude ?? 0, accuracy: 12, timestamp };
}

describe('distanciaMetros / classificarPrecisao', () => {
  it('distância entre o mesmo ponto é ~0', () => {
    expect(distanciaMetros(-18.4, -48.0, -18.4, -48.0)).toBeCloseTo(0, 3);
  });
  it('classifica precisão pelas faixas da seção 5 (boa <10m, moderada 10-30m, baixa >30m)', () => {
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
    // 100km/h por 30s = ~833m percorridos; a 0,02km entre estacas, ~42 estacas
    const janela = calcularJanela(base, 30, 100, 0.02);
    expect(janela.aheadMin).toBeGreaterThan(base.aheadMin);
    expect(janela.behindMin).toBe(base.behindMin);
  });
  it('carro parado (velocidade ~0) não dispara janela maior que a mínima', () => {
    const janela = calcularJanela(base, 10, 0, 0.02);
    expect(janela).toEqual(base);
  });
});

describe('GpsEngine', () => {
  it('sugere a estaca mais próxima dentro da janela quando a leitura é limpa', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 0);
    const sugestao = engine.processReading(simularLeituraProxima(estacas[3]));
    expect(sugestao.estacaSugeridaIndex).toBe(3);
    expect(sugestao.motivo).toBe('melhor-candidato');
  });

  it('critério 9: ruído pra trás de uma leitura isolada não sugere retroceder para estaca já ultrapassada', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 10);
    // avança e confirma estaca 10 legitimamente
    engine.setEstacaAtual(10);
    // uma única leitura ruidosa aponta pra estaca 8 (2 pra trás)
    const ruido = engine.processReading(simularLeituraProxima(estacas[8]));
    expect(ruido.estacaSugeridaIndex).toBeNull();
    expect(ruido.motivo).toBe('retrocesso-aguardando-confirmacao-por-persistencia');
    // a estaca atual continua a mesma até confirmação
    expect(engine.estacaAtualIndex).toBe(10);
  });

  it('retrocesso persistente (2+ leituras seguidas) é sugerido, não descartado para sempre', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 10);
    engine.processReading(simularLeituraProxima(estacas[8]));
    const segunda = engine.processReading(simularLeituraProxima(estacas[8]));
    expect(segunda.estacaSugeridaIndex).toBe(8);
    expect(segunda.motivo).toBe('melhor-candidato');
  });

  it('critério 10: sem leituras (perda de sinal), a estaca atual permanece e a navegação manual continua', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 10);
    // "perda de sinal" = nenhuma leitura chega; nada deve mudar sozinho
    expect(engine.estacaAtualIndex).toBe(10);
    // navegação manual (+20m) continua funcionando independente do GPS
    engine.setEstacaAtual(11);
    expect(engine.estacaAtualIndex).toBe(11);
  });

  it('critério 16: duas estacas candidatas dentro da tolerância do GPS -> escolha determinística por continuidade, nunca aleatória', () => {
    const estacas = buildEstacas(30);
    // leitura exatamente no meio do caminho entre a estaca 14 e a 15 (ambas ficam
    // dentro da margem de indiferença = accuracy do GPS)
    const meio: GpsReading = {
      lat: ((estacas[14].latitude ?? 0) + (estacas[15].latitude ?? 0)) / 2,
      lon: -48.0,
      accuracy: 12,
      timestamp: Date.now(),
    };
    // atual = 14 (mesmo índice do candidato "de trás"): continuidade favorece 14,
    // e não é retrocesso (14 >= 14), então a sugestão sai na hora.
    const engineEm14 = new GpsEngine(estacas, 14);
    const r1 = engineEm14.processReading(meio);
    const engineEm14b = new GpsEngine(estacas, 14);
    const r2 = engineEm14b.processReading(meio);
    expect(r1.estacaSugeridaIndex).toBe(r2.estacaSugeridaIndex);
    expect(r1.estacaSugeridaIndex).toBe(14);

    // atual = 15: continuidade favorece 15 (distância 0) sobre 14 (distância 1,
    // e ainda por cima seria retrocesso) — desempate já evita o candidato de trás.
    const engineEm15 = new GpsEngine(estacas, 15);
    const r3 = engineEm15.processReading(meio);
    expect(r3.estacaSugeridaIndex).toBe(15);
  });

  it('nenhum candidato com coordenada válida na janela -> sem-candidato-na-janela, nunca lança erro', () => {
    const estacas: EstacaGps[] = [{ index: 0, latitude: null, longitude: null }];
    const engine = new GpsEngine(estacas, 0);
    const r = engine.processReading({ lat: -18.4, lon: -48.0, accuracy: 12, timestamp: Date.now() });
    expect(r.estacaSugeridaIndex).toBeNull();
    expect(r.motivo).toBe('sem-candidato-na-janela');
  });

  it('confirmar uma sugestão (ou avanço manual) reseta o debounce de retrocesso', () => {
    const estacas = buildEstacas(30);
    const engine = new GpsEngine(estacas, 10);
    engine.processReading(simularLeituraProxima(estacas[8])); // 1ª leitura de retrocesso
    engine.setEstacaAtual(10); // usuário ignora, confirma que está na 10 mesmo
    const depois = engine.processReading(simularLeituraProxima(estacas[8]));
    // debounce reiniciado: essa é a "1ª" leitura de novo, não a 2ª
    expect(depois.motivo).toBe('retrocesso-aguardando-confirmacao-por-persistencia');
  });
});
