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
   * Fora da faixa aceitável, segundo os limiares reais extraídos das regras
   * de formatação condicional dos arquivos .xlsx originais (ver
   * `services/tolerancia.ts` e `public/config/limiares-tolerancia.json`,
   * item 7 da atualização de UX) — nunca um limiar aproximado no código.
   */
  foraDeTolerancia?: Partial<Record<keyof ParametrosFaixa, boolean>>;
}

/**
 * Grade completa dos 9 parâmetros por faixa: par label:valor na mesma linha,
 * layout denso, sem borda por célula (só a borda fina externa do card). 2
 * colunas × 4 linhas + o 9º parâmetro (D120) ocupando a linha inteira, pra
 * não sobrar célula vazia (item 8 da atualização de UX).
 */
export function ParametrosGrid({ parametros, foraDeTolerancia }: Props) {
  const [oitoPrimeiros, ultimo] = [CAMPOS.slice(0, 8), CAMPOS[8]];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
      {oitoPrimeiros.map(({ key, label }) => (
        <Celula key={key} label={label} valor={parametros[key]} alerta={foraDeTolerancia?.[key]} />
      ))}
      <div className={`col-span-2 flex items-baseline justify-between gap-1 rounded px-1 text-[11px] ${foraDeTolerancia?.[ultimo.key] ? 'bg-rose-100' : ''}`}>
        <span className="text-neutral-500">{ultimo.label}</span>
        <span className="font-bold tabular-nums text-neutral-900">{formatarValor(parametros[ultimo.key])}</span>
      </div>
    </div>
  );
}

function Celula({ label, valor, alerta }: { label: string; valor: string | number | undefined; alerta?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-1 rounded px-1 text-[11px] ${alerta ? 'bg-rose-100' : ''}`}>
      <span className="text-neutral-500">{label}</span>
      <span className="font-bold tabular-nums text-neutral-900">{formatarValor(valor)}</span>
    </div>
  );
}
