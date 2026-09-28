import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const context = await browser.newContext();
const page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

await page.goto('http://127.0.0.1:4174/');
await page.waitForSelector('text=Meus projetos');
console.log('1. Primeira carga (online) OK');

// espera o service worker instalar e ativar
await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!r?.active), null, { timeout: 15000 });
console.log('2. Service worker ativo');

// recarrega pra garantir que o SW já está no controle desta página
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
console.log('3. Página agora está sob controle do service worker');

await context.setOffline(true);
console.log('4. Rede desligada (context.setOffline)');

await page.reload();
await page.waitForSelector('text=Meus projetos', { timeout: 15000 });
console.log('5. App carregou OFFLINE (Meus projetos apareceu sem rede)');

// confere que o config de normalização (necessário pro import) também está cacheado
const configOffline = await page.evaluate(() => fetch('/config/normalizacao-config.json').then((r) => r.ok));
console.log('6. config/normalizacao-config.json acessível offline?', configOffline);

// importar uma planilha real inteiramente offline (parsing é 100% client-side)
await page.click('text=+ Novo projeto');
const fileInput = await page.$('input[type=file]');
await fileInput.setInputFiles('/tmp/claude-0/-home-user-VALIDACAO-DE-PAVIMENTOS/9340ed7f-365f-5137-954e-4d846c5d56f4/scratchpad/fixtures/MG_Crescente.xlsx');
await page.waitForSelector('text=Conferência antes de iniciar', { timeout: 30000 });
console.log('7. Import de planilha real funcionou OFFLINE');
await page.click('text=Iniciar vistoria');
await page.waitForSelector('text=Faixa 1', { timeout: 15000 });
console.log('8. Vistoria iniciada offline, dado salvo no IndexedDB');

// simula fechar e reabrir o navegador: reload volta pra "Meus projetos" (a view
// em si não persiste, só os dados) — reabrir o projeto deve trazer tudo de volta
await page.reload();
await page.waitForSelector('text=Meus projetos', { timeout: 15000 });
const nomeProjetoNaLista = await page.textContent('body');
console.log('9. Após reload offline, projeto ainda aparece na lista?', nomeProjetoNaLista.includes('MG_Crescente'));
await page.click('text=MG_Crescente');
await page.waitForSelector('text=GPS:', { timeout: 15000 });
console.log('10. Reabrir o projeto após reload traz a vistoria de volta, ainda offline');

await context.setOffline(false);
await browser.close();
console.log('OFFLINE TEST OK');
