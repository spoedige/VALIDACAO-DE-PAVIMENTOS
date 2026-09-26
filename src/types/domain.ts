// Modelo de domínio — ver seção 4 do documento de especificação.
// Tipos somente de dados; nenhuma lógica de negócio aqui.

export type CategoriaPai =
  | 'Estrutural'
  | 'FresagemFuncional'
  | 'FresagemEstrutural'
  | 'Selagem'
  | 'Microfres'
  | 'FresagemFina'
  | 'Revest';

export type NormalizationStatus = 'recognized' | 'unresolved' | 'invalid';

export type SolutionRaw = string | number;

export interface NormalizedSolution {
  categoriaPai: CategoriaPai;
  subtipoCodigo: string; // ex: 'RPX', 'MFS', 'M', ou 'UNKNOWN'
  valorComplementar?: number; // espessura/percentual quando existir
  valorBruto: SolutionRaw; // valor original da célula, sempre preservado
  normalizationStatus: NormalizationStatus;
}

export type DrenoStatus = 'raso' | 'profundo' | 'ausente';

export interface ParametrosFaixa {
  iri?: number;
  percDefeitos?: number;
  atrMax?: number;
  oprd?: string | number;
  exafe?: string | number;
  hr?: number;
  d0?: number;
  rc?: number;
  d120?: number;
}

export interface FaixaEstaca {
  numero: number;
  parametros: ParametrosFaixa;
  solucoesOriginais: NormalizedSolution[];
}

export interface Estaca {
  id: number; // sequencial interno, estável, nunca recalculado após o import
  numeroEstaca: string; // = hodometroMarco, ex: "35+620" — opaco, nunca reformatado
  hodometroContinuo: number;
  hodometroMarco: string;
  latitude: number | null;
  longitude: number | null;
  tipoSecao: string | null; // marcador de observação (Marco Km, OAE, OAE Rígida, Túnel) ou null
  marcoKm: string | null;
  observacaoOriginal: string | null;
  dreno: DrenoStatus;
  faixas: FaixaEstaca[];
}

export interface ProjetoMetadata {
  rodovia: string | null;
  sentido: 'Crescente' | 'Decrescente' | null;
  kmInicial: number | null;
  kmFinal: number | null;
  localBruto: string | null; // texto original da célula "Local", sempre preservado
  dataImport: string; // ISO
}

export interface Projeto {
  projectId: string; // UUID, gerado na importação, nunca muda
  sourceFileHash: string; // SHA-256 dos bytes brutos do .xlsx original
  sourceFileName: string;
  nomeProjeto: string; // editável pelo usuário
  metadata: ProjetoMetadata;
}

export interface FieldLog {
  id?: number; // autoincrement Dexie
  projectId: string;
  estacaId: number;
  faixa: number;
  solucoesCampo: NormalizedSolution[];
  notaCampo?: string;
  firstModifiedAt: string; // ISO
  lastModifiedAt: string; // ISO
}

export interface FieldChangeHistoryEntry {
  id?: number; // autoincrement Dexie
  projectId: string;
  timestamp: string; // ISO
  estacaId: number;
  faixa: number;
  de: NormalizedSolution[];
  para: NormalizedSolution[];
  nota?: string;
}

export type ValidationSeverity = 'bloqueante' | 'aviso';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ImportSummary {
  rodovia: string | null;
  sentido: 'Crescente' | 'Decrescente' | null;
  kmInicial: number | null;
  kmFinal: number | null;
  totalEstacas: number;
  faixasDetectadas: number[];
  intervaloMedioEstacas: number | null;
}

export interface ImportResult {
  projeto: Projeto;
  estacas: Estaca[];
  summary: ImportSummary;
  issues: ValidationIssue[];
  canProceed: boolean;
}

export interface Checkpoint {
  schemaVersion: number;
  projectId: string;
  sourceFileHash: string;
  metadata: ProjetoMetadata;
  nomeProjeto: string;
  estacas: Estaca[];
  fieldLogs: FieldLog[];
  fieldChangeHistory: FieldChangeHistoryEntry[];
  exportedAt: string; // ISO
}
