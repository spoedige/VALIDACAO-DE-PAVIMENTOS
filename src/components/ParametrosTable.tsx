import type { Estaca, ParametrosFaixa } from '../types/domain';

const LINHAS: Array<{ key: keyof ParametrosFaixa; label: string }> = [
  { key: 'iri', label: 'IRI (m/km)' },
  { key: 'percDefeitos', label: '% Defeitos' },
  { key: 'atrMax', label: 'ATR Máx' },
  { key: 'oprd', label: 'O / P / R / D' },
  { key: 'exafe', label: 'EX / AF / E' },
  { key: 'hr', label: 'HR (cm)' },
  { key: 'd0', label: 'D0 (0,01 mm)' },
  { key: 'rc', label: 'Rc (m)' },
  { key: 'd120', label: 'D120 (0,01 mm)' },
];

function formatarValor(v: string | number | undefined): string {
  if (v === undefined) return '—';
  return typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : v;
}

/**
 * Modo Parâmetros — seção 7: tabela transposta, parâmetros nas linhas,
 * faixas nas colunas. Linhas zebradas e divisor vertical entre colunas de
 * faixa (item 4 da rodada 7) — só pra facilitar a leitura, nenhuma regra de
 * negócio depende disso.
 */
export function ParametrosTable({ estaca }: { estaca: Estaca }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300">
            <th className="p-2 text-left font-bold text-neutral-500">Parâmetro</th>
            {estaca.faixas.map((f, i) => (
              <th key={f.numero} className={`p-2 text-right font-bold text-neutral-900 ${i > 0 ? 'border-l border-neutral-300' : ''}`}>
                Faixa {f.numero}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LINHAS.map((linha, i) => (
            <tr key={linha.key} className={`border-b border-neutral-100 ${i % 2 === 1 ? 'bg-neutral-50' : ''}`}>
              <td className="p-2 text-neutral-600">{linha.label}</td>
              {estaca.faixas.map((f, j) => (
                <td key={f.numero} className={`p-2 text-right font-bold tabular-nums text-neutral-900 ${j > 0 ? 'border-l border-neutral-200' : ''}`}>
                  {formatarValor(f.parametros[linha.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
