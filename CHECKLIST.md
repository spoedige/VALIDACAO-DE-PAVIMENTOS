# Checklist final — App de Vistoria de Campo de Pavimento Rodoviário

Implementação completa das 6 fases descritas no documento original, na ordem
pedida. Repositório: `spoedige/validacao-de-pavimentos`, branch
`claude/beautiful-brahmagupta-6k775w`, 10 commits. 46 testes automatizados
(`npm test`), todos passando. Typecheck limpo (`tsc -b`). Build de produção
funcional (`npm run build`).

## Como rodar
```bash
npm install
npm test          # 46 testes unitários
npm run dev        # servidor de desenvolvimento
npm run build       # build de produção (gera dist/sw.js, manifest, etc.)
```

## Fase 0 — Prova de realidade da planilha ✅
Script `fase0-analise/analisar-planilha.mjs` rodado contra os 2 arquivos reais
fornecidos (MG Crescente e Decrescente). Evidência completa em
`fase0-analise/output/*.json` e achados em `fase0-analise/RELATORIO.md`.

**Achados que confirmam o documento:** estrutura de cabeçalho, colunas fixas,
posição das faixas, código de Dreno (R/P), valores brutos de solução, `0`
como valor legítimo, zero fórmulas não avaliadas nos 2 arquivos.

**Achados que divergem ou não estavam documentados** (todos com decisão
conservadora tomada e sinalizada, nunca inventados):
- "Sentido" (Crescente/Decrescente) não pode vir da ordem numérica do
  hodômetro contínuo — ele sempre cresce de 0 dentro do arquivo, inclusive no
  "Decrescente". A única fonte real é o texto livre da célula "Local".
- Existe uma seção "Acostamento" (colunas Micro/GAP) com dado real
  preenchido, não mencionada em lugar nenhum do documento. **Não
  implementada** — fica fora do app até decisão sua sobre tratá-la como mais
  uma faixa, seção informativa separada, ou continuar ignorada.
- Bloco de faixa realmente tem 17 colunas (16 usadas + 1 separadora vazia),
  não 16 como a soma dos itens sugeria — irrelevante na prática porque a
  detecção é por texto de cabeçalho, nunca por posição fixa.
- "Hodômetro amarrado no marco" não vem zero-padded (`"0+20"`, não `"0+020"`)
  — tratado como string opaca, nunca reformatado.

## Fase 1 — Domínio, tipos e Excel Adapter ✅
`src/types/domain.ts`, `src/services/normalizer.ts`,
`src/services/excelAdapter.ts`. 18 testes (`normalizer.test.ts`,
`excelAdapter.test.ts`), incluindo os critérios de aceitação 1, 3, 4, 5.

- Detecção 100% por texto de cabeçalho nas primeiras 15 linhas — nenhuma
  coluna hardcoded por número.
- Tabela de normalização em `public/config/normalizacao-config.json`,
  separada do código, editável sem rebuild, condicionada à categoria-pai.
- **Decisão de interpretação sinalizada**: Revest. `"M"` normaliza para
  `M` (Microrrevest.) porque a paleta oficial do documento define esse
  código explicitamente; Revest. `"3"` fica `unresolved` (nenhum código
  numérico está definido na paleta). O documento cita os dois como exemplo
  de valor ambíguo, mas só um dos dois tem mapeamento oficial — confirme se
  essa leitura está certa.
- **Bug real encontrado e corrigido** (fora do escopo do documento, achado
  ao validar contra os arquivos reais): `XLSX.read` com `ArrayBuffer` cru
  depende de `instanceof ArrayBuffer` pra detectar o tipo de entrada, o que
  falha silenciosamente entre realms diferentes (Web Workers, iframes — e,
  na prática, ambiente de teste jsdom), fazendo o parser cair num fallback
  errado sem lançar exceção. Corrigido convertendo para `Uint8Array`
  explicitamente antes de chamar `XLSX.read`.
- Validado com os 2 arquivos reais completos (5540 estacas cada): faixas
  detectadas [1,2] no Crescente e [1,2,3] no Decrescente — bate exatamente
  com o texto do documento original.

## Fase 2 — Persistência (Dexie) e projetos ✅
`src/db/schema.ts`, `projectService.ts`, `checkpoint.ts`, `solutionSet.ts`.
11 testes, incluindo os critérios 6, 12, 13, 14, 15.

- **Gap do documento coberto com decisão conservadora sinalizada**: o texto
  diz "sem alteração real, sem registro" só para o caso de confirmar o
  conjunto original pela primeira vez. Não cobre o que fazer se uma faixa
  **já alterada** for revertida de volta ao original. Implementado: apaga o
  `fieldLog` existente (nunca fica um registro órfão idêntico ao original no
  CSV final), sem gravar esse passo específico no `fieldChangeHistory`.
- Checkpoint com `sourceFileHash` (SHA-256 dos bytes brutos do .xlsx) e
  bloqueio de importação com hash divergente, exceto confirmação explícita.

## Fase 3 — Motor de GPS isolado ✅
`src/services/gpsEngine.ts`. 12 testes cobrindo os critérios 9, 10, 16,
incluindo um simulador de leituras (limpo, ruído pra trás, retrocesso
persistente, perda de sinal).

- **Limiar sinalizado**: "não retroceder por causa de uma leitura isolada"
  implementado como debounce de 2 leituras consecutivas apontando pro mesmo
  candidato antes de sugerir retrocesso — o documento não dá um número
  exato, 2 é a leitura conservadora mínima de "mais de uma".
- Motor nunca troca a estaca atual sozinho, só sugere — a confirmação
  (botão "Ir para", ou controle manual) é sempre de quem consome.

## Fase 4 — Telas de import, validação e vistoria ✅
Import → Validação (bloqueios/avisos) → Modo Vistoria (hodômetro, GPS,
faixas dinâmicas, dreno, alteração com Original/Atual lado a lado,
Desfazer). Wake Lock ativo. `navigator.storage.persist()` chamado e **o
resultado exibido** na tela inicial (corrigido durante a sessão — o
documento pede isso explicitamente e a primeira versão só chamava a API sem
mostrar nada).

- **Bug real corrigido**: a grade de faixas usava rolagem horizontal
  (`overflow-x-auto`), violando a regra explícita "nunca exigir rolagem
  horizontal da página pra ver todas as faixas". Trocado por CSS Grid
  responsivo (até 4 faixas numa linha; 5-6 quebram em 2 linhas de 3 no
  celular e voltam a caber numa linha só a partir do tablet). Validado com
  uma planilha sintética de 6 faixas em viewport de celular e tablet — sem
  rolagem horizontal em nenhum dos dois.
- Soluções com código interno sem sigla oficial (`FresagemFuncional`,
  `FresagemEstrutural` — marcadas "x" na paleta do documento) usam o nome da
  categoria como código, por não haver sigla oficial pra abreviar sem
  inventar uma nova (nenhuma abreviação existente evitaria colisão real com
  códigos já oficiais, como `FF` = Fresagem Fina).

## Fase 5 — Modo Parâmetros, mini-unifilar e exportação ✅
Tabela transposta de parâmetros, mini-unifilar por trechos consecutivos
(códigos concatenados, sem inventar "solução predominante"), rota V1
reduzida (polyline SVG, sem tiles de mapa, conforme seção 9). CSV (seção
10) e Checkpoint com Web Share API + fallback de download. 5 testes
dedicados ao CSV (critério 11).

- **Interpretação sinalizada**: a coluna "Km" do CSV não tem fórmula
  definida no documento. Implementado como
  `hodômetroContínuo + kmInicial do projeto` — nos 2 arquivos reais
  (kmInicial=0) o valor é idêntico ao Hodômetro, então não pôde ser
  validado contra um caso real com kmInicial≠0. Confirme se essa é a
  intenção.
- Bundle final ~721 KB (majoritariamente a lib SheetJS) — não foi feito
  code-splitting/lazy-load do parser de Excel por decisão deliberada: seria
  um refactor não-trivial na camada mais crítica do app (o parser, já
  validado a fundo contra dado real), e o ganho é secundário num app
  offline-first onde o bundle é baixado uma vez e cacheado. Fica registrado
  como possível otimização futura, não um problema de correção.

## Fase 6 — PWA e testes em dispositivo real ⚠️ parcial
**Feito e validado de verdade** (não só por inspeção de código):
- `vite-plugin-pwa` configurado, manifest + service worker gerados no
  build, ícones 192/512 criados.
- Testado com **rede genuinamente desligada** (Playwright
  `context.setOffline(true)`, não simulação): app carrega offline depois da
  primeira visita, `config/normalizacao-config.json` acessível offline,
  **import de um arquivo .xlsx real de 14MB funciona 100% offline**, e um
  reload da página (proxy de fechar/reabrir o navegador) mantém o projeto e
  os dados no IndexedDB. Confirma os critérios de aceitação 7 e 8 na
  prática.

**Não foi possível fazer nesta sessão** (sem acesso a dispositivo físico):
- Teste em Safari/iOS real e Chrome/Android real (seção 11) — o
  comportamento de armazenamento do Safari/iOS é notoriamente mais
  restritivo que qualquer coisa que dê pra simular em Chromium headless.
- Comportamento real do Wake Lock numa tela de celular físico durante uma
  vistoria de horas.
- Teste do GPS com o veículo realmente em movimento (o motor foi validado
  isoladamente com simulador de leituras, não com hardware GPS real).
- "Adicionar à tela de início" testado na prática num dispositivo (só
  confirmado que manifest + service worker são gerados e servidos
  corretamente).

## Critérios de aceitação (seção 14) — status final
| # | Critério | Status |
|---|---|---|
| 1 | 2 faixas preenchidas, Faixa 3 nunca aparece | ✅ testado (unitário + arquivo real) |
| 2 | 4 faixas juntas sem rolagem; 5-6 continuam visíveis | ✅ testado (bug encontrado e corrigido) |
| 3 | Múltiplas soluções simultâneas na mesma faixa | ✅ testado |
| 4 | "RP7,0"/"0.5" normalizado e preservado | ✅ testado |
| 5 | Revest. ambíguo marcado unresolved, nunca inferido por coincidência | ✅ testado (com interpretação sinalizada) |
| 6 | Alterar solução gera fieldLog + fieldChangeHistory com timestamp | ✅ testado |
| 7 | Fechar/reabrir não apaga alterações | ✅ testado de verdade (reload com IndexedDB) |
| 8 | App funciona sem rede após import | ✅ testado de verdade (rede desligada) |
| 9 | Ruído de GPS pra trás não retrocede | ✅ testado |
| 10 | Perda de sinal mantém última posição, navegação manual continua | ✅ testado |
| 11 | CSV só com alterações, múltiplas soluções separadas por "\|" | ✅ testado |
| 12 | Checkpoint com hash diferente avisa antes de aplicar | ✅ testado |
| 13 | Mais de um projeto salvo, progresso independente | ✅ testado |
| 14 | Confirmar conjunto igual ao original não cria registro | ✅ testado |
| 15 | Renomear projeto não muda projectId | ✅ testado |
| 16 | Desempate de GPS determinístico, nunca aleatório | ✅ testado |

## Fora de escopo (seção 15) — confirmado, nada implementado
Sincronização em tempo real, login/autenticação, retroalimentação da
planilha original, abas Quantidades/Orçamento/SGP-2, tiles de mapa reais,
map-matching geométrico completo.

## Decisões que precisam da sua confirmação
1. Seção "Acostamento" nos dados reais — tratar como faixa, seção
   separada, ou continuar fora do app?
2. Revest. "M" → recognized, "3" → unresolved (ver Fase 1) — confere com a
   intenção original?
3. Reverter uma faixa já alterada de volta ao original apaga o `fieldLog`
   (ver Fase 2) — comportamento esperado?
4. Fórmula da coluna "Km" do CSV (ver Fase 5) — confere?
5. Limiares numéricos sem definição no documento (todos comentados no
   código-fonte, buscar por "sinalizado no checklist" ou "interpretação"):
   coordenadas inválidas bloqueia a partir de 90% do projeto; hodômetro
   "claramente inconsistente" bloqueia a partir de 10% de inversões;
   intervalo "irregular" avisa quando algum trecho passa de 3x a mediana.
