import type { NormalizedSolution } from '../types/domain';
import { corSolucao } from '../config/paleta';

function formatarComplementar(valor: number | undefined): string | null {
  if (valor === undefined) return null;
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cm`;
}

/** Badge de duas linhas — seção 7: código em cima, espessura/percentual embaixo,
 * fundo claro com borda espessa na cor oficial (nunca fundo sólido colorido). */
export function SolutionBadge({ solucao }: { solucao: NormalizedSolution }) {
  const { label, cor } = corSolucao(solucao.categoriaPai, solucao.subtipoCodigo);
  const linha2 = solucao.normalizationStatus === 'unresolved' ? String(solucao.valorBruto) : formatarComplementar(solucao.valorComplementar);
  const titulo = solucao.normalizationStatus === 'unresolved' ? `Não reconhecido — valor original: ${solucao.valorBruto}` : label;

  return (
    <span
      title={titulo}
      className="inline-flex min-h-12 min-w-16 flex-col items-center justify-center rounded-md border-4 bg-white px-2 py-1"
      style={{ borderColor: cor }}
    >
      <span className="text-base font-bold text-neutral-900">{solucao.normalizationStatus === 'unresolved' ? 'UNKNOWN' : solucao.subtipoCodigo}</span>
      {linha2 && <span className="text-xs text-neutral-600">{linha2}</span>}
    </span>
  );
}
