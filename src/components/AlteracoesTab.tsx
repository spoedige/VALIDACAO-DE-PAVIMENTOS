import type { Estaca, FieldChangeHistoryEntry, NormalizedSolution } from '../types/domain';
import { SolutionBadge } from './SolutionBadge';

interface Props {
  estacas: Estaca[];
  historico: FieldChangeHistoryEntry[];
  onReverter: (eventoId: number) => void;
}

function ListaSolucoes({ solucoes }: { solucoes: NormalizedSolution[] }) {
  if (solucoes.length === 0) return <span className="text-xs text-neutral-400">— (nenhuma)</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {solucoes.map((s, i) => (
        <SolutionBadge key={i} solucao={s} />
      ))}
    </div>
  );
}

function formatarTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Aba "Alterações" (item 5 da 3ª rodada): lista todo evento de troca de
 * solução em campo. Reverter nunca apaga o registro — o evento some da
 * lista de "ativos" (ordenados por timestamp desc.) e passa pra seção de já
 * revertidos, mantido como histórico. O estado atual da faixa é recalculado
 * a partir de toda a cadeia (ver `calcularEstadoAtualDaCadeia`), então essa
 * tela não decide isso — só dispara `onReverter` e mostra o resultado já
 * persistido em `historico` (recarregado pelo componente pai).
 */
export function AlteracoesTab({ estacas, historico, onReverter }: Props) {
  const numeroEstacaPorId = new Map(estacas.map((e) => [e.id, e.numeroEstaca]));
  const ordenado = [...historico].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const ativos = ordenado.filter((e) => !e.revertidoEm);
  const revertidos = ordenado.filter((e) => e.revertidoEm);

  if (ordenado.length === 0) {
    return <p className="rounded-lg border border-neutral-300 bg-white p-4 text-sm text-neutral-500">Nenhuma alteração de solução em campo ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {ativos.length === 0 && <p className="text-sm text-neutral-500">Nenhuma alteração ativa — todas foram revertidas.</p>}
        {ativos.map((evento) => (
          <EventoCard key={evento.id} evento={evento} numeroEstaca={numeroEstacaPorId.get(evento.estacaId) ?? `#${evento.estacaId}`} onReverter={onReverter} />
        ))}
      </div>

      {revertidos.length > 0 && (
        <details className="rounded-lg border border-neutral-300 bg-neutral-50 p-3">
          <summary className="cursor-pointer text-sm font-bold text-neutral-600">Revertidas ({revertidos.length})</summary>
          <div className="mt-2 flex flex-col gap-2">
            {revertidos.map((evento) => (
              <EventoCard key={evento.id} evento={evento} numeroEstaca={numeroEstacaPorId.get(evento.estacaId) ?? `#${evento.estacaId}`} onReverter={onReverter} revertido />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function EventoCard({
  evento,
  numeroEstaca,
  onReverter,
  revertido,
}: {
  evento: FieldChangeHistoryEntry;
  numeroEstaca: string;
  onReverter: (eventoId: number) => void;
  revertido?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${revertido ? 'border-neutral-300 bg-white opacity-60' : 'border-neutral-300 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-neutral-900">Estaca {numeroEstaca}</span>
          <span className="text-xs font-medium text-neutral-500">Faixa {evento.faixa}</span>
        </div>
        <span className="text-xs text-neutral-500">{formatarTimestamp(evento.timestamp)}</span>
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <span className="w-10 shrink-0 pt-1 text-[11px] font-bold text-neutral-500">De</span>
          <ListaSolucoes solucoes={evento.de} />
        </div>
        <div className="flex items-start gap-2">
          <span className="w-10 shrink-0 pt-1 text-[11px] font-bold text-neutral-500">Para</span>
          <ListaSolucoes solucoes={evento.para} />
        </div>
        {evento.nota && <p className="text-xs italic text-neutral-600">"{evento.nota}"</p>}
      </div>

      {revertido ? (
        <p className="mt-2 text-[11px] font-medium text-neutral-500">Revertido em {formatarTimestamp(evento.revertidoEm!)}</p>
      ) : (
        <button
          onClick={() => onReverter(evento.id!)}
          className="mt-2 h-8 rounded-lg border border-neutral-400 px-3 text-xs font-bold text-neutral-700"
        >
          Reverter
        </button>
      )}
    </div>
  );
}
