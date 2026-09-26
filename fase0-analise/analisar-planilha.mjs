// Fase 0 — Prova de realidade da planilha.
// Script isolado (não é código de produto): lê a aba "Unifilar" de um .xlsx real,
// detecta a estrutura por texto de cabeçalho (nunca por número fixo de linha/coluna)
// e gera um relatório de evidência sobre o que realmente existe nos dados.
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('uso: node analisar-planilha.mjs <arquivo.xlsx>');
  process.exit(1);
}

function norm(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

const PARAM_HEADERS = ['IRI (m/km)', '% Defeitos', 'ATR Máx', 'O / P / R / D', 'EX / AF / E', 'HR (cm)', 'D0 (0,01 mm)', 'Rc (m)', 'D120 (0,01 mm)'].map(norm);
const SOLUTION_HEADERS = ['Estrutural', 'Fresagem Funcional', 'Fresagem\nEstrutural', 'Selagem', 'Microfres.', 'Fresagem\nFina', 'Revest.'].map(norm);
const SOLUTION_KEYS = ['Estrutural', 'FresagemFuncional', 'FresagemEstrutural', 'Selagem', 'Microfres', 'FresagemFina', 'Revest'];

function isVazio(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function buf2wb(arquivo) {
  const buf = fs.readFileSync(arquivo);
  return XLSX.read(buf, { type: 'buffer', cellFormula: true, cellNF: false });
}

function cellAt(ws, r, c) {
  return ws[XLSX.utils.encode_cell({ r, c })];
}

function main() {
  const wb = buf2wb(arquivo);
  const sheetName = wb.SheetNames.find((n) => norm(n).toLowerCase() === 'unifilar');
  const relatorio = {
    arquivo: path.basename(arquivo),
    abasEncontradas: wb.SheetNames,
    abaUnifilarEncontrada: !!sheetName,
  };

  if (!sheetName) {
    relatorio.erroBloqueante = 'Aba "Unifilar" não encontrada — estrutura não reconhecida.';
    console.log(JSON.stringify(relatorio, null, 2));
    return relatorio;
  }

  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws['!ref']);

  // 1. localizar a linha de cabeçalho procurando "Faixa 1" nas primeiras 15 linhas
  let linhaFaixas = -1;
  let linhaParamSol = -1;
  let linhaNomesColuna = -1;
  for (let r = 0; r < Math.min(15, range.e.r + 1); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const v = norm(cellAt(ws, r, c)?.v);
      if (v === 'Faixa 1' && linhaFaixas === -1) linhaFaixas = r;
      if (v === 'Parâmetros' && linhaParamSol === -1) linhaParamSol = r;
      if (v === 'IRI (m/km)' && linhaNomesColuna === -1) linhaNomesColuna = r;
    }
  }

  relatorio.deteccaoCabecalho = { linhaFaixas: linhaFaixas + 1, linhaParamSol: linhaParamSol + 1, linhaNomesColuna: linhaNomesColuna + 1 };

  if (linhaFaixas === -1 || linhaNomesColuna === -1) {
    relatorio.erroBloqueante = 'Estrutura de cabeçalho não reconhecida (textos esperados não encontrados nas primeiras 15 linhas).';
    console.log(JSON.stringify(relatorio, null, 2));
    return relatorio;
  }

  // 2. detectar todas as faixas presentes na linha de faixas (não hardcoded em 6)
  const faixas = [];
  for (let c = 0; c <= range.e.c; c++) {
    const v = norm(cellAt(ws, linhaFaixas, c)?.v);
    const m = v.match(/^Faixa (\d+)$/);
    if (m) faixas.push({ numero: Number(m[1]), colInicio: c });
  }
  relatorio.faixasNoCabecalho = faixas.map((f) => f.numero);

  // outras seções na mesma linha de faixas, fora do padrão "Faixa N" (achado real, não documentado)
  const outrasSecoes = [];
  for (let c = 0; c <= range.e.c; c++) {
    const v = norm(cellAt(ws, linhaFaixas, c)?.v);
    if (v && !/^Faixa \d+$/.test(v)) outrasSecoes.push({ texto: v, coluna: c + 1, letra: XLSX.utils.encode_col(c) });
  }
  relatorio.secoesNaoDocumentadas = outrasSecoes;

  // 3. para cada faixa, localizar colunas de parâmetro e solução pelo nome do header (linha 8-equivalente)
  // limite direito do bloco: próxima faixa OU próxima seção nomeada (Acost., Dreno etc.) OU fim da planilha
  const fronteiras = [
    ...faixas.map((f) => f.colInicio),
    ...outrasSecoes.map((s) => s.coluna - 1),
    range.e.c + 1,
  ].sort((a, b) => a - b);
  const faixasDetectadas = faixas.map((f) => {
    const fim = fronteiras.find((b) => b > f.colInicio) ?? range.e.c + 1;
    const paramCols = {};
    const solCols = {};
    for (let c = f.colInicio; c < fim; c++) {
      const nome = norm(cellAt(ws, linhaNomesColuna, c)?.v);
      const idxParam = PARAM_HEADERS.indexOf(nome);
      if (idxParam !== -1) paramCols[nome] = c;
      const idxSol = SOLUTION_HEADERS.indexOf(nome);
      if (idxSol !== -1) solCols[SOLUTION_KEYS[idxSol]] = c;
    }
    return { numero: f.numero, colInicio: f.colInicio + 1, paramCols, solCols };
  });
  relatorio.faixasDetectadas = faixasDetectadas.map((f) => ({
    numero: f.numero,
    colunaInicio: f.colInicio,
    parametros: Object.fromEntries(Object.entries(f.paramCols).map(([k, v]) => [k, v + 1])),
    solucoes: Object.fromEntries(Object.entries(f.solCols).map(([k, v]) => [k, v + 1])),
  }));

  // colunas fixas (hodômetro, lat/long etc.) — localizadas por nome também
  const FIXED_HEADERS = {
    hodometroContinuo: 'Hodômetro contínuo',
    hodometroMarco: 'Hodômetro\n(Amarrado no Marco)',
    latitude: 'Latitude',
    longitude: 'Longitude',
    tipoSecao: 'Tipo de Seção',
    marcoKm: 'Marco km',
    observacao: 'Observação',
  };
  const fixedCols = {};
  for (let c = 0; c <= range.e.c; c++) {
    const v = norm(cellAt(ws, linhaNomesColuna, c)?.v);
    for (const [key, header] of Object.entries(FIXED_HEADERS)) {
      if (v === norm(header) && fixedCols[key] === undefined) fixedCols[key] = c;
    }
  }
  relatorio.colunasFixas = Object.fromEntries(Object.entries(fixedCols).map(([k, v]) => [k, v + 1]));

  // coluna de Dreno — busca pelo texto na linha de faixas
  let drenoCol = -1;
  for (let c = 0; c <= range.e.c; c++) {
    if (norm(cellAt(ws, linhaFaixas, c)?.v) === 'Dreno') { drenoCol = c; break; }
  }
  relatorio.colunaDreno = drenoCol === -1 ? null : drenoCol + 1;

  // "Acost." (acostamento) — seção real encontrada nos dados mas NÃO documentada no
  // prompt original. Não é tratada como faixa nem processada; só medimos preenchimento
  // aqui como evidência para decisão do usuário (ver seção "Fora de escopo" do prompt).
  const acostSecao = outrasSecoes.find((s) => s.texto === 'Acost.');
  let acostColMicro = -1;
  let acostColGap = -1;
  if (acostSecao) {
    const inicio = acostSecao.coluna - 1;
    const fimAcost = fronteiras.find((b) => b > inicio) ?? range.e.c + 1;
    for (let c = inicio; c < fimAcost; c++) {
      const nome = norm(cellAt(ws, linhaNomesColuna, c)?.v);
      if (nome === 'Micro') acostColMicro = c;
      if (nome.startsWith('GAP')) acostColGap = c;
    }
  }

  // 4. início dos dados: primeira linha após o cabeçalho com hodômetro contínuo numérico
  let linhaInicioDados = -1;
  for (let r = linhaNomesColuna + 1; r <= range.e.r; r++) {
    const v = cellAt(ws, r, fixedCols.hodometroContinuo)?.v;
    if (typeof v === 'number') { linhaInicioDados = r; break; }
  }
  relatorio.linhaInicioDados = linhaInicioDados + 1;

  // 5. varrer todas as linhas de dados
  const estacas = [];
  const solucoesBrutas = {}; // categoria -> Map(valorBruto -> count)
  for (const key of SOLUTION_KEYS) solucoesBrutas[key] = new Map();
  const drenoValores = new Map();
  let formulasNaoAvaliadas = 0;
  let coordenadasInvalidas = 0;
  let coordenadasValidas = 0;
  let acostMicroPreenchidas = 0;
  let acostGapPreenchidas = 0;
  let tipoSecaoPreenchidas = 0;

  for (let r = linhaInicioDados; r <= range.e.r; r++) {
    const hodCont = cellAt(ws, r, fixedCols.hodometroContinuo)?.v;
    if (isVazio(hodCont)) continue; // sem hodômetro contínuo, não é linha de estaca
    const lat = cellAt(ws, r, fixedCols.latitude)?.v;
    const lon = cellAt(ws, r, fixedCols.longitude)?.v;
    const latOk = typeof lat === 'number' && lat >= -90 && lat <= 90;
    const lonOk = typeof lon === 'number' && lon >= -180 && lon <= 180;
    if (latOk && lonOk) coordenadasValidas++; else coordenadasInvalidas++;
    if (acostColMicro !== -1 && !isVazio(cellAt(ws, r, acostColMicro)?.v)) acostMicroPreenchidas++;
    if (acostColGap !== -1 && !isVazio(cellAt(ws, r, acostColGap)?.v)) acostGapPreenchidas++;
    if (!isVazio(cellAt(ws, r, fixedCols.tipoSecao)?.v)) tipoSecaoPreenchidas++;

    estacas.push({
      row: r + 1,
      hodometroContinuo: hodCont,
      hodometroMarco: cellAt(ws, r, fixedCols.hodometroMarco)?.v,
      latitude: lat,
      longitude: lon,
    });

    for (const faixa of faixasDetectadas) {
      for (const key of SOLUTION_KEYS) {
        const col = faixa.solCols[key];
        if (col === undefined) continue;
        const cellObj = cellAt(ws, r, col);
        if (!cellObj) continue;
        if (cellObj.f !== undefined && (cellObj.v === undefined || cellObj.v === '')) {
          formulasNaoAvaliadas++;
          continue;
        }
        if (isVazio(cellObj.v)) continue;
        const bruto = cellObj.v;
        const mapa = solucoesBrutas[key];
        const chave = typeof bruto === 'number' ? `NUM:${bruto}` : `STR:${bruto}`;
        mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
      }
    }

    if (drenoCol !== -1) {
      const v = cellAt(ws, r, drenoCol)?.v;
      if (!isVazio(v)) drenoValores.set(String(v), (drenoValores.get(String(v)) ?? 0) + 1);
    }
  }

  relatorio.totalEstacas = estacas.length;
  relatorio.coordenadas = { validas: coordenadasValidas, invalidas: coordenadasInvalidas };
  relatorio.formulasNaoAvaliadas = formulasNaoAvaliadas;
  relatorio.drenoValoresDistintos = Object.fromEntries(drenoValores);
  relatorio.tipoSecaoPreenchidas = tipoSecaoPreenchidas;
  relatorio.acostamentoForaDeEscopo = acostSecao
    ? { colunaMicro: acostColMicro === -1 ? null : acostColMicro + 1, colunaGap: acostColGap === -1 ? null : acostColGap + 1, microPreenchidas: acostMicroPreenchidas, gapPreenchidas: acostGapPreenchidas }
    : null;

  if (estacas.length > 1) {
    const primeiro = estacas[0].hodometroContinuo;
    const ultimo = estacas[estacas.length - 1].hodometroContinuo;
    // "direção numérica" do hodômetro contínuo (sempre local ao arquivo, cresce de 0)
    // NÃO é o "sentido" de negócio da rodovia (Crescente/Decrescente) — esse vem do
    // texto livre em "Local", nunca de comparar hodômetroContinuo[0] com o último.
    relatorio.hodometroContinuo = { primeiro, ultimo, direcaoNumerica: ultimo >= primeiro ? 'ascendente' : 'descendente' };
    let inconsistencias = 0;
    const sentidoEsperado = ultimo >= primeiro ? 1 : -1;
    for (let i = 1; i < estacas.length; i++) {
      const delta = estacas[i].hodometroContinuo - estacas[i - 1].hodometroContinuo;
      if (delta === 0 || Math.sign(delta) !== sentidoEsperado) inconsistencias++;
    }
    relatorio.hodometroInconsistencias = inconsistencias;
    const intervalos = estacas.slice(1).map((e, i) => Math.abs(e.hodometroContinuo - estacas[i].hodometroContinuo));
    relatorio.intervaloMedioEstacas = intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
  }

  relatorio.solucoesPorCategoria = {};
  for (const key of SOLUTION_KEYS) {
    const mapa = solucoesBrutas[key];
    relatorio.solucoesPorCategoria[key] = {
      totalPreenchidas: [...mapa.values()].reduce((a, b) => a + b, 0),
      valoresDistintos: Object.fromEntries([...mapa.entries()].sort((a, b) => b[1] - a[1])),
    };
  }

  // metadata livre (célula "Local") — única fonte real de "sentido" (Crescente/Decrescente)
  // e nome da rodovia; nunca inferir sentido a partir da ordem numérica do hodômetro.
  for (let r = 0; r < linhaFaixas; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const v = norm(cellAt(ws, r, c)?.v);
      if (v.toLowerCase() === 'local') {
        for (let c2 = c + 1; c2 <= range.e.c; c2++) {
          const v2 = cellAt(ws, r, c2)?.v;
          if (!isVazio(v2)) {
            const texto = String(v2);
            relatorio.metadataLocal = texto;
            const m = texto.match(/^(.*?)\s*-\s*(Crescente|Decrescente)\s*-\s*km\s*([\d.,]+)\s*ao\s*km\s*([\d.,]+)/i);
            relatorio.metadataLocalParseada = m
              ? { rodovia: m[1].trim(), sentido: m[2], kmInicial: m[3], kmFinal: m[4] }
              : { erro: 'formato livre não reconhecido pelo padrão esperado — exibir texto bruto e pedir confirmação ao usuário' };
            break;
          }
        }
      }
    }
  }

  console.log(JSON.stringify(relatorio, null, 2));
  return relatorio;
}

const relatorio = main();
const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), 'output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, path.basename(arquivo, '.xlsx') + '.json');
fs.writeFileSync(outFile, JSON.stringify(relatorio, null, 2));
console.error('\nRelatório salvo em: ' + outFile);
