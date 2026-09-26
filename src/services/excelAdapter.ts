import * as XLSX from 'xlsx';
import type {
  CategoriaPai,
  DrenoStatus,
  Estaca,
  FaixaEstaca,
  ImportResult,
  ImportSummary,
  ParametrosFaixa,
  Projeto,
  ValidationIssue,
} from '../types/domain';
import { normalizeSolution, type NormalizationConfig } from './normalizer';
import { sha256Hex } from './hash';

// Camada "Excel Adapter": única parte do app que conhece o layout da planilha.
// Uma futura mudança de layout só deve exigir ajustar este arquivo (seção 12).
// Nunca confia em número fixo de linha/coluna: detecta tudo por texto de
// cabeçalho, dentro das primeiras 15 linhas. Se a estrutura não for
// reconhecida, sinaliza erro bloqueante em vez de importar dado errado.

const PARAM_HEADERS: Array<{ header: string; key: keyof ParametrosFaixa }> = [
  { header: 'IRI (m/km)', key: 'iri' },
  { header: '% Defeitos', key: 'percDefeitos' },
  { header: 'ATR Máx', key: 'atrMax' },
  { header: 'O / P / R / D', key: 'oprd' },
  { header: 'EX / AF / E', key: 'exafe' },
  { header: 'HR (cm)', key: 'hr' },
  { header: 'D0 (0,01 mm)', key: 'd0' },
  { header: 'Rc (m)', key: 'rc' },
  { header: 'D120 (0,01 mm)', key: 'd120' },
];

const SOLUTION_HEADERS: Array<{ header: string; key: CategoriaPai }> = [
  { header: 'Estrutural', key: 'Estrutural' },
  { header: 'Fresagem Funcional', key: 'FresagemFuncional' },
  { header: 'Fresagem Estrutural', key: 'FresagemEstrutural' },
  { header: 'Selagem', key: 'Selagem' },
  { header: 'Microfres.', key: 'Microfres' },
  { header: 'Fresagem Fina', key: 'FresagemFina' },
  { header: 'Revest.', key: 'Revest' },
];

const FIXED_HEADERS = {
  hodometroContinuo: 'Hodômetro contínuo',
  hodometroMarco: 'Hodômetro (Amarrado no Marco)',
  latitude: 'Latitude',
  longitude: 'Longitude',
  tipoSecao: 'Tipo de Seção',
  marcoKm: 'Marco km',
  observacao: 'Observação',
} as const;

const MAX_HEADER_SCAN_ROWS = 15;
// "Quase totalidade" (seção 3) e "claramente inconsistente" não têm limiar numérico
// definido no documento — limiares abaixo são uma interpretação explícita, sinalizada
// no checklist final para confirmação do usuário, não uma regra de engenharia inventada.
const COORDENADAS_INVALIDAS_BLOQUEIA_RATIO = 0.9;
const HODOMETRO_INCONSISTENCIA_BLOQUEIA_RATIO = 0.1;
const INTERVALO_IRREGULAR_RATIO = 3;

function norm(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function isVazio(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function cellAt(ws: XLSX.WorkSheet, r: number, c: number) {
  return ws[XLSX.utils.encode_cell({ r, c })];
}

function parseNumeroBr(texto: string): number | null {
  const n = Number(texto.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function bloqueante(code: string, message: string, details?: Record<string, unknown>): ValidationIssue {
  return { severity: 'bloqueante', code, message, details };
}
function aviso(code: string, message: string, details?: Record<string, unknown>): ValidationIssue {
  return { severity: 'aviso', code, message, details };
}

function emptyResult(fileName: string, hash: string, issues: ValidationIssue[]): ImportResult {
  const projeto: Projeto = {
    projectId: crypto.randomUUID(),
    sourceFileHash: hash,
    sourceFileName: fileName,
    nomeProjeto: fileName.replace(/\.xlsx$/i, ''),
    metadata: { rodovia: null, sentido: null, kmInicial: null, kmFinal: null, localBruto: null, dataImport: new Date().toISOString() },
  };
  const summary: ImportSummary = { rodovia: null, sentido: null, kmInicial: null, kmFinal: null, totalEstacas: 0, faixasDetectadas: [], intervaloMedioEstacas: null };
  return { projeto, estacas: [], summary, issues, canProceed: false };
}

export async function importExcelFile(arrayBuffer: ArrayBuffer, fileName: string, config: NormalizationConfig): Promise<ImportResult> {
  const sourceFileHash = await sha256Hex(arrayBuffer);
  const issues: ValidationIssue[] = [];

  let wb: XLSX.WorkBook;
  try {
    // Uint8Array explícito (em vez de passar o ArrayBuffer cru): a detecção automática
    // de tipo do SheetJS depende de `instanceof ArrayBuffer`, que falha entre realms
    // diferentes (ex: um ArrayBuffer criado em outro worker/contexto) e faz o parser
    // cair silenciosamente num fallback errado sem lançar exceção.
    wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellFormula: true });
  } catch {
    issues.push(bloqueante('estrutura-nao-reconhecida', 'O arquivo não pôde ser lido como planilha Excel.'));
    return emptyResult(fileName, sourceFileHash, issues);
  }

  const sheetName = wb.SheetNames.find((n) => norm(n).toLowerCase() === 'unifilar');
  if (!sheetName) {
    issues.push(bloqueante('estrutura-nao-reconhecida', 'Aba "Unifilar" não encontrada no arquivo.'));
    return emptyResult(fileName, sourceFileHash, issues);
  }
  const ws = wb.Sheets[sheetName];
  if (!ws['!ref']) {
    issues.push(bloqueante('estrutura-nao-reconhecida', 'Aba "Unifilar" está vazia.'));
    return emptyResult(fileName, sourceFileHash, issues);
  }
  const range = XLSX.utils.decode_range(ws['!ref']);

  let linhaFaixas = -1;
  let linhaNomesColuna = -1;
  for (let r = 0; r < Math.min(MAX_HEADER_SCAN_ROWS, range.e.r + 1); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const v = norm(cellAt(ws, r, c)?.v);
      if (v === 'Faixa 1' && linhaFaixas === -1) linhaFaixas = r;
      if (v === 'IRI (m/km)' && linhaNomesColuna === -1) linhaNomesColuna = r;
    }
  }
  if (linhaFaixas === -1 || linhaNomesColuna === -1) {
    issues.push(bloqueante('estrutura-nao-reconhecida', 'Cabeçalho esperado ("Faixa 1", "IRI (m/km)" etc.) não encontrado nas primeiras 15 linhas.'));
    return emptyResult(fileName, sourceFileHash, issues);
  }

  const faixasHeader: Array<{ numero: number; colInicio: number }> = [];
  const outrasSecoes: number[] = [];
  for (let c = 0; c <= range.e.c; c++) {
    const v = norm(cellAt(ws, linhaFaixas, c)?.v);
    if (!v) continue;
    const m = v.match(/^Faixa (\d+)$/);
    if (m) faixasHeader.push({ numero: Number(m[1]), colInicio: c });
    else outrasSecoes.push(c);
  }

  const fronteiras = [...faixasHeader.map((f) => f.colInicio), ...outrasSecoes, range.e.c + 1].sort((a, b) => a - b);

  const fixedCols: Partial<Record<keyof typeof FIXED_HEADERS, number>> = {};
  for (let c = 0; c <= range.e.c; c++) {
    const v = norm(cellAt(ws, linhaNomesColuna, c)?.v);
    for (const [key, header] of Object.entries(FIXED_HEADERS)) {
      if (v === norm(header) && fixedCols[key as keyof typeof FIXED_HEADERS] === undefined) {
        fixedCols[key as keyof typeof FIXED_HEADERS] = c;
      }
    }
  }

  let drenoCol = -1;
  for (let c = 0; c <= range.e.c; c++) {
    if (norm(cellAt(ws, linhaFaixas, c)?.v) === 'Dreno') { drenoCol = c; break; }
  }

  const faixasComColunas = faixasHeader.map((f) => {
    const fim = fronteiras.find((b) => b > f.colInicio) ?? range.e.c + 1;
    const paramCols: Partial<Record<keyof ParametrosFaixa, number>> = {};
    const solCols: Partial<Record<CategoriaPai, number>> = {};
    for (let c = f.colInicio; c < fim; c++) {
      const nome = norm(cellAt(ws, linhaNomesColuna, c)?.v);
      const param = PARAM_HEADERS.find((p) => p.header === nome);
      if (param) paramCols[param.key] = c;
      const sol = SOLUTION_HEADERS.find((s) => s.header === nome);
      if (sol) solCols[sol.key] = c;
    }
    return { numero: f.numero, paramCols, solCols };
  });

  if (fixedCols.hodometroContinuo === undefined || fixedCols.latitude === undefined || fixedCols.longitude === undefined) {
    issues.push(bloqueante('estrutura-nao-reconhecida', 'Colunas fixas obrigatórias (hodômetro, latitude, longitude) não encontradas.'));
    return emptyResult(fileName, sourceFileHash, issues);
  }

  let linhaInicioDados = -1;
  for (let r = linhaNomesColuna + 1; r <= range.e.r; r++) {
    if (typeof cellAt(ws, r, fixedCols.hodometroContinuo)?.v === 'number') { linhaInicioDados = r; break; }
  }
  if (linhaInicioDados === -1) {
    issues.push(bloqueante('nenhuma-estaca', 'Nenhuma linha de dados encontrada abaixo do cabeçalho.'));
    return emptyResult(fileName, sourceFileHash, issues);
  }

  // primeira passada: preenchimento por faixa, para aplicar o "critério de faixa existente" (seção 2)
  const preenchimentoPorFaixa = new Map<number, number>();
  for (let r = linhaInicioDados; r <= range.e.r; r++) {
    if (isVazio(cellAt(ws, r, fixedCols.hodometroContinuo)?.v)) continue;
    for (const f of faixasComColunas) {
      let count = preenchimentoPorFaixa.get(f.numero) ?? 0;
      for (const col of Object.values(f.paramCols)) if (!isVazio(cellAt(ws, r, col)?.v)) count++;
      for (const col of Object.values(f.solCols)) if (!isVazio(cellAt(ws, r, col)?.v)) count++;
      preenchimentoPorFaixa.set(f.numero, count);
    }
  }
  const faixasValidas = faixasComColunas.filter((f) => (preenchimentoPorFaixa.get(f.numero) ?? 0) > 0);

  if (faixasValidas.length === 0) {
    issues.push(bloqueante('nenhuma-faixa', 'Nenhuma faixa com dado real (parâmetro ou solução) foi encontrada.'));
    return emptyResult(fileName, sourceFileHash, issues);
  }

  const estacas: Estaca[] = [];
  let coordenadasInvalidas = 0;
  let formulasNaoAvaliadas = 0;
  let unresolvedCount = 0;
  let id = 0;

  for (let r = linhaInicioDados; r <= range.e.r; r++) {
    const hodCont = cellAt(ws, r, fixedCols.hodometroContinuo)?.v;
    if (isVazio(hodCont) || typeof hodCont !== 'number') continue;

    const lat = cellAt(ws, r, fixedCols.latitude)?.v;
    const lon = cellAt(ws, r, fixedCols.longitude)?.v;
    const latOk = typeof lat === 'number' && lat >= -90 && lat <= 90;
    const lonOk = typeof lon === 'number' && lon >= -180 && lon <= 180;
    if (!latOk || !lonOk) coordenadasInvalidas++;

    const hodMarcoRaw = fixedCols.hodometroMarco !== undefined ? cellAt(ws, r, fixedCols.hodometroMarco)?.v : undefined;
    const drenoRaw = drenoCol !== -1 ? cellAt(ws, r, drenoCol)?.v : undefined;
    let dreno: DrenoStatus = 'ausente';
    if (!isVazio(drenoRaw)) {
      const d = String(drenoRaw).trim().toUpperCase();
      if (d === 'R') dreno = 'raso';
      else if (d === 'P') dreno = 'profundo';
      else issues.push(aviso('dreno-desconhecido', `Código de dreno não reconhecido: "${drenoRaw}"`, { row: r + 1, valor: drenoRaw }));
    }

    const faixas: FaixaEstaca[] = faixasValidas.map((f) => {
      const parametros: ParametrosFaixa = {};
      for (const [key, col] of Object.entries(f.paramCols)) {
        const v = cellAt(ws, r, col)?.v;
        if (!isVazio(v)) (parametros as Record<string, unknown>)[key] = v;
      }
      const solucoesOriginais = [];
      for (const [categoria, col] of Object.entries(f.solCols) as Array<[CategoriaPai, number]>) {
        const cellObj = cellAt(ws, r, col);
        if (cellObj?.f !== undefined && isVazio(cellObj?.v)) {
          formulasNaoAvaliadas++;
          continue;
        }
        const normalized = normalizeSolution(categoria, cellObj?.v as string | number | undefined, config);
        if (normalized) {
          solucoesOriginais.push(normalized);
          if (normalized.normalizationStatus === 'unresolved') unresolvedCount++;
        }
      }
      return { numero: f.numero, parametros, solucoesOriginais };
    });

    estacas.push({
      id: id++,
      numeroEstaca: hodMarcoRaw !== undefined ? String(hodMarcoRaw) : String(hodCont),
      hodometroContinuo: hodCont,
      hodometroMarco: hodMarcoRaw !== undefined ? String(hodMarcoRaw) : '',
      latitude: latOk ? (lat as number) : null,
      longitude: lonOk ? (lon as number) : null,
      tipoSecao: fixedCols.tipoSecao !== undefined && !isVazio(cellAt(ws, r, fixedCols.tipoSecao)?.v) ? String(cellAt(ws, r, fixedCols.tipoSecao)?.v) : null,
      marcoKm: fixedCols.marcoKm !== undefined && !isVazio(cellAt(ws, r, fixedCols.marcoKm)?.v) ? String(cellAt(ws, r, fixedCols.marcoKm)?.v) : null,
      observacaoOriginal: fixedCols.observacao !== undefined && !isVazio(cellAt(ws, r, fixedCols.observacao)?.v) ? String(cellAt(ws, r, fixedCols.observacao)?.v) : null,
      dreno,
      faixas,
    });
  }

  if (estacas.length === 0) {
    issues.push(bloqueante('nenhuma-estaca', 'Nenhuma estaca com hodômetro contínuo válido foi lida.'));
    return emptyResult(fileName, sourceFileHash, issues);
  }

  const coordRatio = coordenadasInvalidas / estacas.length;
  if (coordRatio >= COORDENADAS_INVALIDAS_BLOQUEIA_RATIO) {
    issues.push(bloqueante('coordenadas-invalidas', `${coordenadasInvalidas} de ${estacas.length} estacas sem coordenada válida.`));
  } else if (coordenadasInvalidas > 0) {
    issues.push(aviso('coordenadas-invalidas-parcial', `${coordenadasInvalidas} estaca(s) com coordenada inválida.`));
  }

  const primeiro = estacas[0].hodometroContinuo;
  const ultimo = estacas[estacas.length - 1].hodometroContinuo;
  const sentidoEsperado = ultimo >= primeiro ? 1 : -1;
  let inconsistencias = 0;
  const intervalos: number[] = [];
  for (let i = 1; i < estacas.length; i++) {
    const delta = estacas[i].hodometroContinuo - estacas[i - 1].hodometroContinuo;
    if (delta === 0 || Math.sign(delta) !== sentidoEsperado) inconsistencias++;
    intervalos.push(Math.abs(delta));
  }
  const inconsistenciaRatio = inconsistencias / Math.max(1, estacas.length - 1);
  if (inconsistenciaRatio >= HODOMETRO_INCONSISTENCIA_BLOQUEIA_RATIO) {
    issues.push(bloqueante('hodometro-inconsistente', `Hodômetro não é continuamente ${sentidoEsperado === 1 ? 'crescente' : 'decrescente'} (${inconsistencias} inversões).`));
  } else if (inconsistencias > 0) {
    issues.push(aviso('hodometro-irregular', `${inconsistencias} inversão(ões) pontual(is) no hodômetro.`));
  }

  const intervaloMedio = intervalos.length ? intervalos.reduce((a, b) => a + b, 0) / intervalos.length : null;
  const intervaloMediano = intervalos.length ? [...intervalos].sort((a, b) => a - b)[Math.floor(intervalos.length / 2)] : null;
  if (intervaloMediano && intervalos.some((i) => i > intervaloMediano * INTERVALO_IRREGULAR_RATIO)) {
    issues.push(aviso('intervalo-irregular', 'Intervalo entre estacas irregular em parte do projeto.'));
  }

  if (formulasNaoAvaliadas > 0) {
    issues.push(aviso('formula-nao-avaliada', `${formulasNaoAvaliadas} célula(s) com fórmula sem valor calculado disponível.`));
  }
  if (unresolvedCount > 0) {
    issues.push(aviso('solucao-nao-reconhecida', `${unresolvedCount} valor(es) de solução não reconhecido(s) (marcados UNKNOWN).`));
  }

  // metadata da célula "Local" — única fonte de "sentido"; nunca inferir do hodômetro (ver Fase 0)
  let localBruto: string | null = null;
  let rodovia: string | null = null;
  let sentido: 'Crescente' | 'Decrescente' | null = null;
  let kmInicial: number | null = null;
  let kmFinal: number | null = null;
  outer: for (let r = 0; r < linhaFaixas; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      if (norm(cellAt(ws, r, c)?.v).toLowerCase() === 'local') {
        for (let c2 = c + 1; c2 <= range.e.c; c2++) {
          const v2 = cellAt(ws, r, c2)?.v;
          if (!isVazio(v2)) {
            localBruto = String(v2);
            const m = localBruto.match(/^(.*?)\s*-\s*(Crescente|Decrescente)\s*-\s*km\s*([\d.,]+)\s*ao\s*km\s*([\d.,]+)/i);
            if (m) {
              rodovia = m[1].trim();
              sentido = (m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()) as 'Crescente' | 'Decrescente';
              kmInicial = parseNumeroBr(m[3]);
              kmFinal = parseNumeroBr(m[4]);
            } else {
              issues.push(aviso('metadata-local-nao-reconhecida', 'Texto de rodovia/sentido/km em formato não reconhecido — confirme manualmente.', { textoOriginal: localBruto }));
            }
            break outer;
          }
        }
      }
    }
  }

  const faixasDetectadas = faixasValidas.map((f) => f.numero).sort((a, b) => a - b);
  const projeto: Projeto = {
    projectId: crypto.randomUUID(),
    sourceFileHash,
    sourceFileName: fileName,
    nomeProjeto: fileName.replace(/\.xlsx$/i, ''),
    metadata: { rodovia, sentido, kmInicial, kmFinal, localBruto, dataImport: new Date().toISOString() },
  };
  const summary: ImportSummary = { rodovia, sentido, kmInicial, kmFinal, totalEstacas: estacas.length, faixasDetectadas, intervaloMedioEstacas: intervaloMedio };

  const canProceed = !issues.some((i) => i.severity === 'bloqueante');
  return { projeto, estacas, summary, issues, canProceed };
}
