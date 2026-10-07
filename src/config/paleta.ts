// Paleta de cores fixa — seção 8 do documento. Chave: `${categoriaPai}:${subtipoCodigo}`.
// "FresagemFuncional" e "FresagemEstrutural" como subtipoCodigo são a própria
// categoria (a coluna não tem sigla própria — código "x" na tabela original —
// então a cor documentada da categoria é usada diretamente, sem inventar sigla).
export interface EntradaPaleta {
  label: string; // nome completo — usado na legenda, sempre por extenso (seção 6)
  labelCurto: string; // só pro badge compacto (seção 10) — nunca substitui o nome completo na legenda
  cor: string;
  origem: 'legenda oficial' | 'inventada, sem fonte oficial' | 'cadastrada pelo usuário';
}

export const PALETA_SOLUCOES: Record<string, EntradaPaleta> = {
  'Revest:M': { label: 'Microrrevest. Asfáltico à Frio (Micro)', labelCurto: 'Micro', cor: '#A9CF8F', origem: 'legenda oficial' },
  'Estrutural:RPX': { label: 'Reparo Profundo', labelCurto: 'RPX', cor: '#FFC000', origem: 'legenda oficial' },
  'Estrutural:REX': { label: 'Reconstrução', labelCurto: 'REX', cor: '#C00000', origem: 'legenda oficial' },
  'FresagemFina:FF': { label: 'Fresagem Fina', labelCurto: 'FF', cor: '#CC99FF', origem: 'legenda oficial' },
  'FresagemFuncional:FresagemFuncional': { label: 'Fresagem Funcional', labelCurto: 'Fres. Func.', cor: '#9DC3E6', origem: 'legenda oficial' },
  'FresagemEstrutural:FresagemEstrutural': { label: 'Fresagem Estrutural', labelCurto: 'Fres. Estr.', cor: '#F8CBAD', origem: 'legenda oficial' },
  'Selagem:ST': { label: 'Selagem de Trincas', labelCurto: 'ST', cor: '#E87BA4', origem: 'inventada, sem fonte oficial' },
  'Microfres:MFS': { label: 'Microfresagem', labelCurto: 'MFS', cor: '#1BAF7A', origem: 'inventada, sem fonte oficial' },
};

export const COR_UNKNOWN = { label: 'Não reconhecido', labelCurto: 'UNKNOWN', cor: '#8a8a8a' };

export const CORES_DRENO = {
  raso: '#4EA6FC',
  profundo: '#1F4E79',
  ausente: '#C3C2B7',
} as const;

// Legendas próprias: criadas pelo usuário (nome + cor) pra uma célula de
// solução que a planilha trouxe e a tabela de normalização não conhece. Ficam
// fora de PALETA_SOLUCOES de propósito — a paleta oficial continua vindo só da
// legenda do documento; isto é uma camada por projeto, registrada ao abrir o
// projeto (ver `registrarLegendasPersonalizadas`) e nunca misturada com as
// cores oficiais.
export const PREFIXO_PERSONALIZADA = 'PERSONALIZADA:';

const personalizadas = new Map<string, EntradaPaleta>();

export function chavePersonalizada(categoriaPai: string, textoCelula: string): string {
  return `${categoriaPai}:${PREFIXO_PERSONALIZADA}${textoCelula}`;
}

/** Substitui o conjunto inteiro (cada projeto aberto tem o seu). */
export function registrarLegendasPersonalizadas(
  cadastros: ReadonlyArray<{ categoriaPai: string; textoCelula: string; nome: string; cor: string }>,
): void {
  personalizadas.clear();
  for (const c of cadastros) {
    personalizadas.set(chavePersonalizada(c.categoriaPai, c.textoCelula), {
      label: c.nome,
      labelCurto: c.nome,
      cor: c.cor,
      origem: 'cadastrada pelo usuário',
    });
  }
}

/** Legenda oficial + as próprias do projeto aberto — o que a legenda da régua lista. */
export function entradasLegenda(): EntradaPaleta[] {
  return [...Object.values(PALETA_SOLUCOES), ...personalizadas.values()];
}

export function corSolucao(categoriaPai: string, subtipoCodigo: string): EntradaPaleta {
  if (subtipoCodigo === 'UNKNOWN') return { ...COR_UNKNOWN, origem: 'inventada, sem fonte oficial' };
  const chave = `${categoriaPai}:${subtipoCodigo}`;
  return PALETA_SOLUCOES[chave] ?? personalizadas.get(chave) ?? { ...COR_UNKNOWN, origem: 'inventada, sem fonte oficial' };
}
