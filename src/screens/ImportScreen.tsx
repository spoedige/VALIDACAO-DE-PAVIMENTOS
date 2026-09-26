import { useRef, useState } from 'react';
import { importExcelFile } from '../services/excelAdapter';
import type { NormalizationConfig } from '../services/normalizer';
import type { ImportResult } from '../types/domain';

interface Props {
  config: NormalizationConfig;
  onImportado: (resultado: ImportResult) => void;
  onCancelar: () => void;
}

export function ImportScreen({ config, onImportado, onCancelar }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function aoSelecionarArquivo(file: File) {
    setCarregando(true);
    setErro(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const resultado = await importExcelFile(arrayBuffer, file.name, config);
      onImportado(resultado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha inesperada ao ler o arquivo.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold text-neutral-900">Novo projeto</h1>
      <p className="text-neutral-700">Selecione a planilha .xlsx padrão de projeto (um único sentido da rodovia).</p>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) aoSelecionarArquivo(file);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={carregando}
        className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-neutral-400 bg-white text-lg font-bold text-neutral-700 disabled:opacity-50"
      >
        {carregando ? 'Lendo planilha…' : 'Toque para escolher o arquivo .xlsx'}
      </button>

      {erro && <p className="rounded-lg border border-red-400 bg-red-50 p-3 font-bold text-red-800">{erro}</p>}

      <button onClick={onCancelar} className="h-12 rounded-lg border border-neutral-400 text-neutral-700">
        Cancelar
      </button>
    </div>
  );
}
