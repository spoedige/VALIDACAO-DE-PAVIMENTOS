import { chromium } from 'playwright';

const DIR = '/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad';
const SS = (nome) => `${DIR}/screenshot-ux-${nome}.png`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function abrirProjeto(page, fixture) {
  await page.goto('http://127.0.0.1:5173/');
  await page.click('text=+ Novo projeto');
  const fileInput = await page.$('input[type=file]');
  await fileInput.setInputFiles(fixture);
  await page.waitForSelector('text=Conferência antes de iniciar', { timeout: 30000 });
  await page.click('text=Iniciar vistoria');
  await page.waitForSelector('text=GPS', { timeout: 15000 });
}

for (const [nome, viewport] of [
  ['375', { width: 375, height: 812 }],
  ['390', { width: 390, height: 844 }],
  ['tablet', { width: 820, height: 1180 }],
  ['desktop', { width: 1440, height: 900 }],
]) {
  const page = await browser.newPage({ viewport });
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));

  await abrirProjeto(page, `${DIR}/fixtures/sintetico-6faixas.xlsx`);

  const semRolagemHorizontal = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  console.log(`[${nome}] 6 faixas — sem rolagem horizontal? ${semRolagemHorizontal}`);

  const headerOverlap = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button, header h1')];
    for (let i = 0; i < btns.length - 1; i++) {
      const a = btns[i].getBoundingClientRect();
      const b = btns[i + 1].getBoundingClientRect();
      if (a.right > b.left + 1) return true;
    }
    return false;
  });
  console.log(`[${nome}] header sem sobreposição? ${!headerOverlap}`);

  const navVisivel = await page.locator('nav button').count();
  console.log(`[${nome}] abas de navegação visíveis: ${navVisivel} (esperado 3)`);

  await page.screenshot({ path: SS(`vistoria-${nome}`), fullPage: false });

  // toque na régua -> modo consulta
  const regua = await page.locator('[aria-label*="Régua"]');
  const box = await regua.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + 20); // perto do topo = à frente
    await page.waitForSelector('text=Consultando estaca', { timeout: 5000 });
    console.log(`[${nome}] modo consulta abriu ao tocar na régua? true`);
    await page.screenshot({ path: SS(`consulta-${nome}`) });
    await page.click('text=Voltar ao GPS');
    const aindaConsultando = await page.locator('text=Consultando estaca').count();
    console.log(`[${nome}] "Voltar ao GPS" fechou a consulta? ${aindaConsultando === 0}`);
  } else {
    console.log(`[${nome}] RÉGUA NÃO ENCONTRADA`);
  }

  // Dashboard
  await page.click('text=Dashboard');
  await page.waitForSelector('text=Trecho', { timeout: 5000 });
  await page.screenshot({ path: SS(`dashboard-${nome}`) });
  console.log(`[${nome}] Dashboard renderizou OK`);

  // Parâmetros
  await page.click('text=Parâmetros');
  await page.waitForSelector('text=IRI (m/km)', { timeout: 5000 });
  console.log(`[${nome}] Parâmetros renderizou OK`);

  console.log(`[${nome}] erros de console/página: ${erros.length}`, erros.slice(0, 5));
  await page.close();
}

// trecho decrescente com arquivo real
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await abrirProjeto(page, `${DIR}/fixtures/MG_Decrescente.xlsx`);
  // avança a página até achar a régua e conferir que o topo (à frente) tem hodômetro MAIOR que a base
  const valores = await page.evaluate(() => {
    const marcas = [...document.querySelectorAll('[aria-label*="Régua"] ~ * , .text-\\[8px\\]')];
    return marcas.map((e) => e.textContent);
  });
  console.log('[decrescente] marcas de km capturadas (amostra):', valores.slice(0, 6));
  await page.screenshot({ path: SS('decrescente-ruler') });
  await page.close();
}

await browser.close();
console.log('UX SMOKE TEST DONE');
