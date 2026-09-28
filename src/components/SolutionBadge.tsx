import type { NormalizedSolution } from '../types/domain';
import { corSolucao } from '../config/paleta';

function formatarComplementar(valor: number | undefined): string | null {
  if (valor === undefined) return null;
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}cm`;
}

/**
 * Chip compacto de uma linha só (seção 10 da atualização de UX): código +
 * espessura entre parênteses/traço quando couber, ex: "Fres. Func. · 4,0cm".
 * Badge = informação, botão = ação — por isso saturação e borda ficam mais
 * discretas que o botão "Alterar" (borda fina de 1-2px, não 4px; sem
 * preenchimento saturado), não só a fonte menor.
 */
export function SolutionBadge({ solucao }: { solucao: NormalizedSolution }) {
  const { labelCurto, label, cor } = corSolucao(solucao.categoriaPai, solucao.subtipoCodigo);
  const unresolved = solucao.normalizationStatus === 'unresolved';
  const complementar = unresolved ? String(solucao.valorBruto) : formatarComplementar(solucao.valorComplementar);
  const titulo = unresolved ? `Não reconhecido — valor original: ${solucao.valorBruto}` : label;

  return (
    <span
      title={titulo}
      className="inline-flex h-7 max-w-full items-center gap-1 overflow-hidden rounded-full border bg-white px-2 text-sm font-bold text-neutral-800"
      style={{ borderColor: cor }}
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
      {/* item 6: dentro de uma coluna de largura fixa (painel de consulta), o
          nome precisa truncar, nunca empurrar a coluna vizinha */}
      <span className="truncate">{unresolved ? 'UNKNOWN' : labelCurto}</span>
      {complementar && <span className="shrink-0 font-normal text-neutral-500">· {complementar}</span>}
    </span>
  );
}
