import type { CadastroSolucao, NormalizedSolution } from '../types/domain';
import { PREFIXO_PERSONALIZADA } from '../config/paleta';

function numeroDaCelula(texto: string): number | undefined {
  const n = Number(texto.trim().replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) ? n : undefined;
}

/**
 * Aplica os cadastros do usuário sobre as soluções lidas do banco. Só mexe em
 * solução não reconhecida cuja coluna + texto da célula tenham cadastro; o
 * resto passa intacto. Também desfaz o inverso: solução própria já gravada
 * num registro de campo, cujo cadastro foi removido, volta a ser UNKNOWN em
 * vez de ficar com uma legenda que não existe mais.
 */
export function aplicarCadastros(solucoes: NormalizedSolution[], cadastros: CadastroSolucao[] | undefined): NormalizedSolution[] {
  const lista = cadastros ?? [];
  return solucoes.map((s) => {
    if (s.normalizationStatus === 'unresolved') {
      const texto = String(s.valorBruto);
      const cadastro = lista.find((c) => c.categoriaPai === s.categoriaPai && c.textoCelula === texto);
      if (!cadastro) return s;
      if (cadastro.destino.tipo === 'personalizada') {
        return { categoriaPai: s.categoriaPai, subtipoCodigo: `${PREFIXO_PERSONALIZADA}${texto}`, valorBruto: s.valorBruto, normalizationStatus: 'recognized' };
      }
      const { categoriaPai, subtipoCodigo, comEspessura } = cadastro.destino;
      const espessura = comEspessura ? numeroDaCelula(texto) : undefined;
      return {
        categoriaPai,
        subtipoCodigo,
        ...(espessura !== undefined ? { valorComplementar: espessura } : {}),
        valorBruto: s.valorBruto,
        normalizationStatus: 'recognized',
      };
    }
    if (s.subtipoCodigo.startsWith(PREFIXO_PERSONALIZADA)) {
      const texto = s.subtipoCodigo.slice(PREFIXO_PERSONALIZADA.length);
      const ainda = lista.some((c) => c.categoriaPai === s.categoriaPai && c.textoCelula === texto && c.destino.tipo === 'personalizada');
      if (!ainda) return { categoriaPai: s.categoriaPai, subtipoCodigo: 'UNKNOWN', valorBruto: s.valorBruto, normalizationStatus: 'unresolved' };
    }
    return s;
  });
}

/** Legendas próprias do projeto, no formato que a paleta registra. */
export function legendasPersonalizadasDe(cadastros: CadastroSolucao[] | undefined) {
  return (cadastros ?? []).flatMap((c) =>
    c.destino.tipo === 'personalizada' ? [{ categoriaPai: c.categoriaPai, textoCelula: c.textoCelula, nome: c.destino.nome, cor: c.destino.cor }] : [],
  );
}
