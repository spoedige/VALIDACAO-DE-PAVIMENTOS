import * as XLSX from 'xlsx';
import { beforeAll, describe, expect, it } from 'vitest';
import { importExcelFile } from '../excelAdapter';
import type { NormalizationConfig } from '../normalizer';

const config: NormalizationConfig = {
  categorias: {
    Estrutural: { regras: [{ tipo: 'prefixoComEspessura', prefixo: 'RP', subtipoCodigo: 'RPX' }] },
    FresagemFuncional: { regras: [{ tipo: 'numeroPuro', subtipoCodigo: 'FresagemFuncional' }] },
    FresagemEstrutural: { regras: [{ tipo: 'numeroPuro', subtipoCodigo: 'FresagemEstrutural' }] },
    Microfres: { regras: [{ tipo: 'sigla', valor: 'MF', subtipoCodigo: 'MFS' }] },
    Revest: { regras: [{ tipo: 'sigla', valor: 'M', subtipoCodigo: 'M' }] },
  },
};

// Colunas fixas 0-6, faixas de 16 colunas cada (9 parâmetros + 7 soluções) a partir da coluna 7.
const PARAM_HEADERS = ['IRI (m/km)', '% Defeitos', 'ATR Máx', 'O / P / R / D', 'EX / AF / E', 'HR (cm)', 'D0 (0,01 mm)', 'Rc (m)', 'D120 (0,01 mm)'];
const SOL_HEADERS = ['Estrutural', 'Fresagem Funcional', 'Fresagem Estrutural', 'Selagem', 'Microfres.', 'Fresagem Fina', 'Revest.'];
const BLOCO = 16;
const FAIXA1_COL = 7;

function colunasFaixa(faixaIdx: number) {
  return FAIXA1_COL + faixaIdx * BLOCO;
}

interface LinhaEstaca {
  hodometroContinuo: number;
  hodometroMarco: string;
  latitude?: number | string;
  longitude?: number | string;
  dreno?: string;
  faixas: Record<number, { params?: Record<string, number>; solucoes?: Record<string, string | number> }>;
}

function buildSheet(numFaixas: number, linhas: LinhaEstaca[], opts?: { local?: string }) {
  const totalCols = colunasFaixa(numFaixas) + 2;
  const aoa: unknown[][] = Array.from({ length: 10 + linhas.length }, () => Array(totalCols).fill(''));

  if (opts?.local) {
    aoa[4][0] = 'Local';
    aoa[4][7] = opts.local;
  }

  for (let f = 0; f < numFaixas; f++) {
    aoa[5][colunasFaixa(f)] = `Faixa ${f + 1}`;
  }
  aoa[5][colunasFaixa(numFaixas)] = 'Dreno';

  for (let f = 0; f < numFaixas; f++) {
    PARAM_HEADERS.forEach((h, i) => (aoa[7][colunasFaixa(f) + i] = h));
    SOL_HEADERS.forEach((h, i) => (aoa[7][colunasFaixa(f) + PARAM_HEADERS.length + i] = h));
  }
  aoa[7][0] = 'Hodômetro contínuo';
  aoa[7][1] = 'Hodômetro (Amarrado no Marco)';
  aoa[7][2] = 'Latitude';
  aoa[7][3] = 'Longitude';

  linhas.forEach((linha, i) => {
    const r = 10 + i;
    aoa[r][0] = linha.hodometroContinuo;
    aoa[r][1] = linha.hodometroMarco;
    if (linha.latitude !== undefined) aoa[r][2] = linha.latitude;
    if (linha.longitude !== undefined) aoa[r][3] = linha.longitude;
    if (linha.dreno !== undefined) aoa[r][colunasFaixa(numFaixas)] = linha.dreno;
    for (const [faixaNum, dados] of Object.entries(linha.faixas)) {
      const fIdx = Number(faixaNum) - 1;
      if (dados.params) for (const [key, val] of Object.entries(dados.params)) {
        const paramIdx = PARAM_HEADERS.indexOf(key);
        if (paramIdx !== -1) aoa[r][colunasFaixa(fIdx) + paramIdx] = val;
      }
      if (dados.solucoes) for (const [key, val] of Object.entries(dados.solucoes)) {
        const solIdx = SOL_HEADERS.indexOf(key);
        if (solIdx !== -1) aoa[r][colunasFaixa(fIdx) + PARAM_HEADERS.length + solIdx] = val;
      }
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Unifilar');
  return { wb, ws };
}

function wbToArrayBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('crypto.subtle indisponível no ambiente de teste');
  }
});

describe('importExcelFile', () => {
  it('critério 1: com 2 faixas preenchidas, a Faixa 3 nunca aparece (mesmo se estivesse no cabeçalho)', async () => {
    const linhas: LinhaEstaca[] = [
      { hodometroContinuo: 0, hodometroMarco: '0+0', latitude: -18.4, longitude: -48.0, faixas: { 1: { params: { 'IRI (m/km)': 2.1 } }, 2: { params: { 'IRI (m/km)': 1.9 } } } },
      { hodometroContinuo: 0.02, hodometroMarco: '0+20', latitude: -18.401, longitude: -48.001, faixas: { 1: { params: { 'IRI (m/km)': 2.2 } }, 2: { params: { 'IRI (m/km)': 1.8 } } } },
    ];
    // Faixa 3 existe no cabeçalho (numFaixas=3) mas nunca recebe dado -> não deve ser detectada.
    const { wb } = buildSheet(3, linhas);
    const result = await importExcelFile(wbToArrayBuffer(wb), 'teste.xlsx', config);
    expect(result.canProceed).toBe(true);
    expect(result.summary.faixasDetectadas).toEqual([1, 2]);
    expect(result.estacas[0].faixas.map((f) => f.numero)).toEqual([1, 2]);
  });

  it('critério 3: solução dupla na mesma faixa (Fresagem Estrutural + Microfres.) aparece simultaneamente', async () => {
    const linhas: LinhaEstaca[] = [
      { hodometroContinuo: 0, hodometroMarco: '0+0', latitude: -18.4, longitude: -48.0, faixas: { 1: { solucoes: { 'Fresagem Estrutural': 1, 'Microfres.': 'MF' } } } },
    ];
    const { wb } = buildSheet(1, linhas);
    const result = await importExcelFile(wbToArrayBuffer(wb), 'teste.xlsx', config);
    const solucoes = result.estacas[0].faixas[0].solucoesOriginais;
    expect(solucoes).toHaveLength(2);
    expect(solucoes.map((s) => s.categoriaPai).sort()).toEqual(['FresagemEstrutural', 'Microfres']);
  });

  it('critério 4: "RP7,0" é normalizado (RPX, espessura 7) e preservado', async () => {
    const linhas: LinhaEstaca[] = [
      { hodometroContinuo: 0, hodometroMarco: '0+0', latitude: -18.4, longitude: -48.0, faixas: { 1: { solucoes: { Estrutural: 'RP7,0' } } } },
    ];
    const { wb } = buildSheet(1, linhas);
    const result = await importExcelFile(wbToArrayBuffer(wb), 'teste.xlsx', config);
    const sol = result.estacas[0].faixas[0].solucoesOriginais[0];
    expect(sol.subtipoCodigo).toBe('RPX');
    expect(sol.valorComplementar).toBe(7);
    expect(sol.valorBruto).toBe('RP7,0');
    expect(sol.normalizationStatus).toBe('recognized');
  });

  it('critério 5: Revest. "3" sem sigla definida fica unresolved e gera aviso, nunca some silenciosamente', async () => {
    const linhas: LinhaEstaca[] = [
      { hodometroContinuo: 0, hodometroMarco: '0+0', latitude: -18.4, longitude: -48.0, faixas: { 1: { solucoes: { 'Revest.': 3 } } } },
    ];
    const { wb } = buildSheet(1, linhas);
    const result = await importExcelFile(wbToArrayBuffer(wb), 'teste.xlsx', config);
    const sol = result.estacas[0].faixas[0].solucoesOriginais[0];
    expect(sol.normalizationStatus).toBe('unresolved');
    expect(sol.subtipoCodigo).toBe('UNKNOWN');
    expect(sol.valorBruto).toBe(3);
    expect(result.issues.some((i) => i.code === 'solucao-nao-reconhecida')).toBe(true);
  });

  it('0 numérico em parâmetro não é tratado como célula vazia', async () => {
    const linhas: LinhaEstaca[] = [
      { hodometroContinuo: 0, hodometroMarco: '0+0', latitude: -18.4, longitude: -48.0, faixas: { 1: { params: { '% Defeitos': 0 } } } },
    ];
    const { wb } = buildSheet(1, linhas);
    const result = await importExcelFile(wbToArrayBuffer(wb), 'teste.xlsx', config);
    expect(result.estacas[0].faixas[0].parametros.percDefeitos).toBe(0);
  });

  it('bloqueante: aba "Unifilar" ausente', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'OutraAba');
    const result = await importExcelFile(wbToArrayBuffer(wb), 'teste.xlsx', config);
    expect(result.canProceed).toBe(false);
    expect(result.issues[0].code).toBe('estrutura-nao-reconhecida');
  });

  it('bloqueante: coordenadas ausentes na quase totalidade do projeto', async () => {
    const linhas: LinhaEstaca[] = Array.from({ length: 10 }, (_, i) => ({
      hodometroContinuo: i * 0.02,
      hodometroMarco: `0+${i * 20}`,
      faixas: { 1: { params: { 'IRI (m/km)': 1 } } },
    }));
    const { wb } = buildSheet(1, linhas);
    const result = await importExcelFile(wbToArrayBuffer(wb), 'teste.xlsx', config);
    expect(result.canProceed).toBe(false);
    expect(result.issues.some((i) => i.code === 'coordenadas-invalidas')).toBe(true);
  });

  it('bloqueante: hodômetro claramente inconsistente', async () => {
    const seq = [0, 0.02, 0.04, 0.02, 0, -0.02, 0.06, 0.01, 0.08, 0.1];
    const linhas: LinhaEstaca[] = seq.map((h, i) => ({
      hodometroContinuo: h,
      hodometroMarco: `${i}`,
      latitude: -18.4,
      longitude: -48.0,
      faixas: { 1: { params: { 'IRI (m/km)': 1 } } },
    }));
    const { wb } = buildSheet(1, linhas);
    const result = await importExcelFile(wbToArrayBuffer(wb), 'teste.xlsx', config);
    expect(result.canProceed).toBe(false);
    expect(result.issues.some((i) => i.code === 'hodometro-inconsistente')).toBe(true);
  });

  it('sentido/rodovia/km vêm do texto livre "Local", nunca da ordem numérica do hodômetro', async () => {
    const linhas: LinhaEstaca[] = [
      { hodometroContinuo: 0, hodometroMarco: '0+0', latitude: -18.4, longitude: -48.0, faixas: { 1: { params: { 'IRI (m/km)': 1 } } } },
      { hodometroContinuo: 0.02, hodometroMarco: '0+20', latitude: -18.401, longitude: -48.001, faixas: { 1: { params: { 'IRI (m/km)': 1 } } } },
    ];
    const { wb } = buildSheet(1, linhas, { local: 'BR-050/MG - Decrescente - km 0,000 ao km 180,000' });
    const result = await importExcelFile(wbToArrayBuffer(wb), 'teste.xlsx', config);
    expect(result.summary.sentido).toBe('Decrescente');
    expect(result.summary.rodovia).toBe('BR-050/MG');
    expect(result.summary.kmFinal).toBe(180);
  });

  it('sourceFileHash é estável para o mesmo conteúdo de arquivo', async () => {
    const linhas: LinhaEstaca[] = [{ hodometroContinuo: 0, hodometroMarco: '0+0', latitude: -18.4, longitude: -48.0, faixas: { 1: { params: { 'IRI (m/km)': 1 } } } }];
    const { wb } = buildSheet(1, linhas);
    const buf1 = wbToArrayBuffer(wb);
    const buf2 = wbToArrayBuffer(wb);
    const r1 = await importExcelFile(buf1, 'a.xlsx', config);
    const r2 = await importExcelFile(buf2, 'a.xlsx', config);
    expect(r1.projeto.sourceFileHash).toBe(r2.projeto.sourceFileHash);
    expect(r1.projeto.sourceFileHash).toHaveLength(64);
  });
});
