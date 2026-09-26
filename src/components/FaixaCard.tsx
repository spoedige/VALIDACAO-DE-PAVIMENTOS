import { useState } from 'react';
import type { NormalizedSolution } from '../types/domain';
import { SolutionBadge } from './SolutionBadge';

interface Props {
  numero: number;
  solucoesAtuais: NormalizedSolution[];
  nota?: string;
  onAlterar: () => void;
}

export function FaixaCard({ numero, solucoesAtuais, nota, onAlterar }: Props) {
  const [notaAberta, setNotaAberta] = useState(false);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-2">
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-neutral-900">Faixa {numero}</span>
        {nota && (
          <button
            onClick={() => setNotaAberta((v) => !v)}
            aria-label="Ver nota de campo"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-base"
          >
            💬
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {solucoesAtuais.length === 0 && <span className="text-sm text-neutral-500">Sem solução</span>}
        {solucoesAtuais.map((s, i) => (
          <SolutionBadge key={i} solucao={s} />
        ))}
      </div>

      {notaAberta && nota && <p className="rounded bg-amber-50 p-2 text-sm text-neutral-800">{nota}</p>}

      <button
        onClick={onAlterar}
        className="mt-auto h-12 min-w-12 rounded-lg border border-neutral-400 text-sm font-bold text-neutral-800 active:bg-neutral-100"
      >
        Alterar
      </button>
    </div>
  );
}
