import { useEffect, useState } from 'react';
import type { NormalizedSolution } from '../types/domain';
import { catalogoSubtipos, type NormalizationConfig } from '../services/normalizer';
import { corSolucao } from '../config/paleta';

interface Props {
  original: NormalizedSolution[];
  atual: NormalizedSolution[];
  notaAtual?: string;
  config: NormalizationConfig;
  onFechar: () => void;
  onConfirmar: (novasSolucoes: NormalizedSolution[], nota?: string) => void;
}

interface SelecaoItem {
  ativo: boolean;
  espessura: string;
}

function chaveSubtipo(categoriaPai: string, subtipoCodigo: string) {
  return `${categoriaPai}:${subtipoCodigo}`;
}

export function AlteracaoBottomSheet({ original, atual, notaAtual, config, onFechar, onConfirmar }: Props) {
  const catalogo = catalogoSubtipos(config);
  const catalogoChaves = new Set(catalogo.map((c) => chaveSubtipo(c.categoriaPai, c.subtipoCodigo)));

  // soluções presentes em "atual" que não correspondem a nenhum subtipo conhecido
  // (ex: unresolved/UNKNOWN) — preservadas verbatim, nunca descartadas silenciosamente
  // ao editar outra coisa na mesma faixa.
  const [naoEditaveis, setNaoEditaveis] = useState<NormalizedSolution[]>(
    atual.filter((s) => !catalogoChaves.has(chaveSubtipo(s.categoriaPai, s.subtipoCodigo))),
  );

  const [selecao, setSelecao] = useState<Record<string, SelecaoItem>>(() => {
    const inicial: Record<string, SelecaoItem> = {};
    for (const c of catalogo) {
      const key = chaveSubtipo(c.categoriaPai, c.subtipoCodigo);
      const existente = atual.find((s) => chaveSubtipo(s.categoriaPai, s.subtipoCodigo) === key);
      inicial[key] = { ativo: !!existente, espessura: existente?.valorComplementar !== undefined ? String(existente.valorComplementar).replace('.', ',') : '' };
    }
    return inicial;
  });
  const [nota, setNota] = useState(notaAtual ?? '');

  function toggle(key: string) {
    setSelecao((s) => ({ ...s, [key]: { ...s[key], ativo: !s[key].ativo } }));
  }
  function setEspessura(key: string, valor: string) {
    setSelecao((s) => ({ ...s, [key]: { ...s[key], espessura: valor } }));
  }
  function limparFaixa() {
    setSelecao((s) => Object.fromEntries(Object.keys(s).map((k) => [k, { ativo: false, espessura: '' }])));
    setNaoEditaveis([]);
    setNota('');
  }

  function montarNovasSolucoes(): NormalizedSolution[] {
    const novas: NormalizedSolution[] = [...naoEditaveis];
    for (const c of catalogo) {
      const key = chaveSubtipo(c.categoriaPai, c.subtipoCodigo);
      const item = selecao[key];
      if (!item?.ativo) continue;
      const espessuraNum = c.precisaEspessura ? Number(item.espessura.replace(',', '.')) : undefined;
      if (c.precisaEspessura && (item.espessura.trim() === '' || Number.isNaN(espessuraNum))) continue; // sem valor válido, não inclui
      novas.push({
        categoriaPai: c.categoriaPai,
        subtipoCodigo: c.subtipoCodigo,
        valorComplementar: espessuraNum,
        valorBruto: espessuraNum ?? c.subtipoCodigo,
        normalizationStatus: 'recognized',
      });
    }
    return novas;
  }

  const [confirmado, setConfirmado] = useState<NormalizedSolution[] | null>(null);
  const [desfazerVisivel, setDesfazerVisivel] = useState(false);

  useEffect(() => {
    if (!desfazerVisivel) return;
    const t = setTimeout(() => { setDesfazerVisivel(false); onFechar(); }, 5000);
    return () => clearTimeout(t);
  }, [desfazerVisivel, onFechar]);

  function confirmar() {
    const novas = montarNovasSolucoes();
    onConfirmar(novas, nota.trim() === '' ? undefined : nota.trim());
    setConfirmado(novas);
    setDesfazerVisivel(true);
  }

  function desfazer() {
    onConfirmar(original, undefined);
    setDesfazerVisivel(false);
    onFechar();
  }

  if (desfazerVisivel && confirmado) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-neutral-300 bg-neutral-900 p-4 text-white">
        <span className="font-bold">Alteração salva</span>
        <button onClick={desfazer} className="h-12 rounded-lg bg-white px-4 font-bold text-neutral-900">
          Desfazer
        </button>
      </div>
    );
  }

  const categorias = [...new Set(catalogo.map((c) => c.categoriaPai))];

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onFechar}>
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-neutral-500">ORIGINAL</p>
            <div className="flex flex-wrap gap-1">
              {original.length === 0 && <span className="text-sm text-neutral-400">—</span>}
              {original.map((s, i) => (
                <span key={i} className="rounded border-2 px-1.5 py-0.5 text-xs font-bold" style={{ borderColor: corSolucao(s.categoriaPai, s.subtipoCodigo).cor }}>
                  {s.normalizationStatus === 'unresolved' ? 'UNKNOWN' : s.subtipoCodigo}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-neutral-500">ATUAL</p>
            <div className="flex flex-wrap gap-1">
              {atual.length === 0 && <span className="text-sm text-neutral-400">—</span>}
              {atual.map((s, i) => (
                <span key={i} className="rounded border-2 px-1.5 py-0.5 text-xs font-bold" style={{ borderColor: corSolucao(s.categoriaPai, s.subtipoCodigo).cor }}>
                  {s.normalizationStatus === 'unresolved' ? 'UNKNOWN' : s.subtipoCodigo}
                </span>
              ))}
            </div>
          </div>
        </div>

        {naoEditaveis.length > 0 && (
          <p className="mb-3 rounded bg-neutral-100 p-2 text-xs text-neutral-600">
            {naoEditaveis.length} valor(es) não mapeado(s) (UNKNOWN) desta faixa serão mantidos como estão. Use "Limpar faixa" para removê-los.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {categorias.map((cat) => (
            <div key={cat}>
              <p className="mb-1 text-sm font-bold text-neutral-700">{cat}</p>
              <div className="flex flex-wrap gap-2">
                {catalogo.filter((c) => c.categoriaPai === cat).map((c) => {
                  const key = chaveSubtipo(c.categoriaPai, c.subtipoCodigo);
                  const item = selecao[key];
                  const cor = corSolucao(c.categoriaPai, c.subtipoCodigo).cor;
                  return (
                    <div key={key} className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => toggle(key)}
                        className="flex h-14 min-w-16 items-center justify-center rounded-lg border-4 px-3 text-base font-bold"
                        style={{ borderColor: cor, background: item.ativo ? cor + '33' : 'white' }}
                      >
                        {c.subtipoCodigo}
                      </button>
                      {item.ativo && c.precisaEspessura && (
                        <input
                          value={item.espessura}
                          onChange={(e) => setEspessura(key, e.target.value)}
                          placeholder="cm"
                          inputMode="decimal"
                          className="h-10 w-16 rounded border border-neutral-400 text-center text-sm"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-sm font-bold text-neutral-700">Nota de campo (opcional)</span>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="rounded-lg border border-neutral-400 p-2" />
        </label>

        <div className="mt-4 flex gap-3">
          <button onClick={limparFaixa} className="h-12 flex-1 rounded-lg border-2 border-red-500 font-bold text-red-600">
            Limpar faixa
          </button>
          <button onClick={onFechar} className="h-12 flex-1 rounded-lg border border-neutral-400 text-neutral-700">
            Cancelar
          </button>
          <button onClick={confirmar} className="h-12 flex-1 rounded-lg bg-neutral-900 font-bold text-white">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
