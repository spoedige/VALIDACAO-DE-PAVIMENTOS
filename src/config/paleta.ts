// Paleta de cores fixa — seção 8 do documento. Chave: `${categoriaPai}:${subtipoCodigo}`.
// "FresagemFuncional" e "FresagemEstrutural" como subtipoCodigo são a própria
// categoria (a coluna não tem sigla própria — código "x" na tabela original —
// então a cor documentada da categoria é usada diretamente, sem inventar sigla).
export interface EntradaPaleta {
  label: string; // nome completo — usado na legenda, sempre por extenso (seção 6)
  labelCurto: string; // só pro badge compacto (seção 10) — nunca substitui o nome completo na legenda
  cor: string;
  origem: 'legenda oficial' | 'inventada, sem fonte oficial';
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

export function corSolucao(categoriaPai: string, subtipoCodigo: string): EntradaPaleta {
  if (subtipoCodigo === 'UNKNOWN') return { ...COR_UNKNOWN, origem: 'inventada, sem fonte oficial' };
  return PALETA_SOLUCOES[`${categoriaPai}:${subtipoCodigo}`] ?? { ...COR_UNKNOWN, origem: 'inventada, sem fonte oficial' };
}
