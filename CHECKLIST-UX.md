# Checklist — Atualização de UX (pós-teste em dispositivo real)

Segunda rodada, em cima da implementação das Fases 0-6 (ver `CHECKLIST.md`).
Nenhuma regra de negócio, modelo de dados, parser, normalização ou
persistência foi tocada além do que este prompt pediu explicitamente. 51
testes automatizados (eram 46), todos passando. Typecheck e lint limpos.
Build de produção funcional.

## Como rodar
```bash
npm install
npm test        # 51 testes unitários
npm run build    # build de produção
```

## O que foi feito, seção a seção

**1. Header e hierarquia tipográfica** ✅ — Cabeçalho reescrito com
`flex justify-between`, título com `truncate`/`min-w-0`, botões `shrink-0`.
Validado sem sobreposição em 375/390/tablet/desktop via medição real de
`getBoundingClientRect()` (não só inspeção visual). Botões -20m/+20m
removidos por completo.

**2. Motor GPS — candidato vs estaca ativa** ✅ — `gpsEngine.ts` reescrito do
zero. Cadeia de confiança implementada na ordem pedida: accuracy aceitável
(≤30m, reaproveitando o limite de `classificarPrecisao`) → candidato único
com margem (gap entre 1º e 2º candidato ≥ accuracy da leitura, escala
sozinho com o ruído do aparelho, não é uma razão fixa) → progressão via
hodômetro contínuo (nunca lat/long bruto) → continuidade (nunca recua) →
histerese temporal (2+ leituras consistentes, janela adaptativa entre
500-3000ms que encolhe em alta velocidade pra não pular estação inteira
dentro da própria janela). Baixa confiança nunca tem botão de ação, só
`diagnostico` textual. 10 testes novos/reescritos cobrindo exatamente os 3
cenários que a seção 14 do prompt pediu (avanço automático vs congelamento
com diagnóstico; quase-equidistante não conta como único; oscilação entre
candidatos não pisca a estaca ativa).

**3. Geolocation API real** ✅ — `watchPosition` com
`{enableHighAccuracy:true, maximumAge:1000, timeout:10000}`. Permissão
tratada explicitamente (concedida/negada/indisponível/timeout), mensagem
exata pedida pro caso negada. Indicador mostra accuracy real (`±Xm`), nunca
valor fixo. `navigator.storage.persist()` movido pra disparar ao entrar na
Vistoria (além da chamada já existente na inicialização do app).
`overscroll-y-contain` aplicado no contêiner raiz da tela de Vistoria.
Confirmado que `latitude`/`longitude` já vivem na mesma `Estaca` persistida
que o motor lê (nenhuma estrutura paralela) — nada a mudar, só a confirmação
pedida pelo prompt.

**4. Mini-mapa saiu da Vistoria** ✅ — `RotaPolyline` só é renderizado dentro
do Dashboard agora.

**5. Dashboard (aba nova)** ✅ — Trecho (km inicial/final/extensão),
Vistoria com os dois números separados ("trecho percorrido" calculado como
`max hodômetro confirmado - min hodômetro confirmado` durante a sessão via
`sessaoInfo`, nunca `hodômetro atual - inicial`, e "alterações registradas"
como contagem de fieldLogs), Sessão (hora de início), GPS (lat/long/accuracy/
confiança), distribuição de soluções por extensão real (delta de hodômetro
entre estacas consecutivas, nunca 20m fixo) com barra proporcional, mini-mapa
opcional reaproveitando o componente existente.

**6. Régua vertical** ✅ — Substituiu o mini-unifilar horizontal por
completo. Coluna lateral fixa (88px + escala de km), ordenada por hodômetro
contínuo (cima = à frente sempre, confirmado com o arquivo real
Decrescente). Blocos só de cor, sem texto embutido. Altura proporcional ao
hodômetro real com mínimo garantido (confirmado visualmente: um segmento de
1 estaca isolado no meio de um trecho longo continua visível, não
desaparece). Múltiplas soluções simultâneas dividem a coluna da faixa em
sub-colunas. Toque em qualquer ponto de uma linha horizontal (confirmado com
toque em 5 frações diferentes da largura) resolve a posição de hodômetro,
não um segmento, e abre modo de consulta sem mexer na estaca ativa — "Alterar"
sempre continua operando sobre a estaca ativa, nunca sobre a posição
consultada (fluxo separado, confirmado no código e na tela). Legenda fixa
com a paleta completa de `normalizacao-config.json`/`paleta.ts` (nunca
duplicada), em grade de 2 colunas, por extenso, colapsável. Sem gesto de
arrastar — só `onClick`.

  Simplificação assumida conscientemente: a "marca de posição fixa com
  conteúdo rolando atrás dela" foi implementada como um mapeamento direto
  hodômetro→pixel dentro de um contêiner de altura fixa (a marca da estaca
  ativa fica a 2/3 da altura, mais espaço acima/à frente), em vez de uma
  transformação de scroll/transform dinâmica. O efeito visual e funcional
  pedido (mais espaço à frente, marca numa posição vertical constante) é
  equivalente; só a técnica de implementação é mais simples que a descrita
  literalmente no prompt.

**Ajuste pedido durante a sessão**: régua movida pra borda **esquerda** da
tela (estava na direita). Raciocínio do usuário: a maioria dos operadores é
destra e senta no banco do passageiro durante a vistoria — a mão direita,
mais funcional pra tocar "Alterar" e editar soluções durante o trajeto, fica
mais perto dos cards de faixa quando eles ocupam o lado direito da tela.
Revalidado visualmente e por teste automatizado depois da mudança.

**7. Dreno como coluna da régua** ✅ — Removida a barra lateral fixa
(`DrenoBar.tsx`, apagado). Dreno agora é uma coluna dentro da própria régua,
mesmo tratamento de segmento/cor, largura igual à metade de uma coluna de
faixa.

**8. Identidade visual** ✅ — Cor ocre `#9A6700`/`#855300` (tema Tailwind
`--color-ocre`/`--color-ocre-dark`) usada em títulos de seção e no botão
Exportar — nunca pra indicar solução/status. Números tabulares
(`tabular-nums`) alinhados à direita em parâmetros e Dashboard. Bordas finas
em vez de sombra grande. Padrão de legenda (swatch quadrado/redondo + texto)
reaproveitado em todo canto que precisa de legenda. Contraste calculado
manualmente (fórmula WCAG): branco sobre `#9A6700` ≈ 4.87:1 (passa AA pra
texto normal), `#855300` sobre branco ≈ 6.5:1 — ambos verificados, não só
estimados visualmente.

  **Achado real da checagem de daltonismo** (script
  `fase0-analise/checar-daltonismo.mjs`, simulação Machado et al. 2009):
  sob protanopia, "Fresagem Fina" (`#CC99FF`) e "Dreno Raso" (`#4EA6FC`)
  ficam pouco distinguíveis (distância euclidiana 6.6, abaixo do limiar de
  30). Não alterei nenhuma cor oficial da paleta pra corrigir isso — seria
  inventar uma cor nova sem fonte oficial. O próprio prompt já previa esse
  caso: o painel de detalhe por toque (seção 6) é o mecanismo de
  desambiguação, e continua funcionando independente de cor. Fica sinalizado
  pra quem mantém a paleta oficial decidir se vale trocar alguma das duas.

**9. Ajustes finos** ✅ — Botão "Alterar" no padrão de fonte 14-16px (ver
9.5 abaixo pro bug de altura). "Tráfego Pesado"/"Ultrapassagem" e os
rótulos "À frente"/"Passado": busquei no código inteiro, não existiam em
nenhum lugar da implementação atual — nada pra remover (provavelmente eram
de uma versão/mockup anterior que não chegou a ser implementada assim).
Escala de km adicionada na régua (ticks + número). Coluna de dreno com
metade da largura de uma coluna de faixa.

**9.5. Bug real encontrado e corrigido** ✅ — Ao medir a régua num viewport
de 390px com 4-6 faixas, o card de cada faixa ficava com só ~111px de
largura (a régua agora ocupa espaço fixo que antes não existia). Isso
espremia o título "Faixa N" pra **4px de largura visível** (praticamente
invisível) porque o botão "Alterar" consumia quase toda a linha — e, ao
tentar deixar o botão mais discreto (seção 9), eu tinha reduzido a altura
dele pra 32px, abaixo do mínimo de toque de 44px exigido pela seção 1. Achei
isso por medição de DOM (`getBoundingClientRect`), não só inspeção visual —
uma screenshot sozinha não deixava claro que o título tinha sumido de
verdade. Corrigido com três mudanças juntas: (1) título encurta pra "F1" em
telas estreitas via CSS responsivo, texto completo continua disponível a
partir do breakpoint `sm`; (2) botão "Alterar" de volta pra 44px de altura,
só com padding/fonte menores, nunca a altura; (3) grid de faixas passa a
usar 1 coluna por padrão no celular (cada card ganha a largura inteira
disponível) e só usa múltiplas colunas a partir do breakpoint `sm`, onde
sobra espaço de verdade. Revalidado por medição: título "F1" agora renderiza
com a largura natural completa (19px = 19px), botão com 44px de altura
exatos.

**10. Grade de 9 parâmetros + badge compacto** ✅ — `ParametrosGrid.tsx`
novo: par label:valor na mesma linha, 2 colunas × 5 linhas (3×3 ficava
apertado demais pra rótulos como "OPRD"/"EXAFE" nos testes em 375px), sem
borda por célula, só a borda externa do card. Capacidade de destacar valor
fora de tolerância implementada (prop `foraDeTolerancia`), mas **não
ativada** — não há limiar clínico definido em lugar nenhum do documento
original pra nenhum dos 9 parâmetros, e inventar um número (ex: "IRI > 3 é
ruim") seria romper a regra central do projeto inteiro contra invenção de
regra de engenharia. Fica pronta pra ligar assim que o engenheiro
responsável definir os limiares reais. Badge de solução reescrito como chip
de uma linha, borda fina (1-2px, não mais 4px), sem fundo saturado —
visualmente mais discreto que o botão "Alterar" em saturação/borda/padding,
não só em tamanho de fonte.

**11. Sem via manual de definição de estaca** ✅ — Removido por completo:
`setEstacaAtual`, `avancarManual`, `confirmarSugestao`,
`voltarAoModoAutomatico` não existem mais em lugar nenhum do código
(confirmado por busca no repositório inteiro). A régua só responde a toque
simples, sempre pra consulta. Validação de dado antes de abrir a Vistoria
reforçada: acrescentei checagem de hodômetro contínuo duplicado (aviso), que
não existia — as checagens de hodômetro não-monotônico e coordenada
inválida já existiam desde a implementação original e continuam bloqueando
antes de liberar "Iniciar vistoria".

**12. Legenda colapsável** ✅ — Implementada como alternância manual
("ver legenda"/"ocultar legenda"), disponível em qualquer configuração de
tela — o prompt pedia que ela pudesse recolher, não que detectasse
automaticamente largura+nº de faixas pra decidir sozinha, e a alternância
manual cobre isso sem a complexidade de detecção automática.

**13. Validação visual** ✅ — Testado com Playwright num Chromium real
(instalado temporariamente, removido depois) em 375px, 390px, tablet
(820px) e desktop (1440px), com arquivos sintéticos de 4, 5 e 6 faixas
(incluindo segmento de 1 estaca isolado, soluções simultâneas, faixa sem
nenhuma solução, e valor `unresolved`) e os 2 arquivos reais (Crescente e
Decrescente, confirmando cima=à frente em ambos os sentidos). Toque
verificado em 5 pontos diferentes ao longo da régua, não só no centro.
Alternância janela↔trecho completo e consulta↔GPS verificada sem erro de
console em nenhuma combinação.

**14. Testes e build** ✅ — `npm test`: 51/51. `npx tsc -b`: limpo. `npx
oxlint src`: limpo (3 avisos reais encontrados e corrigidos durante o
trabalho — acesso a ref durante render, setState em efeito evitável, e
`useMemo` com dependência instável). `npm run build`: gera `dist/sw.js`,
manifest e bundle sem erro.

## Arquivos alterados/criados nesta rodada
- Reescritos: `src/services/gpsEngine.ts`, `src/hooks/useGps.ts`,
  `src/screens/VistoriaScreen.tsx`, `src/components/FaixaCard.tsx`,
  `src/components/SolutionBadge.tsx`
- Novos: `src/components/VerticalRuler.tsx`, `src/components/ParametrosGrid.tsx`,
  `src/screens/DashboardScreen.tsx`
- Removidos: `src/components/MiniUnifilar.tsx`, `src/components/DrenoBar.tsx`
- Ajustados: `src/config/paleta.ts` (label curto pro badge), `src/index.css`
  (tema ocre), `src/services/excelAdapter.ts` (aviso de hodômetro duplicado),
  `src/services/__tests__/gpsEngine.test.ts` (reescrito pra nova API)

## O que não foi possível validar nesta sessão
- Comportamento real do motor com o veículo de fato em movimento (só
  simulador de leituras) — mesma limitação já registrada em `CHECKLIST.md`.
- Calibração de campo dos limiares de histerese/margem (o prompt já
  reconhece que são "ponto de partida", não valores finais).
- Teste em dispositivo físico Safari/iOS e Chrome/Android.
- Limiares clínicos de "fora de tolerância" pros 9 parâmetros (capacidade
  pronta, sem dado real pra ativar).
