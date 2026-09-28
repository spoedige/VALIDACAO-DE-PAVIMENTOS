// Gera um .xlsx sintético com 6 faixas preenchidas, só pra testar visualmente
// o layout responsivo do Modo Vistoria (critério de aceitação 2). Não é dado real.
import * as XLSX from 'xlsx';
import fs from 'node:fs';

const PARAM_HEADERS = ['IRI (m/km)', '% Defeitos', 'ATR Máx', 'O / P / R / D', 'EX / AF / E', 'HR (cm)', 'D0 (0,01 mm)', 'Rc (m)', 'D120 (0,01 mm)'];
const SOL_HEADERS = ['Estrutural', 'Fresagem Funcional', 'Fresagem\nEstrutural', 'Selagem', 'Microfres.', 'Fresagem\nFina', 'Revest.'];
const BLOCO = 17;
const FAIXA1_COL = 21; // col22 1-indexed

function colunaFaixa(idx) { return FAIXA1_COL + idx * BLOCO; }

const NUM_FAIXAS = 6;
const NUM_ESTACAS = 20;
const totalCols = colunaFaixa(NUM_FAIXAS) + 2;
const aoa = Array.from({ length: 11 + NUM_ESTACAS }, () => Array(totalCols).fill(''));

aoa[4][13] = 'Local';
aoa[4][21] = 'BR-999/TT - Crescente - km 0,000 ao km 10,000';

for (let f = 0; f < NUM_FAIXAS; f++) aoa[5][colunaFaixa(f)] = `Faixa ${f + 1}`;
aoa[5][colunaFaixa(NUM_FAIXAS)] = 'Dreno';

for (let f = 0; f < NUM_FAIXAS; f++) {
  PARAM_HEADERS.forEach((h, i) => (aoa[7][colunaFaixa(f) + i] = h));
  SOL_HEADERS.forEach((h, i) => (aoa[7][colunaFaixa(f) + PARAM_HEADERS.length + i] = h));
}
aoa[7][13] = 'Hodômetro contínuo';
aoa[7][14] = 'Hodômetro (Amarrado no Marco)';
aoa[7][15] = 'Latitude';
aoa[7][16] = 'Longitude';

const codigos = ['RP7,0', 1, 1, 'ST', 'MF', 'FF', 'M'];
for (let i = 0; i < NUM_ESTACAS; i++) {
  const r = 10 + i;
  aoa[r][13] = i * 0.02;
  aoa[r][14] = `0+${i * 20}`;
  aoa[r][15] = -18.4 + i * 0.0002;
  aoa[r][16] = -48.0;
  for (let f = 0; f < NUM_FAIXAS; f++) {
    aoa[r][colunaFaixa(f)] = 2 + f * 0.1; // IRI
    aoa[r][colunaFaixa(f) + PARAM_HEADERS.length + (f % 7)] = codigos[f % codigos.length];
  }
}

const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Unifilar');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync('/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/fixtures/sintetico-6faixas.xlsx', buf);
console.log('gerado');
