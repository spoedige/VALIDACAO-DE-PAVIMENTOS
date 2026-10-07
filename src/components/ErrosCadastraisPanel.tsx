import { useState } from 'react';
import type { CadastroSolucao } from '../types/domain';
import type { GrupoErroCadastral } from '../services/errosCadastrais';
import type { SubtipoDisponivel } from '../services/normalizer';
import { corSolucao } from '../config/paleta';

interface Props {
  grupos: GrupoErroCadastral[]; // células ainda não reconhecidas
  cadastros: CadastroSolucao[]; // o que o usuário já resolveu
  legendas: SubtipoDisponivel[]; // legendas existentes (derivadas do config de normalização)
  onSalvar: (cadastro: CadastroSolucao) => void | Promise<void>;
  onRemover: (cadastro: CadastroSolucao) => void | Promise<void>;
  onFechar: () => void;
}

// só atalhos de cor pra escolher mais rápido em campo; o seletor livre fica ao lado
const CORES_SUGERIDAS = ['#0EA5E9', '#7C3AED', '#EA580C', '#0D9488', '#DB2777', '#65A30D', '#475569'];
const COR_PADRAO = CORES_SUGERIDAS[0];

function numeroDaCelula(texto: string): number | null {
  const n = Number(texto.trim().replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) ? n : null;
}

function descreverDestino(c: CadastroSolucao): { texto: string; cor: string } {
  if (c.destino.tipo === 'personalizada') return { texto: `${c.destino.nome} (legenda própria)`, cor: c.destino.cor };
  const { label, cor } = corSolucao(c.destino.categoriaPai, c.destino.subtipoCodigo);
  const numero = c.destino.comEspessura ? numeroDaCelula(c.textoCelula) : null;
  return { texto: numero !== null ? `${label} (${numero} cm)` : label, cor };
}

function nomeColuna(g: GrupoErroCadastral | CadastroSolucao): string {
  return 'coluna' in g ? g.coluna : g.categoriaPai;
}

/**
 * Erros cadastrais: células de solução que a planilha trouxe e a tabela de
 * normalização não conhece (viram UNKNOWN). O operador resolve aqui, no
 * próprio projeto: passa a valer como uma legenda existente ou ganha nome e
 * cor próprios. O texto original da célula nunca é alterado no banco.
 */
export function ErrosCadastraisPanel({ grupos, cadastros, legendas, onSalvar, onRemover, onFechar }: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const total = grupos.reduce((soma, g) => soma + g.ocorrencias, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onFechar}>
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-neutral-200 p-4">
          <h2 className="text-base font-bold text-neutral-900">Erros cadastrais ({total})</h2>
          <p className="text-xs text-neutral-600">Soluções da planilha que o app não reconhece. O texto abaixo é o conteúdo exato da célula.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {grupos.length === 0 && <p className="mb-2 text-sm text-neutral-600">Nenhuma solução pendente.</p>}

          <ul>
            {grupos.map((g) => {
              const chave = `${g.categoriaPai}:${g.textoCelula}`;
              return (
                <li key={chave} className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
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

                  {editando === chave ? (
                    <FormularioCadastro
                      grupo={g}
                      legendas={legendas}
                      onCancelar={() => setEditando(null)}
                      onSalvar={async (cadastro) => {
                        await onSalvar(cadastro);
                        setEditando(null);
                      }}
                    />
                  ) : (
                    <button onClick={() => setEditando(chave)} className="mt-2 h-10 rounded-lg bg-neutral-900 px-4 text-sm font-bold text-white">
                      Resolver
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {cadastros.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-500">Já resolvidos neste projeto</h3>
              <ul>
                {cadastros.map((c) => {
                  const { texto, cor } = descreverDestino(c);
                  return (
                    <li key={`${c.categoriaPai}:${c.textoCelula}`} className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-neutral-300 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-neutral-900">
                          "{c.textoCelula}" <span className="font-normal text-neutral-500">({nomeColuna(c)})</span>
                        </p>
                        <p className="flex items-center gap-1 truncate text-xs text-neutral-700">
                          <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
                          {texto}
                        </p>
                      </div>
                      <button
                        onClick={() => onRemover(c)}
                        aria-label={`Desfazer cadastro de "${c.textoCelula}"`}
                        className="h-9 shrink-0 rounded-lg border border-neutral-400 px-3 text-xs font-bold text-neutral-700"
                      >
                        Desfazer
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-neutral-200 p-3">
          <button onClick={onFechar} className="h-11 w-full rounded-lg border border-neutral-400 text-sm font-bold text-neutral-800">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function FormularioCadastro({
  grupo,
  legendas,
  onSalvar,
  onCancelar,
}: {
  grupo: GrupoErroCadastral;
  legendas: SubtipoDisponivel[];
  onSalvar: (cadastro: CadastroSolucao) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [modo, setModo] = useState<'legenda' | 'personalizada'>('legenda');
  const [legendaEscolhida, setLegendaEscolhida] = useState('');
  const [comEspessura, setComEspessura] = useState(true);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(COR_PADRAO);
  const [salvando, setSalvando] = useState(false);

  const legenda = legendas.find((l) => `${l.categoriaPai}:${l.subtipoCodigo}` === legendaEscolhida);
  const numero = numeroDaCelula(grupo.textoCelula);
  const podeUsarEspessura = legenda?.precisaEspessura === true && numero !== null;
  const valido = modo === 'legenda' ? legenda !== undefined : nome.trim() !== '';

  async function salvar() {
    if (!valido) return;
    setSalvando(true);
    const destino: CadastroSolucao['destino'] =
      modo === 'legenda' && legenda
        ? { tipo: 'legenda', categoriaPai: legenda.categoriaPai, subtipoCodigo: legenda.subtipoCodigo, ...(podeUsarEspessura && comEspessura ? { comEspessura: true } : {}) }
        : { tipo: 'personalizada', nome: nome.trim(), cor };
    await onSalvar({ categoriaPai: grupo.categoriaPai, textoCelula: grupo.textoCelula, destino });
    setSalvando(false);
  }

  return (
    <div className="mt-3 rounded-lg border border-neutral-300 bg-white p-3">
      <div className="mb-3 flex gap-1" role="radiogroup" aria-label="Como resolver">
        <button
          role="radio"
          aria-checked={modo === 'legenda'}
          onClick={() => setModo('legenda')}
          className={`h-9 flex-1 rounded-lg text-xs font-bold ${modo === 'legenda' ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700'}`}
        >
          Usar legenda existente
        </button>
        <button
          role="radio"
          aria-checked={modo === 'personalizada'}
          onClick={() => setModo('personalizada')}
          className={`h-9 flex-1 rounded-lg text-xs font-bold ${modo === 'personalizada' ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700'}`}
        >
          Criar legenda própria
        </button>
      </div>

      {modo === 'legenda' ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-neutral-600">
            Passa a valer como
            <select value={legendaEscolhida} onChange={(e) => setLegendaEscolhida(e.target.value)} className="h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm font-normal text-neutral-900">
              <option value="">Escolha uma legenda…</option>
              {legendas.map((l) => (
                <option key={`${l.categoriaPai}:${l.subtipoCodigo}`} value={`${l.categoriaPai}:${l.subtipoCodigo}`}>
                  {corSolucao(l.categoriaPai, l.subtipoCodigo).label}
                </option>
              ))}
            </select>
          </label>
          {legenda && (
            <p className="flex items-center gap-1 text-xs text-neutral-700">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: corSolucao(legenda.categoriaPai, legenda.subtipoCodigo).cor }} />
              Cor da legenda oficial
            </p>
          )}
          {podeUsarEspessura && (
            <label className="flex items-center gap-2 text-xs text-neutral-800">
              <input type="checkbox" checked={comEspessura} onChange={(e) => setComEspessura(e.target.checked)} className="h-4 w-4" />
              Usar o número da célula ({numero}) como espessura em cm
            </label>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-neutral-600">
            Nome da legenda
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: nome da solução"
              className="h-10 rounded-lg border border-neutral-300 px-2 text-sm font-normal text-neutral-900"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-neutral-600">Cor</span>
            {CORES_SUGERIDAS.map((c) => (
              <button
                key={c}
                onClick={() => setCor(c)}
                aria-label={`Cor ${c}`}
                aria-pressed={cor === c}
                className={`h-8 w-8 rounded-full border-2 ${cor === c ? 'border-neutral-900' : 'border-white ring-1 ring-neutral-300'}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} aria-label="Escolher outra cor" className="h-8 w-10 rounded border border-neutral-300 bg-white p-0.5" />
          </div>
          <p className="flex items-center gap-1 text-xs text-neutral-700">
            Prévia:
            <span className="inline-flex h-6 items-center gap-1 rounded-full border bg-white px-2 text-xs font-bold text-neutral-800" style={{ borderColor: cor }}>
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />
              {nome.trim() || 'nome'}
            </span>
          </p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button onClick={onCancelar} className="h-10 flex-1 rounded-lg border border-neutral-400 text-sm font-bold text-neutral-700">
          Cancelar
        </button>
        <button onClick={salvar} disabled={!valido || salvando} className="h-10 flex-1 rounded-lg bg-neutral-900 text-sm font-bold text-white disabled:opacity-40">
          Salvar
        </button>
      </div>
    </div>
  );
}
