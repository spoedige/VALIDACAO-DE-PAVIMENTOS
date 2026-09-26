# Fase 0 — Prova de realidade da planilha

Script: `analisar-planilha.mjs`. Rodado contra os 2 arquivos reais fornecidos
(`U_BR-050_MG_Crescente.xlsx`, `U_BR-050_MG_Decrescente.xlsx`). Evidência
completa em `output/MG_Crescente.json` e `output/MG_Decrescente.json`.

## Confirma o que o documento descreve
- Aba "Unifilar" existe nos dois arquivos.
- Cabeçalho nas linhas 6/7/8 (1-indexed), dados a partir da linha 11 — confirmado
  via detecção por texto, não por número fixo.
- 6 faixas no cabeçalho, blocos de 17 colunas (16 usadas + 1 coluna vazia
  separadora), mesmo espaçamento nos dois arquivos.
- Colunas fixas 14 (hodômetro contínuo), 15 (hodômetro/marco), 16 (lat), 17
  (long), 18 (tipo seção), 19 (marco km), 20 (observação) — confirmadas.
- Coluna 126 = Dreno, códigos `"R"` (raso) e `"P"` (profundo) confirmados nos
  dois arquivos (Crescente: R=1439/P=249; Decrescente: R=993/P=135).
- Selagem e Fresagem Fina: 100% vazias nos dois arquivos (consistente com os 6
  arquivos já testados pelo autor do documento).
- Valores brutos de solução batem com o documento: Estrutural `"RP7,0"` /
  `"RP4,0"` (código+espessura embutidos), Fresagem Funcional/Estrutural
  números puros (`1`, `0.5`), Microfres. sigla `"MF"`, Revest. `"M"` ou `3`.
- `0` aparece como valor legítimo em parâmetros (ex: `% Defeitos = 0`) — não
  pode ser tratado como célula vazia.
- Zero fórmulas sem valor calculado nos dois arquivos.
- Zero coordenadas inválidas, zero inconsistência de hodômetro nos dois
  arquivos.

## Diverge do documento ou não estava documentado (decisão pendente do usuário)

1. **"Sentido" não pode vir da ordem numérica do hodômetro.** O hodômetro
   contínuo sempre cresce de 0 dentro do arquivo, nos dois arquivos —
   inclusive no "Decrescente". O sentido real da rodovia (Crescente/
   Decrescente) só existe como texto livre na célula "Local" (ex: "BR-050/MG
   - Decrescente - km 0,000 ao km 180,000"). Implementado: parse desse texto
   com regex, preservando o texto bruto e sinalizando se o formato não for
   reconhecido, em vez de inferir por comparação numérica.
2. **Seção "Acostamento" existe nos dados e não está no documento.** Colunas
   123 ("Micro") e 124 ("GAP (cm)"), fora do padrão "Faixa N", com dados reais
   preenchidos (246 e 44 células no arquivo Crescente). Não implementado —
   fica fora de escopo até decisão do usuário sobre se deve ser tratado como
   mais uma faixa, uma seção informativa separada, ou continuar ignorado.
3. **Coluna 282 tem um cabeçalho solto ("2")**, sem relação com o padrão de
   faixas, longe de qualquer bloco conhecido. Ignorado — nenhuma lógica do
   app depende dessa região da planilha.
4. **"Hodômetro amarrado no marco" não vem zero-paded.** Valores reais:
   `"0+0"`, `"0+20"`, `"9+820"`, `"179+980"` — não `"0+020"` como o exemplo
   ilustrativo do documento sugeria. Tratado como string opaca, nunca
   reformatada, como já era a intenção do documento (`numeroEstaca` é só a
   notação da planilha).
5. **Coluna "Tipo de Seção" (marcadores de observação) vazia nos 2 arquivos**
   — sem dado real disponível ainda para validar o fluxo de exibição desses
   marcadores. Fica como Selagem/Fresagem Fina: implementado, mas sem
   validação prática.
6. `intervaloMedioEstacas` ficou em ~32,5 m nos dois arquivos, não os 20 m
   citados como referência no objetivo do documento — não é tratado como
   erro porque a detecção não assume esse valor fixo em nenhum lugar.

## Números-chave (evidência completa nos .json)
| | Crescente | Decrescente |
|---|---|---|
| Estacas | 5540 | 5540 |
| Km | 0,000 a 180,000 | 0,000 a 180,000 |
| Faixas com dado | 1-6 (Fresagem Estrutural e Fresagem Funcional preenchidas em todas as 6) | 1-6 |
| Selagem / Fresagem Fina | 0 preenchidas | 0 preenchidas |
| Dreno R / P | 1439 / 249 | 993 / 135 |
| Fórmulas não avaliadas | 0 | 0 |
| Coordenadas inválidas | 0 | 0 |

## Bug crítico encontrado ao validar o excelAdapter de produção contra os 2 arquivos reais
`XLSX.read(arrayBuffer, {type:'array'})` faz detecção automática de tipo
internamente checando `data instanceof ArrayBuffer`. Isso falha silenciosamente
(sem lançar exceção) quando o `ArrayBuffer` foi criado em outro realm/contexto
JS do que o código que chama `XLSX.read` — cenário real em Web Workers, iframes,
e (confirmado na prática) em ambiente de teste jsdom. O resultado não é um erro
claro: o parser cai num fallback errado e devolve uma aba fantasma "Sheet1"
vazia, silenciosamente — exatamente o tipo de falha silenciosa que a seção 3
do documento pede para nunca acontecer ("se a estrutura não for reconhecida,
mostrar erro claro"). Corrigido convertendo explicitamente para `Uint8Array`
antes de chamar `XLSX.read`, o que contorna a detecção automática (frágil)
inteiramente. Validado depois disso ponta a ponta contra os 2 arquivos .xlsx
reais (não só o fixture sintético dos testes automatizados) — resultado:
`canProceed: true`, 5540 estacas nos dois, faixas [1,2] no Crescente e [1,2,3]
no Decrescente (bate exatamente com o texto do documento original), sentido/
rodovia/km corretos vindos do texto "Local", avisos corretos de solução
`unresolved` (150 no Crescente, 90 no Decrescente, todos o valor "3" de
Revest.) e de intervalo irregular entre estacas.

## Nota de segurança
O pacote `xlsx` publicado no npm (SheetJS) tem 2 CVEs conhecidas sem correção
(prototype pollution + ReDoS). Como o app aceita arquivos `.xlsx` de qualquer
origem para parsing no navegador, isso é superfície de ataque real, não só
teórica. Resolvido instalando a build oficial patcheada direto do CDN da
SheetJS (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) em vez da
versão do npm — `npm audit` limpo.
