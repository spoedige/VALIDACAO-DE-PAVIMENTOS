import type { CategoriaPai, NormalizedSolution, SolutionRaw } from '../types/domain';

interface RegraPrefixoComEspessura {
  tipo: 'prefixoComEspessura';
  prefixo: string;
  subtipoCodigo: string;
  descricao?: string;
}

interface RegraNumeroPuro {
  tipo: 'numeroPuro';
  subtipoCodigo: string;
  descricao?: string;
}

interface RegraSigla {
  tipo: 'sigla';
  valor: string;
  subtipoCodigo: string;
  descricao?: string;
}

type Regra = RegraPrefixoComEspessura | RegraNumeroPuro | RegraSigla;

export interface NormalizationConfig {
  categorias: Partial<Record<CategoriaPai, { regras: Regra[] }>>;
}

const CONFIG_URL = '/config/normalizacao-config.json';

export async function loadNormalizationConfig(): Promise<NormalizationConfig> {
  const res = await fetch(CONFIG_URL);
  if (!res.ok) throw new Error(`Falha ao carregar tabela de normalização (${res.status})`);
  return res.json() as Promise<NormalizationConfig>;
}

function isVazio(v: SolutionRaw | null | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function parseNumeroBr(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function unknown(categoriaPai: CategoriaPai, valorBruto: SolutionRaw): NormalizedSolution {
  return { categoriaPai, subtipoCodigo: 'UNKNOWN', valorBruto, normalizationStatus: 'unresolved' };
}

/**
 * Normaliza um valor bruto de célula de solução, condicionado à categoria-pai da
 * coluna onde apareceu. Nunca infere um subtipo por coincidência com código de
 * outra categoria — regra crítica da seção 3 do documento de especificação.
 * Retorna `null` apenas quando a célula está genuinamente vazia (a estaca/faixa
 * não tem essa solução, não é um "unresolved").
 */
export function normalizeSolution(
  categoriaPai: CategoriaPai,
  valorBruto: SolutionRaw | null | undefined,
  config: NormalizationConfig,
): NormalizedSolution | null {
  if (isVazio(valorBruto)) return null;
  const bruto = valorBruto as SolutionRaw;
  const regras = config.categorias[categoriaPai]?.regras ?? [];

  for (const regra of regras) {
    if (regra.tipo === 'numeroPuro') {
      const num = typeof bruto === 'number' ? bruto : parseNumeroBr(String(bruto));
      if (num === null) continue;
      return {
        categoriaPai,
        subtipoCodigo: regra.subtipoCodigo,
        valorComplementar: num,
        valorBruto: bruto,
        normalizationStatus: 'recognized',
      };
    }
    if (regra.tipo === 'sigla' && typeof bruto === 'string' && bruto.trim() === regra.valor) {
      return { categoriaPai, subtipoCodigo: regra.subtipoCodigo, valorBruto: bruto, normalizationStatus: 'recognized' };
    }
    if (regra.tipo === 'prefixoComEspessura' && typeof bruto === 'string') {
      const texto = bruto.trim();
      if (texto.toUpperCase().startsWith(regra.prefixo.toUpperCase())) {
        const resto = texto.slice(regra.prefixo.length);
        const espessura = parseNumeroBr(resto);
        if (espessura === null) continue;
        return {
          categoriaPai,
          subtipoCodigo: regra.subtipoCodigo,
          valorComplementar: espessura,
          valorBruto: bruto,
          normalizationStatus: 'recognized',
        };
      }
    }
  }

  return unknown(categoriaPai, bruto);
}
