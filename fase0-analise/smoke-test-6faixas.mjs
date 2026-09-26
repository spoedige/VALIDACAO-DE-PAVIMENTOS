import { chromium } from 'playwright';

const FIXTURE = '/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/fixtures/sintetico-6faixas.xlsx';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const [nome, viewport] of [['celular', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }]]) {
  const page = await browser.newPage({ viewport });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

  await page.goto('http://127.0.0.1:5173/');
  await page.click('text=+ Novo projeto');
  const fileInput = await page.$('input[type=file]');
  await fileInput.setInputFiles(FIXTURE);
  await page.waitForSelector('text=Conferência antes de iniciar', { timeout: 15000 });
  await page.click('text=Iniciar vistoria');
  await page.waitForSelector('text=Faixa 6', { timeout: 10000 });

  // checa se a página inteira precisa de rolagem horizontal (nunca pode)
  const precisaRolagemHorizontal = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  console.log(`[${nome}] precisa de rolagem horizontal? ${precisaRolagemHorizontal}`);
  const faixasVisiveis = await page.locator('text=/^Faixa [1-6]$/').count();
  console.log(`[${nome}] quantas faixas aparecem no DOM: ${faixasVisiveis}`);

  await page.screenshot({ path: `/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/screenshot-6faixas-${nome}.png`, fullPage: true });
  await page.close();
}

await browser.close();
console.log('OK');
