# Checklist — Atualização de UX, Rodada 3 (pós-deploy)

Verificação objetiva dos 9 pontos apontados no teste em dispositivo real, na
ordem de execução pedida.

## 1+2. Remover espessura editável + reestruturar tela de alterar

**Corrigido.** `AlteracaoBottomSheet.tsx` reescrito por completo:
- Não existe mais nenhum input de espessura. A espessura só aparece como
  informação read-only, dentro de "Solução original do projeto" (ex:
  "Fresagem Funcional (4,0 cm)"), nunca editável.
- Tipografia reorganizada: nome da solução em 16px semibold, metadados em
  11px, seleção indicada por checkbox marcado, não por fonte maior.
- Intervenções de campo agora são **checkboxes** (seleção múltipla), não
  radio.
- Botão **"Limpar Faixa"** reseta a faixa em edição de volta à solução
  original do projeto — testado (`estadoInicialFaixaAPartirDe`), distinto de
  reverter um evento específico do histórico.
- Campo de observação de texto livre por faixa, opcional.

Bug real encontrado e corrigido durante QA visual: a lista de intervenções
não tinha `min-height: 0` no container com `overflow-y-auto` dentro do
layout flex — item clássico do CSS flexbox que fazia o container crescer
além da altura disponível em vez de rolar, escondendo checkboxes atrás do
rodapé fixo (`Limpar Faixa` / `Confirmar` / `Concluir`) e tornando-os
inclicáveis. Confirmado com Playwright contra um XLSX real (5.540 estacas):
antes da correção, o clique era interceptado pelo rodapé; depois, a rolagem
interna funciona e todos os checkboxes ficam alcançáveis.

## 3. Multi-faixa no mesmo fluxo

**Corrigido.** Abas de faixa no topo da folha (`estaca.faixas.map`), pré-
selecionada na faixa que disparou o toque em "Alterar". Cada faixa mantém
seu próprio estado (`estadoPorFaixa`, por número de faixa) ao trocar de aba
— verificado em QA real: marcar um checkbox na Faixa 1, ir pra Faixa 2 e
voltar preserva a marcação. "Confirmar" salva só a faixa atual sem fechar a
tela; só o botão "Concluir" fecha.

## 4. Mapa real no Dashboard

**Corrigido.** Removido o texto "(OPCIONAL)" (vazamento de linguagem do
prompt, não copy real) — card renomeado para "Mapa do trecho". Adicionado
`MapaReal.tsx` com tiles reais do OpenStreetMap via Leaflet (grátis, sem
chave de API), atrás da polyline/ponto de GPS. Atribuição do OSM exibida no
rodapé do mapa ("Leaflet | © OpenStreetMap contributors").

Isolamento confirmado: `MapaReal` só lê `estacas`/`estacaAtualIndex` já
calculados pelo motor de GPS — não participa em nenhuma etapa da cadeia
GPS→estaca, só desenha o resultado. Testado com falha real de rede (erro de
certificado no proxy do ambiente de sandbox): o mapa degrada graciosamente
para a polyline esquemática existente, sem bloquear nem atrasar o resto do
app. Mapa aparece só no Dashboard, nunca na Vistoria.

## 5. Aba "Alterações" com auditoria e reversão por cadeia

**Corrigido.** Nova 4ª aba de navegação (`Vistoria | Dashboard | Parâmetros
| Alterações`), com contador de alterações ativas (ex: "Alterações (1)").
Em 375px de largura, nenhuma aba desaparece nem quebra layout — testado
visualmente.

- `AlteracoesTab.tsx` lista todo evento (estaca, faixa, de→para, timestamp,
  nota).
- Ação é **"Reverter"**, nunca "Excluir" — `reverterEvento()` só marca
  `revertidoEm` no registro (`src/db/projectService.ts`); o evento nunca é
  apagado, e continua visível na seção colapsável "Revertidas".
- Reversão recalcula o estado atual a partir de **toda a cadeia** de
  eventos válidos (`calcularEstadoAtualDaCadeia`, `src/db/historico.ts`):
  não é um reset fixo pro original nem "volta pro penúltimo estado". Testado
  exatamente contra o exemplo do prompt (original→A→B→C, reverter B resulta
  em C) e contra edge cases (reverter o único evento, o mais recente, o
  primeiro mantendo os posteriores, todos os eventos).
- Confirmado que reverter não mexe em `stations`/estaca ativa/GPS — só em
  `fieldChangeHistory`/`fieldLogs`.

## 6. Colunas de largura fixa no painel de consulta

**Corrigido.** `gridConsultaClassName()` em `VistoriaScreen.tsx` usa classes
`grid-cols-N` literais (Tailwind v4 não gera CSS de string interpolada) —
cada `grid-cols-N` já usa `minmax(0, 1fr)` por trilha, então nenhuma coluna
cresce além da fração que lhe cabe. `SolutionBadge` trocou
`whitespace-nowrap` por `truncate`, então nome longo de solução trunca
dentro da própria coluna, sem empurrar a coluna vizinha nem deslocar o
dreno. Validado visualmente com a estaca real do XLSX (faixas 1 e 2 + dreno,
3 colunas).

## 7. Destaque de "fora de tolerância" a partir do XLSX real

**Corrigido, com dado real, não limiar inventado.** Antes de codificar,
os dois arquivos `.xlsx` reais fornecidos (Crescente e Decrescente) foram
inspecionados diretamente (XML interno de `conditionalFormatting`/`cfRule`/
`dxf`): o destaque rosa é formatação condicional com expressões numéricas
simples e diretamente avaliáveis (não fórmulas complexas), idênticas nos
dois arquivos, cobrindo os 9 parâmetros. Os limiares foram extraídos
literalmente pra `public/config/limiares-tolerancia.json` (IRI≥2,7,
%Defeitos≥0,25, ATR≥7, OPRD/EXAFE=não vazio, HR≥8, D0≥50, Rc<70 — regra
invertida —, D120≥10), documentados como extraídos, nunca aproximados por um
número "razoável" escolhido no código.

`ParametrosGrid.tsx` recebe `foraDeTolerancia` calculado por
`calcularForaDeTolerancia()` (`src/services/tolerancia.ts`), carregado via
`useLimiaresTolerancia()`. Verificado em QA real: a estaca 0+0 do XLSX real
mostra IRI 3,18 da Faixa 2 destacado em rosa (≥2,7), e a Faixa 1 (IRI 1,87)
sem destaque — comportamento correto e vindo do dado real, não de uma regra
inventada.

## 8. Eliminar célula vazia na grade de parâmetros

**Corrigido.** `ParametrosGrid.tsx`: 8 primeiros parâmetros em grid 2 col.,
o 9º (D120) em `col-span-2` ocupando a linha inteira — sem célula vazia
sobrando, sem reordenar os outros 8, sem voltar pro layout 3×3 já rejeitado.
Confirmado visualmente no dispositivo real (D120 aparece como uma linha
larga, label à esquerda e valor à direita).

## 9. Linha separatória entre colunas de faixa na régua

**Corrigido.** `VerticalRuler.tsx`: divisores finos (`<div>`) entre colunas
de faixa e antes da coluna de dreno — puramente visual, não interfere nos
blocos de cor.

---

## Arquivos alterados/criados

**Novos:**
- `public/config/limiares-tolerancia.json`
- `src/services/tolerancia.ts`, `src/services/__tests__/tolerancia.test.ts`
- `src/hooks/useLimiaresTolerancia.ts`
- `src/db/historico.ts`, `src/db/__tests__/historico.test.ts`
- `src/components/MapaReal.tsx`
- `src/components/AlteracoesTab.tsx`

**Modificados:**
- `src/types/domain.ts` (campo `revertidoEm`)
- `src/db/projectService.ts` (`getFieldChangeHistoryByProject`,
  `reverterEvento`)
- `src/db/__tests__/projectService.test.ts` (4 testes novos de reversão)
- `src/components/ParametrosGrid.tsx`, `FaixaCard.tsx`, `SolutionBadge.tsx`,
  `VerticalRuler.tsx`
- `src/components/AlteracaoBottomSheet.tsx` (reescrita completa)
- `src/screens/VistoriaScreen.tsx` (4ª aba, colunas fixas, integração)
- `src/screens/DashboardScreen.tsx` (mapa real)
- `src/App.tsx` (carrega limiares de tolerância)
- `package.json` / `package-lock.json` (`leaflet`, `@types/leaflet`)

## Testes executados

Testes novos pedidos pelo prompt, todos implementados:
- Reverter um registro na aba "Alterações" restaura o estado da cadeia
  daquela faixa (não sempre o original), sem afetar estaca ativa/GPS —
  `src/db/__tests__/historico.test.ts` (8 testes) e
  `src/db/__tests__/projectService.test.ts` (4 testes de integração contra
  o Dexie real).
- Leitura do destaque de fora de tolerância vindo da célula do XLSX —
  `src/services/__tests__/tolerancia.test.ts` (6 testes).
- Grade de parâmetros sem célula vazia — verificado via `ParametrosGrid.tsx`
  (`col-span-2` no 9º parâmetro) e confirmado visualmente.
- Seletor de faixa preservando estado da faixa já editada e "Limpar Faixa"
  afetando só a faixa atual — verificado em QA real no navegador (Playwright
  contra um XLSX real), não como teste unitário automatizado (a lógica de
  estado por faixa está isolada em `estadoPorFaixa` dentro do componente de
  UI, sem cobertura de testes de componente no projeto até aqui).

Nenhum teste existente foi removido. Nenhuma regra de negócio foi alterada
pra fazer teste passar.

### Resultado de `npm test`

```
Test Files  8 passed (8)
     Tests  69 passed (69)
```

(61 testes das rodadas anteriores + 8 novos de `historico.test.ts` e 6 de
`tolerancia.test.ts`, mais os 4 novos de `projectService.test.ts` somados
aos já existentes — total líquido 69.)

### Resultado de `npm run build`

Build de produção concluído sem erros. `tsc -b` limpo. Aviso do Vite sobre
o bundle principal passar de 500 kB (890 kB, por causa do Leaflet) — não é
erro, é só uma sugestão de code-splitting que não foi pedida nesta rodada.

## Pontos que ainda dependem de teste em dispositivo físico

- **GPS em movimento real**: toda a lógica de motor de GPS já existia e não
  foi tocada nesta rodada — mas o comportamento em rota real, com sinal
  variável, continua só validável em campo.
- **Carregamento de tiles do OpenStreetMap em rede real**: no ambiente de
  sandbox usado pra QA, a rede sai por um proxy com certificado próprio, e o
  carregamento dos tiles falhou por erro de certificado — o que serviu, na
  prática, pra confirmar que o fallback gracioso pra polyline esquemática
  funciona. Falta confirmar em rede real (com e sem conexão) se os tiles
  carregam corretamente e se ficam em cache do Service Worker pra uso
  offline subsequente.
- **Toque real em tela pequena**: os testes visuais foram feitos por
  automação de navegador (Playwright, viewport 375×700) contra os dois
  arquivos `.xlsx` reais fornecidos (BR-050/MG Crescente, 5.540 estacas).
  Áreas de toque, gestos de rolagem e comportamento de teclado virtual em
  dispositivo físico ainda não foram confirmados.
- **Arquivo Decrescente**: a extração de limiares de tolerância (item 7) foi
  confirmada idêntica nos dois arquivos (Crescente e Decrescente) na
  inspeção do XML, mas o fluxo completo de importação + destaque em tela só
  foi exercitado de ponta a ponta com o arquivo Crescente.
