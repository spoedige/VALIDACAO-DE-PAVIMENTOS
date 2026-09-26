// Paleta de cores fixa — seção 8 do documento. Chave: `${categoriaPai}:${subtipoCodigo}`.
// "FresagemFuncional" e "FresagemEstrutural" como subtipoCodigo são a própria
// categoria (a coluna não tem sigla própria — código "x" na tabela original —
// então a cor documentada da categoria é usada diretamente, sem inventar sigla).
export interface EntradaPaleta {
  label: string;
  cor: string;
  origem: 'legenda oficial' | 'inventada, sem fonte oficial';
}

export const PALETA_SOLUCOES: Record<string, EntradaPaleta> = {
  'Revest:M': { label: 'Microrrevest. Asfáltico à Frio (Micro)', cor: '#A9CF8F', origem: 'legenda oficial' },
  'Estrutural:RPX': { label: 'Reparo Profundo', cor: '#FFC000', origem: 'legenda oficial' },
  'Estrutural:REX': { label: 'Reconstrução', cor: '#C00000', origem: 'legenda oficial' },
  'FresagemFina:FF': { label: 'Fresagem Fina', cor: '#CC99FF', origem: 'legenda oficial' },
  'FresagemFuncional:FresagemFuncional': { label: 'Fresagem Funcional', cor: '#9DC3E6', origem: 'legenda oficial' },
  'FresagemEstrutural:FresagemEstrutural': { label: 'Fresagem Estrutural', cor: '#F8CBAD', origem: 'legenda oficial' },
  'Selagem:ST': { label: 'Selagem de Trincas', cor: '#E87BA4', origem: 'inventada, sem fonte oficial' },
  'Microfres:MFS': { label: 'Microfresagem', cor: '#1BAF7A', origem: 'inventada, sem fonte oficial' },
};

export const COR_UNKNOWN = { label: 'Não reconhecido', cor: '#8a8a8a' };

export const CORES_DRENO = {
  raso: '#4EA6FC',
  profundo: '#1F4E79',
  ausente: '#C3C2B7',
} as const;

export function corSolucao(categoriaPai: string, subtipoCodigo: string): EntradaPaleta {
  if (subtipoCodigo === 'UNKNOWN') return { ...COR_UNKNOWN, origem: 'inventada, sem fonte oficial' };
  return PALETA_SOLUCOES[`${categoriaPai}:${subtipoCodigo}`] ?? { ...COR_UNKNOWN, origem: 'inventada, sem fonte oficial' };
}
