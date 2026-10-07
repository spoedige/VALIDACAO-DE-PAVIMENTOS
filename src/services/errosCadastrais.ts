import type { CategoriaPai, Estaca } from '../types/domain';

// Nome da coluna na planilha de origem (cabeçalho da linha 8 da aba Unifilar),
// só pra mostrar de onde veio a célula — nada aqui interpreta o valor.
const COLUNA_PLANILHA: Record<CategoriaPai, string> = {
  Estrutural: 'Estrutural',
  FresagemFuncional: 'Fresagem Funcional',
  FresagemEstrutural: 'Fresagem Estrutural',
  Selagem: 'Selagem',
  Microfres: 'Microfres.',
  FresagemFina: 'Fresagem Fina',
  Revest: 'Revest.',
};

export interface GrupoErroCadastral {
  categoriaPai: CategoriaPai;
  coluna: string;
  textoCelula: string;
  ocorrencias: number;
  exemplos: string[]; // primeiras estacas (numeroEstaca + faixa) onde apareceu
}

const MAX_EXEMPLOS = 4;

/**
 * Coleta toda solução que o normalizador não reconheceu (UNKNOWN), agrupada
 * por coluna + texto original da célula. Lê só `solucoesOriginais` — é erro
 * de cadastro da planilha, não alteração feita em campo.
 */
export function coletarErrosCadastrais(estacas: Estaca[]): GrupoErroCadastral[] {
  const grupos = new Map<string, GrupoErroCadastral>();
  for (const estaca of estacas) {
    for (const faixa of estaca.faixas) {
      for (const s of faixa.solucoesOriginais) {
        if (s.normalizationStatus !== 'unresolved') continue;
        const texto = String(s.valorBruto);
        const chave = `${s.categoriaPai}\u0000${texto}`;
        let g = grupos.get(chave);
        if (!g) {
          g = { categoriaPai: s.categoriaPai, coluna: COLUNA_PLANILHA[s.categoriaPai], textoCelula: texto, ocorrencias: 0, exemplos: [] };
          grupos.set(chave, g);
        }
        g.ocorrencias++;
        if (g.exemplos.length < MAX_EXEMPLOS) g.exemplos.push(`${estaca.numeroEstaca} F${faixa.numero}`);
      }
    }
  }
  return [...grupos.values()].sort((a, b) => b.ocorrencias - a.ocorrencias);
}
