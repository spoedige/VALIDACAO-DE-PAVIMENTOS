import type { FieldChangeHistoryEntry, NormalizedSolution } from '../types/domain';

/**
 * Recalcula o estado atual de uma faixa/estaca a partir da cadeia de eventos
 * válidos (não revertidos), preservando as alterações posteriores à que foi
 * revertida — item 5 da 3ª rodada de UX. Nunca um reset fixo pro original
 * nem "volta pro penúltimo estado": é sempre o `para` do último evento não
 * revertido da cadeia, em ordem cronológica; sem nenhum evento válido, volta
 * pra solução original do projeto.
 *
 * Exemplo do próprio prompt: original → A → B → C, reverter B (evento
 * intermediário) → cadeia válida restante é [orig→A, B→C] → resultado é C
 * (o último `para` que sobrou), não A.
 */
export function calcularEstadoAtualDaCadeia(
  eventosDaFaixa: FieldChangeHistoryEntry[],
  solucaoOriginal: NormalizedSolution[],
): NormalizedSolution[] {
  const validos = eventosDaFaixa
    .filter((e) => !e.revertidoEm)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (validos.length === 0) return solucaoOriginal;
  return validos[validos.length - 1].para;
}
