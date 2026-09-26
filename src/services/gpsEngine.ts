// Motor de posicionamento GPS — seção 5 do documento. Isolado da UI: recebe
// leituras de GPS e a lista de estacas (1D, ordenadas pelo hodômetro), devolve
// uma SUGESTÃO. Nunca substitui a estaca atual sozinho — "confirmação, não
// substituição automática silenciosa" é responsabilidade de quem consome o
// motor (a tela), que só efetiva a troca quando o usuário confirmar ou usar
// os controles manuais.
//
// Não faz projeção geométrica em polyline nem cálculo de rumo: a rota já é
// uma sequência 1D conhecida pelo hodômetro (seção 5), então o problema é
// achar, dentro de uma janela ao redor da última estaca confirmada, qual
// estaca tem a coordenada mais próxima da leitura do GPS.

export interface GpsReading {
  lat: number;
  lon: number;
  accuracy: number; // metros
  timestamp: number; // epoch ms
}

export interface EstacaGps {
  index: number; // posição na sequência 1D (não é o `id` de domínio, é a ordem)
  latitude: number | null;
  longitude: number | null;
}

export type PrecisaoGps = 'boa' | 'moderada' | 'baixa';

export interface GpsSuggestion {
  estacaSugeridaIndex: number | null; // null = nenhum candidato confiável dentro da janela
  distanciaMetros: number | null; // distância entre a leitura e a estaca sugerida
  precisao: PrecisaoGps;
  motivo: 'melhor-candidato' | 'sem-candidato-na-janela' | 'retrocesso-aguardando-confirmacao-por-persistencia';
}

export interface JanelaConfig {
  behindMin: number; // seção 5: janela mínima fixa (ex: -5/+15 estacas)
  aheadMin: number;
}

const JANELA_PADRAO: JanelaConfig = { behindMin: 5, aheadMin: 15 };
// nº de leituras consecutivas apontando pra trás antes de sugerir retrocesso —
// implementa "nunca retroceder automaticamente... por causa de uma única
// leitura isolada" (seção 5, regra de desempate item 4). Limiar não é dado
// pelo documento; 2 é a interpretação conservadora mínima ("mais de uma
// leitura"), sinalizada no checklist para confirmação do usuário.
const LEITURAS_CONSECUTIVAS_PARA_RETROCEDER = 2;

const RAIO_TERRA_M = 6371000;

export function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.sqrt(a));
}

export function classificarPrecisao(accuracy: number): PrecisaoGps {
  if (accuracy < 10) return 'boa';
  if (accuracy <= 30) return 'moderada';
  return 'baixa';
}

/** Janela mínima fixa, escalada pela distância plausível percorrida (seção 5). */
export function calcularJanela(
  config: JanelaConfig,
  deltaTimeSegundos: number | undefined,
  velocidadeEstimadaKmh: number | undefined,
  intervaloMedioEstacasKm: number | undefined,
): JanelaConfig {
  if (!deltaTimeSegundos || !velocidadeEstimadaKmh || !intervaloMedioEstacasKm || intervaloMedioEstacasKm <= 0) {
    return config;
  }
  const distanciaPlausivelKm = velocidadeEstimadaKmh * (deltaTimeSegundos / 3600);
  const estacasPlausiveis = Math.ceil(distanciaPlausivelKm / intervaloMedioEstacasKm);
  return { behindMin: config.behindMin, aheadMin: Math.max(config.aheadMin, estacasPlausiveis) };
}

interface Candidato {
  index: number;
  distancia: number;
}

/**
 * Regra de desempate (seção 5): 1) menor distância; 2) em empate/diferença
 * pequena, prioriza continuidade com a estaca atual; 3) sempre respeita o
 * sentido do hodômetro (implícito na janela, que já é direcional);
 * 5) confiança insuficiente -> null (mantém a estaca atual).
 */
function escolherMelhorCandidato(candidatos: Candidato[], estacaAtualIndex: number, accuracy: number): Candidato | null {
  if (candidatos.length === 0) return null;
  const ordenados = [...candidatos].sort((a, b) => a.distancia - b.distancia);
  const melhor = ordenados[0];
  // "empate ou diferença pequena": usamos a precisão do GPS como margem de
  // indiferença — dentro do próprio erro do aparelho, distâncias não são
  // realmente distinguíveis.
  const margem = Math.max(accuracy, 1);
  const proximos = ordenados.filter((c) => c.distancia - melhor.distancia <= margem);
  if (proximos.length === 1) return melhor;
  proximos.sort((a, b) => Math.abs(a.index - estacaAtualIndex) - Math.abs(b.index - estacaAtualIndex));
  return proximos[0];
}

export class GpsEngine {
  private estacas: EstacaGps[];
  private janelaConfig: JanelaConfig;
  private atualIndex: number;
  private ultimoTimestamp: number | undefined;
  private retrocessoCandidatoIndex: number | null = null;
  private retrocessoContagem = 0;

  constructor(estacas: EstacaGps[], estacaInicialIndex = 0, janelaConfig: JanelaConfig = JANELA_PADRAO) {
    this.estacas = estacas;
    this.janelaConfig = janelaConfig;
    this.atualIndex = estacaInicialIndex;
  }

  get estacaAtualIndex(): number {
    return this.atualIndex;
  }

  /** Confirmação do usuário ("Ir para [estaca]") ou controle manual (+20m/-20m). */
  setEstacaAtual(index: number): void {
    this.atualIndex = index;
    this.retrocessoCandidatoIndex = null;
    this.retrocessoContagem = 0;
  }

  /** Botão "usar GPS novamente" — só reseta o debounce de retrocesso, a estaca atual não muda. */
  voltarAoModoAutomatico(): void {
    this.retrocessoCandidatoIndex = null;
    this.retrocessoContagem = 0;
  }

  processReading(reading: GpsReading, velocidadeEstimadaKmh?: number, intervaloMedioEstacasKm?: number): GpsSuggestion {
    const deltaTime = this.ultimoTimestamp ? (reading.timestamp - this.ultimoTimestamp) / 1000 : undefined;
    this.ultimoTimestamp = reading.timestamp;
    const precisao = classificarPrecisao(reading.accuracy);

    const janela = calcularJanela(this.janelaConfig, deltaTime, velocidadeEstimadaKmh, intervaloMedioEstacasKm);
    const min = this.atualIndex - janela.behindMin;
    const max = this.atualIndex + janela.aheadMin;

    const candidatos: Candidato[] = [];
    for (const e of this.estacas) {
      if (e.index < min || e.index > max) continue;
      if (e.latitude === null || e.longitude === null) continue;
      candidatos.push({ index: e.index, distancia: distanciaMetros(reading.lat, reading.lon, e.latitude, e.longitude) });
    }

    const melhor = escolherMelhorCandidato(candidatos, this.atualIndex, reading.accuracy);
    if (!melhor) {
      return { estacaSugeridaIndex: null, distanciaMetros: null, precisao, motivo: 'sem-candidato-na-janela' };
    }

    if (melhor.index < this.atualIndex) {
      if (this.retrocessoCandidatoIndex === melhor.index) {
        this.retrocessoContagem++;
      } else {
        this.retrocessoCandidatoIndex = melhor.index;
        this.retrocessoContagem = 1;
      }
      if (this.retrocessoContagem < LEITURAS_CONSECUTIVAS_PARA_RETROCEDER) {
        return { estacaSugeridaIndex: null, distanciaMetros: melhor.distancia, precisao, motivo: 'retrocesso-aguardando-confirmacao-por-persistencia' };
      }
    } else {
      this.retrocessoCandidatoIndex = null;
      this.retrocessoContagem = 0;
    }

    return { estacaSugeridaIndex: melhor.index, distanciaMetros: melhor.distancia, precisao, motivo: 'melhor-candidato' };
  }
}
