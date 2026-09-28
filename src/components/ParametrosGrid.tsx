import type { ParametrosFaixa } from '../types/domain';

const CAMPOS: Array<{ key: keyof ParametrosFaixa; label: string }> = [
  { key: 'iri', label: 'IRI' },
  { key: 'percDefeitos', label: '%Def' },
  { key: 'atrMax', label: 'ATR' },
  { key: 'oprd', label: 'OPRD' },
  { key: 'exafe', label: 'EXAFE' },
  { key: 'hr', label: 'HR' },
  { key: 'd0', label: 'D0' },
  { key: 'rc', label: 'Rc' },
  { key: 'd120', label: 'D120' },
];

function formatarValor(v: string | number | undefined): string {
  if (v === undefined) return '—';
  return typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : v;
}

interface Props {
  parametros: ParametrosFaixa;
  /**
   * Sinaliza célula fora da faixa aceitável (planilha original destaca com
   * fundo rosado). Não há limiar clínico definido no documento pra nenhum
   * dos 9 parâmetros — fica como capacidade visual pronta, sem regra
   * inventada; um mapa de limiares real precisa vir do engenheiro
   * responsável antes de ligar isso de verdade.
   */
  foraDeTolerancia?: Partial<Record<keyof ParametrosFaixa, boolean>>;
}

/**
 * Grade completa dos 9 parâmetros por faixa (seção 10 da atualização de UX):
 * par label:valor na mesma linha, layout denso, sem borda por célula (só a
 * borda fina externa do card), altura menor que a seção de solução acima.
 */
export function ParametrosGrid({ parametros, foraDeTolerancia }: Props) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
      {CAMPOS.map(({ key, label }) => (
        <div
          key={key}
          className={`flex items-baseline justify-between gap-1 rounded px-1 text-[11px] ${foraDeTolerancia?.[key] ? 'bg-rose-100' : ''}`}
        >
          <span className="text-neutral-500">{label}</span>
          <span className="font-bold tabular-nums text-neutral-900">{formatarValor(parametros[key])}</span>
        </div>
      ))}
    </div>
  );
}
