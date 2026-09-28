import { chromium } from 'playwright';
const DIR = '/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function abrir(page, fixture) {
  await page.goto('http://127.0.0.1:5173/');
  await page.click('text=+ Novo projeto');
  const fileInput = await page.$('input[type=file]');
  await fileInput.setInputFiles(fixture);
  await page.waitForSelector('text=Conferência antes de iniciar', { timeout: 30000 });
  await page.click('text=Iniciar vistoria');
  await page.waitForSelector('text=GPS', { timeout: 15000 });
}

for (const nome of ['casos-4faixas.xlsx', 'casos-5faixas.xlsx']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await abrir(page, `${DIR}/fixtures/${nome}`);

  const faixasVisiveis = await page.locator('text=/^Faixa [1-9]$/').count();
  const semRolagem = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  console.log(`[${nome}] faixas no DOM: ${faixasVisiveis}, sem rolagem horizontal: ${semRolagem}, erros: ${erros.length}`);

  // toca perto do topo da régua (estaca 20 de 40, ~à frente) pra ver o segmento curto
  const regua = page.locator('[aria-label*="Régua"]');
  const box = await regua.boundingBox();
  if (box) {
    // toca em vários pontos ao longo da linha, não só no centro (seção 13)
    for (const fracao of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      await page.mouse.click(box.x + box.width * fracao, box.y + box.height * 0.4);
    }
    await page.waitForSelector('text=Consultando estaca', { timeout: 5000 });
    console.log(`[${nome}] toque em múltiplos pontos da linha funcionou`);
  }

  await page.screenshot({ path: `${DIR}/screenshot-casos-${nome}.png`, fullPage: true });
  await page.close();
}

await browser.close();
console.log('CASOS OK');
