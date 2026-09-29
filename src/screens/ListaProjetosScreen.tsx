import { useEffect, useState } from 'react';
import { listProjects, deleteProject, type ProjetoComAtividade } from '../db/projectService';

interface Props {
  onAbrirProjeto: (projectId: string) => void;
  onNovoProjeto: () => void;
  armazenamentoPersistente: boolean | null;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ListaProjetosScreen({ onAbrirProjeto, onNovoProjeto, armazenamentoPersistente }: Props) {
  const [projetos, setProjetos] = useState<ProjetoComAtividade[] | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null);

  useEffect(() => {
    listProjects().then(setProjetos);
  }, []);

  async function apagar(projectId: string) {
    await deleteProject(projectId);
    setConfirmandoExclusao(null);
    setProjetos(await listProjects());
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Meus projetos</h1>
        <button
          onClick={onNovoProjeto}
          className="h-12 rounded-lg bg-neutral-900 px-5 text-base font-bold text-white active:bg-neutral-700"
        >
          + Novo projeto
        </button>
      </div>

      {armazenamentoPersistente !== null && (
        <p className={`mb-3 text-xs font-bold ${armazenamentoPersistente ? 'text-emerald-700' : 'text-amber-700'}`}>
          Armazenamento persistente: {armazenamentoPersistente ? 'concedido' : 'não concedido (dados podem ser apagados pelo navegador sob pressão de espaço)'}
        </p>
      )}

      {projetos === null && <p className="text-neutral-600">Carregando…</p>}
      {projetos?.length === 0 && (
        <p className="rounded-lg border border-neutral-300 bg-white p-6 text-center text-neutral-600">
          Nenhum projeto importado ainda neste aparelho.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {projetos?.map((p) => (
          <li key={p.projectId} className="rounded-lg border border-neutral-300 bg-white">
            {confirmandoExclusao === p.projectId ? (
              <div className="p-4">
                <p className="mb-3 text-sm font-bold text-neutral-800">Apagar "{p.nomeProjeto}"? Todos os dados desse projeto neste aparelho serão perdidos, sem volta.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmandoExclusao(null)} className="h-11 flex-1 rounded-lg border border-neutral-400 text-sm font-bold text-neutral-700">
                    Cancelar
                  </button>
                  <button onClick={() => apagar(p.projectId)} className="h-11 flex-1 rounded-lg bg-red-600 text-sm font-bold text-white">
                    Apagar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-12 items-stretch gap-1 p-1">
                <button
                  onClick={() => onAbrirProjeto(p.projectId)}
                  className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg p-3 text-left active:bg-neutral-50"
                >
                  <span className="truncate text-lg font-bold text-neutral-900">{p.nomeProjeto}</span>
                  <span className="text-sm text-neutral-600">
                    {p.metadata.rodovia ?? 'Rodovia não identificada'}
                    {p.metadata.sentido ? ` — ${p.metadata.sentido}` : ''}
                  </span>
                  <span className="text-xs text-neutral-500">Última atividade: {formatarData(p.ultimaAtividade)}</span>
                </button>
                <button
                  onClick={() => setConfirmandoExclusao(p.projectId)}
                  aria-label={`Apagar projeto ${p.nomeProjeto}`}
                  className="h-11 w-11 shrink-0 self-center rounded-lg border border-neutral-300 text-lg text-red-600 active:bg-red-50"
                >
                  🗑
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
