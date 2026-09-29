import { useRef, useState } from 'react';
import { getProject, getStations, getFieldLogsByProject } from '../db/projectService';
import { buildCsv, shareOrDownloadCsv, downloadArquivo } from '../services/csvExport';
import { buildCheckpoint, checkpointHashMatches, restoreCheckpoint } from '../db/checkpoint';
import type { Checkpoint } from '../types/domain';

interface Props {
  projectId: string;
  onVoltar: () => void;
}

export function ExportScreen({ projectId, onVoltar }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [avisoHash, setAvisoHash] = useState<{ checkpoint: Checkpoint } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function montarCsv(): Promise<{ nome: string; csv: string } | null> {
    const projeto = await getProject(projectId);
    if (!projeto) return null;
    const estacas = await getStations(projectId);
    const fieldLogs = await getFieldLogsByProject(projectId);
    if (fieldLogs.length === 0) {
      setStatus('Nenhuma estaca/faixa foi alterada — não há nada para exportar ainda.');
      return null;
    }
    return { nome: `${projeto.nomeProjeto}.csv`, csv: buildCsv(projeto, estacas, fieldLogs) };
  }

  async function compartilharCsv() {
    const dados = await montarCsv();
    if (!dados) return;
    const resultado = await shareOrDownloadCsv(dados.csv, dados.nome);
    setStatus(resultado === 'compartilhado' ? 'CSV compartilhado.' : 'CSV baixado.');
  }

  async function baixarCsv() {
    const dados = await montarCsv();
    if (!dados) return;
    downloadArquivo(dados.csv, dados.nome, 'text/csv;charset=utf-8');
    setStatus('CSV baixado.');
  }

  async function montarCheckpoint(): Promise<{ nome: string; json: string } | null> {
    const projeto = await getProject(projectId);
    if (!projeto) return null;
    const checkpoint = await buildCheckpoint(projeto);
    return { nome: `${projeto.nomeProjeto}-checkpoint.json`, json: JSON.stringify(checkpoint, null, 2) };
  }

  async function compartilharCheckpoint() {
    const dados = await montarCheckpoint();
    if (!dados) return;
    const resultado = await shareOrDownloadCsv(dados.json, dados.nome);
    setStatus(resultado === 'compartilhado' ? 'Checkpoint compartilhado.' : 'Checkpoint baixado.');
  }

  async function baixarCheckpoint() {
    const dados = await montarCheckpoint();
    if (!dados) return;
    downloadArquivo(dados.json, dados.nome, 'application/json');
    setStatus('Checkpoint baixado.');
  }

  async function aoSelecionarCheckpoint(file: File) {
    const texto = await file.text();
    const checkpoint = JSON.parse(texto) as Checkpoint;
    const projeto = await getProject(projectId);
    if (projeto && !checkpointHashMatches(checkpoint, projeto.sourceFileHash)) {
      setAvisoHash({ checkpoint });
      return;
    }
    await restoreCheckpoint(checkpoint);
    setStatus('Checkpoint restaurado.');
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <button onClick={onVoltar} className="h-12 w-fit rounded-lg border border-neutral-400 px-4 text-neutral-700">
        ← Voltar
      </button>
      <h1 className="text-2xl font-bold text-neutral-900">Exportar</h1>

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-3">
        <span className="text-sm font-bold text-neutral-500">CSV (estacas/faixas alteradas)</span>
        <div className="flex gap-2">
          <button onClick={compartilharCsv} className="h-14 flex-1 rounded-lg bg-neutral-900 font-bold text-white">
            Compartilhar
          </button>
          <button onClick={baixarCsv} className="h-14 flex-1 rounded-lg border-2 border-neutral-900 font-bold text-neutral-900">
            Baixar arquivo
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-3">
        <span className="text-sm font-bold text-neutral-500">Checkpoint (backup completo do projeto)</span>
        <div className="flex gap-2">
          <button onClick={compartilharCheckpoint} className="h-14 flex-1 rounded-lg bg-neutral-900 font-bold text-white">
            Compartilhar
          </button>
          <button onClick={baixarCheckpoint} className="h-14 flex-1 rounded-lg border-2 border-neutral-900 font-bold text-neutral-900">
            Baixar arquivo
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) aoSelecionarCheckpoint(file);
        }}
      />
      <button onClick={() => inputRef.current?.click()} className="h-14 rounded-lg border border-neutral-400 font-bold text-neutral-700">
        Importar Checkpoint
      </button>

      {avisoHash && (
        <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4">
          <p className="mb-2 font-bold text-amber-900">
            Este checkpoint pertence a outra planilha (sourceFileHash diferente da carregada neste projeto). Aplicar mesmo assim pode
            misturar dados de projetos diferentes.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setAvisoHash(null)} className="h-12 flex-1 rounded-lg border border-neutral-400">
              Cancelar
            </button>
            <button
              onClick={async () => {
                await restoreCheckpoint(avisoHash.checkpoint, { force: true });
                setAvisoHash(null);
                setStatus('Checkpoint restaurado (hash divergente, forçado).');
              }}
              className="h-12 flex-1 rounded-lg bg-red-600 font-bold text-white"
            >
              Aplicar mesmo assim
            </button>
          </div>
        </div>
      )}

      {status && <p className="rounded-lg border border-neutral-300 bg-white p-3 text-neutral-800">{status}</p>}
    </div>
  );
}
