// Motor de posicionamento GPS — seção 2 do prompt de atualização de UX.
//
// "Candidato GPS" e "estaca ativa" são conceitos diferentes. A cada leitura,
// o motor acha a estaca geometricamente mais próxima da posição atual — esse
// é o CANDIDATO, e pode mudar de leitura pra leitura (ruído normal de GPS).
// A ESTACA ATIVA só muda depois que um candidato passa pela cadeia de
// confiança inteira: accuracy aceitável, candidato único com margem,
// progressão compatível com o hodômetro contínuo do projeto, continuidade
// (nunca recua) e estabilidade temporal (histerese). O motor nunca troca a
// estaca ativa sozinho por baixo desses critérios, e a UI nunca tem um
// caminho de definição manual — baixa confiança é só diagnóstico.
//
// Isolado da UI e 100% offline: só usa lat/long e hodômetro contínuo já
// persistidos localmente na importação, nunca depende de rede.

export interface GpsReading {
  lat: number;
  lon: number;
  accuracy: number; // metros
  timestamp: number; // epoch ms
}

export interface EstacaGps {
  index: number; // posição na sequência 1D (ordem de hodômetro, não o `id` de domínio)
  latitude: number | null;
  longitude: number | null;
  hodometroContinuo: number; // referência de progressão — nunca lat/long bruto
}

export type PrecisaoGps = 'boa' | 'moderada' | 'baixa';
export type ConfiancaAssociacao = 'alta' | 'baixa';

export interface GpsStatus {
  estacaAtivaIndex: number; // só muda com a cadeia de confiança inteira passando
  candidatoIndex: number | null; // estaca geometricamente mais próxima nesta leitura, pode oscilar
  distanciaCandidatoMetros: number | null;
  precisaoGps: PrecisaoGps;
  accuracy: number;
  confianca: ConfiancaAssociacao;
  diagnostico: string | null; // motivo textual só quando confiança é baixa — nunca uma ação
}

export interface JanelaConfig {
  behindMin: number; // usada só pra detectar/diagnosticar candidato atrás, nunca pra avançar
  aheadMin: number;
}

const JANELA_PADRAO: JanelaConfig = { behindMin: 5, aheadMin: 15 };

// "dentro da faixa aceitável" (item 1 da cadeia) reaproveita o próprio limite
// de classificarPrecisao: boa/moderada (<=30m) passam, baixa (>30m) não.
const ACCURACY_ACEITAVEL_MAX_M = 30;

// Histerese: nº mínimo de leituras consecutivas apontando pro mesmo candidato,
// todas já tendo passado accuracy+margem+continuidade, antes de comitar a
// mudança de estaca ativa. 2 é o mínimo pra não comitar numa leitura isolada.
const MIN_LEITURAS_ESTAVEIS = 2;

// Janela de estabilidade temporal: "2-3 segundos" do prompt é só ponto de
// partida pra calibrar, não regra fixa — aqui ela encolhe quando a
// velocidade é alta e o espaçamento entre estacas é pequeno, pra não deixar
// o carro passar de estacas inteiras dentro da própria janela de histerese
// (limite: no máximo metade do intervalo médio entre estacas percorrido
// durante a janela). Precisa de calibração em campo real (ver relatório).
const ESTABILIDADE_MS_BASE = 2000;
const ESTABILIDADE_MS_MIN = 500;
const ESTABILIDADE_MS_MAX = 3000;

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

/** Janela mínima fixa, escalada pela distância plausível percorrida (tempo × velocidade). */
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

/**
 * Janela de estabilidade temporal (histerese) reagindo à velocidade e ao
 * espaçamento entre estacas — ponto de partida a calibrar em campo real,
 * não uma constante universal (ver comentário de ESTABILIDADE_MS_BASE).
 */
export function calcularJanelaEstabilidadeMs(velocidadeEstimadaKmh: number | undefined, intervaloMedioEstacasKm: number | undefined): number {
  if (!velocidadeEstimadaKmh || velocidadeEstimadaKmh <= 0 || !intervaloMedioEstacasKm || intervaloMedioEstacasKm <= 0) {
    return ESTABILIDADE_MS_BASE;
  }
  const metrosPorSegundo = (velocidadeEstimadaKmh * 1000) / 3600;
  const metadeIntervaloM = (intervaloMedioEstacasKm * 1000) / 2;
  const tempoParaMetadeIntervaloMs = (metadeIntervaloM / metrosPorSegundo) * 1000;
  return Math.min(ESTABILIDADE_MS_MAX, Math.max(ESTABILIDADE_MS_MIN, tempoParaMetadeIntervaloMs));
}

interface Candidato {
  index: number;
  hodometroContinuo: number;
  distancia: number;
}

/**
 * Candidato único "com margem": a diferença entre a distância do 1º e do 2º
 * candidato mais próximo precisa ser maior ou igual à própria accuracy do
 * GPS da leitura — ou seja, maior que o próprio ruído do aparelho. Isso
 * escala sozinho entre 8m/14m (accuracy baixa) e 40m/70m (accuracy alta),
 * em vez de uma razão fixa universal (item 2 da cadeia de confiança).
 */
function candidatoUnicoComMargem(ordenados: Candidato[], accuracy: number): boolean {
  if (ordenados.length < 2) return true;
  return ordenados[1].distancia - ordenados[0].distancia >= accuracy;
}

export class GpsEngine {
  private estacas: EstacaGps[];
  private estacaAtiva: EstacaGps;
  private historico: Array<{ index: number; timestamp: number }> = [];
  private ultimoTimestamp: number | undefined;

  constructor(estacas: EstacaGps[], estacaInicialIndex = 0) {
    this.estacas = estacas;
    this.estacaAtiva = estacas.find((e) => e.index === estacaInicialIndex) ?? estacas[0];
  }

  get estacaAtivaIndex(): number {
    return this.estacaAtiva.index;
  }

  processReading(reading: GpsReading, velocidadeEstimadaKmh?: number, intervaloMedioEstacasKm?: number): GpsStatus {
    const deltaTime = this.ultimoTimestamp ? (reading.timestamp - this.ultimoTimestamp) / 1000 : undefined;
    this.ultimoTimestamp = reading.timestamp;
    const precisao = classificarPrecisao(reading.accuracy);

    const janela = calcularJanela(JANELA_PADRAO, deltaTime, velocidadeEstimadaKmh, intervaloMedioEstacasKm);
    const min = this.estacaAtiva.index - janela.behindMin;
    const max = this.estacaAtiva.index + janela.aheadMin;

    const candidatos: Candidato[] = [];
    for (const e of this.estacas) {
      if (e.index < min || e.index > max) continue;
      if (e.latitude === null || e.longitude === null) continue;
      candidatos.push({ index: e.index, hodometroContinuo: e.hodometroContinuo, distancia: distanciaMetros(reading.lat, reading.lon, e.latitude, e.longitude) });
    }
    candidatos.sort((a, b) => a.distancia - b.distancia);

    if (candidatos.length === 0) {
      this.historico = [];
      return this.montarStatus(null, null, precisao, reading.accuracy, 'baixa', 'Nenhuma estaca do projeto dentro da janela de busca.');
    }

    const candidato = candidatos[0];
    const accuracyOk = reading.accuracy <= ACCURACY_ACEITAVEL_MAX_M;
    const margemOk = candidatoUnicoComMargem(candidatos, reading.accuracy);
    // continuidade: usa o hodômetro contínuo do projeto, nunca lat/long bruto
    // nem a ordem de chegada das leituras — nunca recua a estaca ativa.
    const continuidadeOk = candidato.hodometroContinuo >= this.estacaAtiva.hodometroContinuo;

    if (!accuracyOk || !margemOk || !continuidadeOk) {
      this.historico = [];
      const diagnostico = !accuracyOk
        ? `GPS impreciso (±${reading.accuracy.toFixed(0)}m) — associação não confirmada.`
        : !margemOk
          ? 'Posição quase equidistante entre duas estacas — associação incerta.'
          : 'Candidato atrás da estaca ativa — possível manobra ou ruído, aguardando confirmação à frente.';
      return this.montarStatus(candidato.index, candidato.distancia, precisao, reading.accuracy, 'baixa', diagnostico);
    }

    // cadeia passou nesta leitura: acumula histórico de estabilidade (só
    // leituras recentes e do mesmo candidato contam — qualquer leitura que
    // falhou na cadeia acima já zerou o histórico).
    const janelaEstabilidadeMs = calcularJanelaEstabilidadeMs(velocidadeEstimadaKmh, intervaloMedioEstacasKm);
    this.historico = this.historico.filter((h) => h.index === candidato.index && reading.timestamp - h.timestamp <= janelaEstabilidadeMs);
    this.historico.push({ index: candidato.index, timestamp: reading.timestamp });

    if (candidato.hodometroContinuo > this.estacaAtiva.hodometroContinuo && this.historico.length >= MIN_LEITURAS_ESTAVEIS) {
      this.estacaAtiva = this.estacas.find((e) => e.index === candidato.index)!;
      this.historico = [];
    }

    return this.montarStatus(candidato.index, candidato.distancia, precisao, reading.accuracy, 'alta', null);
  }

  private montarStatus(
    candidatoIndex: number | null,
    distancia: number | null,
    precisao: PrecisaoGps,
    accuracy: number,
    confianca: ConfiancaAssociacao,
    diagnostico: string | null,
  ): GpsStatus {
    return { estacaAtivaIndex: this.estacaAtiva.index, candidatoIndex, distanciaCandidatoMetros: distancia, precisaoGps: precisao, accuracy, confianca, diagnostico };
  }
}
