import type { ParametrosFaixa } from '../types/domain';

// Limiares extraídos de verdade das regras de formatação condicional dos
// arquivos .xlsx reais (ver public/config/limiares-tolerancia.json) — nunca
// aproximados por valor numérico "achado" no ar. Item 7 da atualização de UX.

interface RegraNumerica {
  tipo: 'numerico';
  operador: '>=' | '<' | '>' | '<=';
  valor: number;
}
interface RegraNaoVazio {
  tipo: 'naoVazio';
}
type Regra = RegraNumerica | RegraNaoVazio;

export interface LimiaresToleranciaConfig {
  parametros: Partial<Record<keyof ParametrosFaixa, Regra>>;
}

const CONFIG_URL = '/config/limiares-tolerancia.json';

export async function loadLimiaresTolerancia(): Promise<LimiaresToleranciaConfig> {
  const res = await fetch(CONFIG_URL);
  if (!res.ok) throw new Error(`Falha ao carregar limiares de tolerância (${res.status})`);
  return res.json() as Promise<LimiaresToleranciaConfig>;
}

function isVazio(v: string | number | undefined): boolean {
  return v === undefined || (typeof v === 'string' && v.trim() === '');
}

function avaliarRegra(regra: Regra, valor: string | number | undefined): boolean {
  if (isVazio(valor)) return false; // célula vazia nunca é "fora de tolerância"
  if (regra.tipo === 'naoVazio') return true; // já sabemos que não está vazio
  if (typeof valor !== 'number') return false; // regra numérica não se aplica a texto
  switch (regra.operador) {
    case '>=': return valor >= regra.valor;
    case '>': return valor > regra.valor;
    case '<=': return valor <= regra.valor;
    case '<': return valor < regra.valor;
  }
}

/** Calcula, pra uma faixa, quais dos 9 parâmetros estão fora de tolerância
 * segundo o config extraído da planilha real. Parâmetro sem regra definida
 * nunca é marcado (fica `false`, nunca `undefined` tratado como alerta). */
export function calcularForaDeTolerancia(
  parametros: ParametrosFaixa,
  config: LimiaresToleranciaConfig,
): Partial<Record<keyof ParametrosFaixa, boolean>> {
  const resultado: Partial<Record<keyof ParametrosFaixa, boolean>> = {};
  for (const chave of Object.keys(config.parametros) as Array<keyof ParametrosFaixa>) {
    const regra = config.parametros[chave];
    if (!regra) continue;
    resultado[chave] = avaliarRegra(regra, parametros[chave]);
  }
  return resultado;
}
