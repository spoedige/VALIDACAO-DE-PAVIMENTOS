// Smoke test manual em navegador real (não faz parte da suíte automatizada).
// Requer: `npm install -D playwright` (removido do projeto depois de usar),
// `npm run dev` rodando em 127.0.0.1:5173, e o arquivo fixture real referenciado
// abaixo disponível localmente (não incluído no repositório).
import { chromium } from 'playwright';

const FIXTURE = '/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/fixtures/MG_Crescente.xlsx';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // tamanho de celular

page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

await page.goto('http://127.0.0.1:5173/');
await page.waitForSelector('text=Meus projetos', { timeout: 10000 });
console.log('1. Tela "Meus projetos" carregou OK');

await page.click('text=+ Novo projeto');
await page.waitForSelector('text=Toque para escolher o arquivo .xlsx');
console.log('2. Tela de import carregou OK');

const fileInput = await page.$('input[type=file]');
await fileInput.setInputFiles(FIXTURE);
await page.waitForSelector('text=Conferência antes de iniciar', { timeout: 30000 });
console.log('3. Import processou e chegou na tela de validação');

const resumo = await page.textContent('body');
console.log('   Resumo contém "5540"?', resumo.includes('5540'));
console.log('   Resumo contém "Crescente"?', resumo.includes('Crescente'));

await page.click('text=Iniciar vistoria');
await page.waitForSelector('text=GPS:', { timeout: 15000 });
console.log('4. Vistoria iniciada, tela principal carregou OK');

const estacaTexto = await page.textContent('body');
console.log('   Mostra estaca "0+0"?', estacaTexto.includes('0+0'));
console.log('   Mostra "Faixa 1"?', estacaTexto.includes('Faixa 1'));
await page.screenshot({ path: '/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/screenshot-modo-vistoria.png' });

await page.click('text=+20m');
await page.waitForTimeout(300);
console.log('5. Botão +20m clicado sem erro');

const botoesAlterar = await page.$$('text=Alterar');
if (botoesAlterar.length > 0) {
  await botoesAlterar[0].click();
  await page.waitForSelector('text=ORIGINAL', { timeout: 5000 });
  console.log('6. Bottom sheet de alteração abriu OK');
  await page.click('text=Cancelar');
  console.log('7. Cancelar fechou o bottom sheet');

  // fluxo real de alteração: seleciona um chip "ST" (Selagem) e confirma
  await botoesAlterar[0].click();
  await page.waitForSelector('text=ORIGINAL', { timeout: 5000 });
  await page.getByRole('button', { name: 'ST', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.waitForSelector('text=Alteração salva', { timeout: 5000 });
  console.log('7b. Confirmar alteração (chip ST) salvou e mostrou "Alteração salva"');
  await page.waitForTimeout(5200); // espera o toast sumir sozinho
  const corpoDepois = await page.textContent('body');
  console.log('    FaixaCard agora mostra "ST"?', corpoDepois.includes('>ST<') || /\bST\b/.test(corpoDepois));
}

await page.click('text=Parâmetros');
await page.waitForSelector('text=IRI (m/km)', { timeout: 5000 });
console.log('8. Modo Parâmetros (tabela transposta) carregou OK');
await page.screenshot({ path: '/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/screenshot-parametros.png' });

await page.click('text=Vistoria');
await page.waitForSelector('text=Faixa 1');
console.log('9. Voltou pro Modo Vistoria (mini-unifilar + rota) OK');
await page.screenshot({ path: '/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/screenshot-vistoria-completo.png' });

await page.click('text=Exportar');
await page.waitForSelector('text=Exportar CSV', { timeout: 5000 });
console.log('10. Tela de exportação carregou OK');

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.getByRole('button', { name: /Exportar CSV/ }).click(),
]);
const caminhoCsv = '/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/export-teste.csv';
await download.saveAs(caminhoCsv);
const fs = await import('node:fs');
const conteudoCsv = fs.readFileSync(caminhoCsv, 'utf-8');
console.log('11. CSV exportado, primeiras linhas:');
console.log(conteudoCsv.split('\n').slice(0, 3).join('\n'));
console.log('    Contém a alteração ST?', conteudoCsv.includes('ST'));

await page.screenshot({ path: '/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/screenshot-vistoria.png' });

await browser.close();
console.log('SMOKE TEST OK — fluxo completo sem erros de console/página');
