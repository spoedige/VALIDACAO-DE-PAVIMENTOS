import type { NormalizedSolution } from '../types/domain';

// Comparação por CONJUNTO, ignorando ordem — seção 7: "[RPX, ST] e [ST, RPX] são
// o mesmo conjunto". Duas soluções são a "mesma" se tiverem a mesma categoria,
// o mesmo subtipo e a mesma espessura/percentual complementar (quando houver).
function chave(s: NormalizedSolution): string {
  return `${s.categoriaPai}:${s.subtipoCodigo}:${s.valorComplementar ?? ''}`;
}

export function solutionSetsEqual(a: NormalizedSolution[], b: NormalizedSolution[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a.map(chave));
  const setB = new Set(b.map(chave));
  if (setA.size !== setB.size) return false;
  for (const k of setA) if (!setB.has(k)) return false;
  return true;
}
