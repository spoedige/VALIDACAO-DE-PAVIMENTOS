import { useEffect, useState } from 'react';
import { listProjects, type ProjetoComAtividade } from '../db/projectService';

interface Props {
  onAbrirProjeto: (projectId: string) => void;
  onNovoProjeto: () => void;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ListaProjetosScreen({ onAbrirProjeto, onNovoProjeto }: Props) {
  const [projetos, setProjetos] = useState<ProjetoComAtividade[] | null>(null);

  useEffect(() => {
    listProjects().then(setProjetos);
  }, []);

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

      {projetos === null && <p className="text-neutral-600">Carregando…</p>}
      {projetos?.length === 0 && (
        <p className="rounded-lg border border-neutral-300 bg-white p-6 text-center text-neutral-600">
          Nenhum projeto importado ainda neste aparelho.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {projetos?.map((p) => (
          <li key={p.projectId}>
            <button
              onClick={() => onAbrirProjeto(p.projectId)}
              className="flex w-full min-h-12 flex-col gap-1 rounded-lg border border-neutral-300 bg-white p-4 text-left active:bg-neutral-50"
            >
              <span className="text-lg font-bold text-neutral-900">{p.nomeProjeto}</span>
              <span className="text-sm text-neutral-600">
                {p.metadata.rodovia ?? 'Rodovia não identificada'}
                {p.metadata.sentido ? ` — ${p.metadata.sentido}` : ''}
              </span>
              <span className="text-xs text-neutral-500">Última atividade: {formatarData(p.ultimaAtividade)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
