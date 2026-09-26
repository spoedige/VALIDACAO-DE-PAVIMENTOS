// Fase 0 — inspeção bruta, só para confirmar estrutura antes de escrever o parser real.
import * as XLSX from 'xlsx';
import fs from 'node:fs';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('uso: node inspecionar.mjs <arquivo.xlsx>');
  process.exit(1);
}

const buf = fs.readFileSync(arquivo);
const wb = XLSX.read(buf, { type: 'buffer', cellFormula: true, cellNF: false });
console.log('Abas encontradas:', wb.SheetNames);

const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'unifilar') ?? wb.SheetNames[0];
console.log('Usando aba:', sheetName);
const ws = wb.Sheets[sheetName];
const range = XLSX.utils.decode_range(ws['!ref']);
console.log('Range:', ws['!ref'], range);

function cell(r, c) {
  const addr = XLSX.utils.encode_cell({ r, c });
  return ws[addr];
}

// Linhas 1-indexed no documento -> 0-indexed aqui (linha 6 doc = r=5)
for (const linhaDoc of [6, 7, 8, 11]) {
  const r = linhaDoc - 1;
  const valores = [];
  for (let c = 0; c <= Math.min(range.e.c, 140); c++) {
    const cellObj = cell(r, c);
    if (cellObj && cellObj.v !== undefined && cellObj.v !== '') {
      valores.push(`col${c + 1}(${XLSX.utils.encode_col(c)})=${JSON.stringify(cellObj.v)}`);
    }
  }
  console.log(`\n--- Linha ${linhaDoc} (não vazias) ---`);
  console.log(valores.join(' | '));
}

console.log('\nTotal de linhas no range:', range.e.r + 1);
console.log('Total de colunas no range:', range.e.c + 1, '(última coluna:', XLSX.utils.encode_col(range.e.c) + ')');
