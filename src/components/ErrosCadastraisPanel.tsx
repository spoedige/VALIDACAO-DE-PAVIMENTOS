import type { GrupoErroCadastral } from '../services/errosCadastrais';

interface Props {
  grupos: GrupoErroCadastral[];
  onFechar: () => void;
}

/**
 * Lista de "erros cadastrais": células de solução que a planilha trouxe mas
 * a tabela de normalização não conhece (viram UNKNOWN). Mostra o texto exato
 * da célula, pra quem cadastra a planilha corrigir o dado ou pra incluir o
 * código novo em normalizacao-config.json — o app nunca adivinha o que é.
 */
export function ErrosCadastraisPanel({ grupos, onFechar }: Props) {
  const total = grupos.reduce((soma, g) => soma + g.ocorrencias, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onFechar}>
      <div className="flex max-h-[80vh] w-full flex-col rounded-t-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-neutral-200 p-4">
          <h2 className="text-base font-bold text-neutral-900">Erros cadastrais ({total})</h2>
          <p className="text-xs text-neutral-600">Soluções da planilha que o app não reconhece. O texto abaixo é o conteúdo exato da célula.</p>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto p-3">
          {grupos.map((g) => (
            <li key={`${g.categoriaPai}:${g.textoCelula}`} className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-neutral-900">
                  Coluna "{g.coluna}": célula "{g.textoCelula}"
                </span>
                <span className="shrink-0 text-xs font-bold text-amber-800">{g.ocorrencias}×</span>
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                Ex.: {g.exemplos.join(', ')}
                {g.ocorrencias > g.exemplos.length ? '…' : ''}
              </p>
            </li>
          ))}
        </ul>

        <div className="shrink-0 border-t border-neutral-200 p-3">
          <button onClick={onFechar} className="h-11 w-full rounded-lg bg-neutral-900 text-sm font-bold text-white">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
