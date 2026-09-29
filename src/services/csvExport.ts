import type { Estaca, FieldLog, NormalizedSolution, Projeto } from '../types/domain';

// Exportação CSV — seção 10. Uma linha por estaca/faixa que teve alteração
// e/ou nota. Lido diretamente de fieldLogs (estado atual), nunca do histórico.

function formatarSolucoes(solucoes: NormalizedSolution[]): string {
  return solucoes
    .map((s) => (s.normalizationStatus === 'unresolved' ? `UNKNOWN:${s.valorBruto}` : s.subtipoCodigo))
    .join('|');
}

function csvEscape(valor: string): string {
  if (/[",\n;]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

const CABECALHO = ['Rodovia', 'Sentido', 'Km', 'Estaca', 'Hodometro', 'Faixa', 'Latitude', 'Longitude', 'SolucaoOriginal', 'SolucaoCampo', 'DataHora', 'Observacao'];

export function buildCsv(projeto: Projeto, estacas: Estaca[], fieldLogs: FieldLog[]): string {
  const estacaPorId = new Map(estacas.map((e) => [e.id, e]));
  const linhas = [CABECALHO.join(',')];

  for (const log of fieldLogs) {
    const estaca = estacaPorId.get(log.estacaId);
    if (!estaca) continue;
    const faixa = estaca.faixas.find((f) => f.numero === log.faixa);
    const original = faixa?.solucoesOriginais ?? [];
    const km = (estaca.hodometroContinuo + (projeto.metadata.kmInicial ?? 0)).toFixed(3).replace('.', ',');

    linhas.push(
      [
        csvEscape(projeto.metadata.rodovia ?? ''),
        csvEscape(projeto.metadata.sentido ?? ''),
        km,
        csvEscape(estaca.numeroEstaca),
        String(estaca.hodometroContinuo),
        String(log.faixa),
        estaca.latitude != null ? String(estaca.latitude) : '',
        estaca.longitude != null ? String(estaca.longitude) : '',
        csvEscape(formatarSolucoes(original)),
        csvEscape(formatarSolucoes(log.solucoesCampo)),
        log.lastModifiedAt,
        csvEscape(log.notaCampo ?? ''),
      ].join(','),
    );
  }

  return linhas.join('\n');
}

/**
 * Download direto (sem passar pela folha de compartilhamento) — item 5 da
 * rodada 7: em alguns aparelhos, a folha de compartilhamento nativa não tem
 * um jeito óbvio de "salvar no aparelho", então o operador precisa de um
 * botão explícito de baixar, não só do fallback automático quando cancela o
 * compartilhamento.
 */
export function downloadArquivo(conteudo: string, nomeArquivo: string, tipoMime: string): void {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareOrDownloadCsv(csv: string, nomeArquivo: string): Promise<'compartilhado' | 'baixado'> {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const file = new File([blob], nomeArquivo, { type: 'text/csv' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nomeArquivo });
      return 'compartilhado';
    } catch {
      // usuário cancelou o share sheet ou falhou — cai pro download direto
    }
  }

  downloadArquivo(csv, nomeArquivo, 'text/csv;charset=utf-8');
  return 'baixado';
}
