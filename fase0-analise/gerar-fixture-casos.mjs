// Fixture sintético cobrindo vários casos obrigatórios da seção 13 num arquivo
// só: Faixa 1 com segmento muito curto (1 estaca) e muito longo; Faixa 2 com
// soluções simultâneas; Faixa 3 sem solução nenhuma (ausência); Faixa 4 normal.
import * as XLSX from 'xlsx';
import fs from 'node:fs';

const PARAM_HEADERS = ['IRI (m/km)', '% Defeitos', 'ATR Máx', 'O / P / R / D', 'EX / AF / E', 'HR (cm)', 'D0 (0,01 mm)', 'Rc (m)', 'D120 (0,01 mm)'];
const SOL_HEADERS = ['Estrutural', 'Fresagem Funcional', 'Fresagem\nEstrutural', 'Selagem', 'Microfres.', 'Fresagem\nFina', 'Revest.'];
const BLOCO = 17;
const FAIXA1_COL = 21;
function colunaFaixa(idx) { return FAIXA1_COL + idx * BLOCO; }

function gerar(nomeArquivo, numFaixas, numEstacas, preencher) {
  const totalCols = colunaFaixa(numFaixas) + 2;
  const aoa = Array.from({ length: 11 + numEstacas }, () => Array(totalCols).fill(''));
  aoa[4][13] = 'Local';
  aoa[4][21] = 'BR-999/TT - Crescente - km 0,000 ao km 10,000';
  for (let f = 0; f < numFaixas; f++) aoa[5][colunaFaixa(f)] = `Faixa ${f + 1}`;
  aoa[5][colunaFaixa(numFaixas)] = 'Dreno';
  for (let f = 0; f < numFaixas; f++) {
    PARAM_HEADERS.forEach((h, i) => (aoa[7][colunaFaixa(f) + i] = h));
    SOL_HEADERS.forEach((h, i) => (aoa[7][colunaFaixa(f) + PARAM_HEADERS.length + i] = h));
  }
  aoa[7][13] = 'Hodômetro contínuo';
  aoa[7][14] = 'Hodômetro (Amarrado no Marco)';
  aoa[7][15] = 'Latitude';
  aoa[7][16] = 'Longitude';

  for (let i = 0; i < numEstacas; i++) {
    const r = 10 + i;
    aoa[r][13] = i * 0.02;
    aoa[r][14] = `0+${i * 20}`;
    aoa[r][15] = -18.4 + i * 0.0002;
    aoa[r][16] = -48.0;
    for (let f = 0; f < numFaixas; f++) aoa[r][colunaFaixa(f)] = 2; // IRI sempre presente
    preencher(aoa, r, i, colunaFaixa, PARAM_HEADERS.length);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Unifilar');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(`/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/fixtures/${nomeArquivo}`, buf);
  console.log('gerado', nomeArquivo);
}

// 4 faixas, casos de segmento
gerar('casos-4faixas.xlsx', 4, 40, (aoa, r, i, colunaFaixa, offsetSol) => {
  // Faixa 1 (idx0): longo trecho "RP7,0" (Estrutural), 1 estaca isolada "RP4,0" no meio, depois longo de novo
  const estruturalCol = colunaFaixa(0) + offsetSol + 0;
  aoa[r][estruturalCol] = i === 20 ? 'RP4,0' : 'RP7,0';

  // Faixa 2 (idx1): soluções simultâneas (Fresagem Estrutural + Selagem) o tempo todo
  aoa[r][colunaFaixa(1) + offsetSol + 2] = 1; // Fresagem Estrutural
  aoa[r][colunaFaixa(1) + offsetSol + 3] = 'ST'; // Selagem

  // Faixa 3 (idx2): nunca preenche solução (ausência) — só parâmetro
  // (nada a fazer, já fica vazio)

  // Faixa 4 (idx3): Revest. alternando M / 3 (unresolved) a cada 10 estacas
  aoa[r][colunaFaixa(3) + offsetSol + 6] = Math.floor(i / 10) % 2 === 0 ? 'M' : 3;
});

// 5 faixas, uso geral
gerar('casos-5faixas.xlsx', 5, 30, (aoa, r, i, colunaFaixa, offsetSol) => {
  const codigos = ['RP7,0', 1, 1, 'ST', 'MF'];
  for (let f = 0; f < 5; f++) {
    if (f === 0) aoa[r][colunaFaixa(f) + offsetSol + 0] = codigos[0];
    else if (f === 1 || f === 2) aoa[r][colunaFaixa(f) + offsetSol + (f === 1 ? 1 : 2)] = 1;
    else if (f === 3) aoa[r][colunaFaixa(f) + offsetSol + 3] = 'ST';
    else aoa[r][colunaFaixa(f) + offsetSol + 4] = 'MF';
  }
});
