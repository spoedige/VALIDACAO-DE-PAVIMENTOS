import { useState } from 'react';
import type { NormalizedSolution, ParametrosFaixa } from '../types/domain';
import { SolutionBadge } from './SolutionBadge';
import { ParametrosGrid } from './ParametrosGrid';
import { calcularForaDeTolerancia, type LimiaresToleranciaConfig } from '../services/tolerancia';

interface Props {
  numero: number;
  solucoesAtuais: NormalizedSolution[];
  parametros: ParametrosFaixa;
  limiaresTolerancia: LimiaresToleranciaConfig | null;
  nota?: string;
  // undefined enquanto o card exibe uma estaca CONSULTADA (não a ativa) —
  // "Alterar" só pode operar sobre a estaca ativa (seção 2 do documento
  // original), nunca sobre a posição consultada na régua, então o botão
  // fica desabilitado em vez de editar a estaca errada.
  onAlterar?: () => void;
}

/**
 * Regra fixa de layout (seção 9.5): título + "Alterar" numa linha própria,
 * chips de solução sempre numa linha abaixo (quebrando quando não couberem),
 * nunca dividindo espaço com o botão nem sendo cortados por ele.
 */
export function FaixaCard({ numero, solucoesAtuais, parametros, limiaresTolerancia, nota, onAlterar }: Props) {
  const [notaAberta, setNotaAberta] = useState(false);
  const foraDeTolerancia = limiaresTolerancia ? calcularForaDeTolerancia(parametros, limiaresTolerancia) : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-2">
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-[22px] items-center gap-1">
          {/* título encurta pra "F1" quando o espaço aperta (seção 9.5) — nunca
              deixa o botão "Alterar" com menos que sua altura mínima de toque */}
          <span className="truncate text-sm font-semibold text-ocre-dark sm:hidden">F{numero}</span>
          <span className="hidden truncate text-sm font-semibold text-ocre-dark sm:inline">Faixa {numero}</span>
          {nota && (
            <button
              onClick={() => setNotaAberta((v) => !v)}
              aria-label="Ver nota de campo"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs"
            >
              💬
            </button>
          )}
        </div>
        <button
          onClick={onAlterar}
          disabled={!onAlterar}
          title={onAlterar ? undefined : 'Volte pra estaca ativa (GPS) pra alterar'}
          className="h-11 shrink-0 rounded-lg border border-neutral-400 px-2 text-xs font-bold text-neutral-800 active:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 sm:h-11 sm:px-3 sm:text-sm"
        >
          Alterar
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {solucoesAtuais.length === 0 && <span className="text-xs text-neutral-500">Sem solução</span>}
        {solucoesAtuais.map((s, i) => (
          <SolutionBadge key={i} solucao={s} />
        ))}
      </div>

      {notaAberta && nota && <p className="rounded bg-amber-50 p-2 text-xs text-neutral-800">{nota}</p>}

      <div className="border-t border-neutral-100 pt-1.5">
        <ParametrosGrid parametros={parametros} foraDeTolerancia={foraDeTolerancia} />
      </div>
    </div>
  );
}
