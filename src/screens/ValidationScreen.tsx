import { useState } from 'react';
import { createProjectFromImport } from '../db/projectService';
import type { ImportResult } from '../types/domain';

interface Props {
  resultado: ImportResult;
  onIniciarVistoria: (projectId: string) => void;
  onVoltar: () => void;
}

export function ValidationScreen({ resultado, onIniciarVistoria, onVoltar }: Props) {
  const [nomeProjeto, setNomeProjeto] = useState(resultado.projeto.nomeProjeto);
  const [salvando, setSalvando] = useState(false);
  const bloqueios = resultado.issues.filter((i) => i.severity === 'bloqueante');
  const avisos = resultado.issues.filter((i) => i.severity === 'aviso');

  async function iniciar() {
    setSalvando(true);
    const projectId = await createProjectFromImport({ ...resultado, projeto: { ...resultado.projeto, nomeProjeto } });
    onIniciarVistoria(projectId);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold text-neutral-900">Conferência antes de iniciar</h1>

      {bloqueios.length > 0 && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4">
          <p className="mb-2 font-bold text-red-800">Não é possível iniciar a vistoria:</p>
          <ul className="list-disc pl-5 text-red-800">
            {bloqueios.map((i, idx) => <li key={idx}>{i.message}</li>)}
          </ul>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4">
          <p className="mb-2 font-bold text-amber-900">Avisos (é possível seguir mesmo assim):</p>
          <ul className="list-disc pl-5 text-amber-900">
            {avisos.map((i, idx) => <li key={idx}>{i.message}</li>)}
          </ul>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-300 bg-white p-4 text-neutral-900">
        <dt className="text-sm text-neutral-600">Rodovia</dt>
        <dd className="text-right font-bold">{resultado.summary.rodovia ?? '—'}</dd>
        <dt className="text-sm text-neutral-600">Sentido</dt>
        <dd className="text-right font-bold">{resultado.summary.sentido ?? '—'}</dd>
        <dt className="text-sm text-neutral-600">Extensão</dt>
        <dd className="text-right font-bold">
          {resultado.summary.kmInicial ?? '—'} a {resultado.summary.kmFinal ?? '—'} km
        </dd>
        <dt className="text-sm text-neutral-600">Estacas</dt>
        <dd className="text-right font-bold">{resultado.summary.totalEstacas}</dd>
        <dt className="text-sm text-neutral-600">Faixas detectadas</dt>
        <dd className="text-right font-bold">{resultado.summary.faixasDetectadas.join(', ') || '—'}</dd>
        <dt className="text-sm text-neutral-600">Intervalo médio</dt>
        <dd className="text-right font-bold">
          {resultado.summary.intervaloMedioEstacas != null ? `${(resultado.summary.intervaloMedioEstacas * 1000).toFixed(0)} m` : '—'}
        </dd>
      </dl>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold text-neutral-700">Nome do projeto</span>
        <input
          value={nomeProjeto}
          onChange={(e) => setNomeProjeto(e.target.value)}
          className="h-12 rounded-lg border border-neutral-400 px-3 text-lg text-neutral-900"
        />
      </label>

      <div className="flex gap-3">
        <button onClick={onVoltar} className="h-12 flex-1 rounded-lg border border-neutral-400 text-neutral-700">
          Voltar
        </button>
        <button
          onClick={iniciar}
          disabled={bloqueios.length > 0 || salvando}
          className="h-12 flex-1 rounded-lg bg-neutral-900 font-bold text-white disabled:opacity-40"
        >
          {salvando ? 'Salvando…' : 'Iniciar vistoria'}
        </button>
      </div>
    </div>
  );
}
