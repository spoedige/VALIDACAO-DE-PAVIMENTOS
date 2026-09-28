import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Estaca, ImportResult } from '../../types/domain';
import type { NormalizationConfig } from '../../services/normalizer';
import { db } from '../../db/schema';
import { createProjectFromImport } from '../../db/projectService';
import { VistoriaScreen } from '../VistoriaScreen';

// Regressão pós-rodada-3 (correção urgente): confirmar uma alteração de
// solução (botão "Concluir") parou de refletir na aba "Alterações" (lista e
// contador). Este teste sobe a tela inteira contra o Dexie real
// (fake-indexeddb), exatamente o caminho que o operador usa, pra pegar
// qualquer divergência entre a gravação e a re-renderização da aba.

const CONFIG: NormalizationConfig = {
  categorias: {
    Estrutural: { regras: [{ tipo: 'sigla', valor: 'REX', subtipoCodigo: 'REX', descricao: 'Reconstrução' }] },
  },
};

function estaca(id: number): Estaca {
  return {
    id,
    numeroEstaca: `0+${id * 20}`,
    hodometroContinuo: id * 0.02,
    hodometroMarco: `0+${id * 20}`,
    latitude: null,
    longitude: null,
    tipoSecao: null,
    marcoKm: null,
    observacaoOriginal: null,
    dreno: 'ausente',
    faixas: [{ numero: 1, parametros: {}, solucoesOriginais: [] }],
  };
}

function buildImportResult(estacas: Estaca[]): ImportResult {
  return {
    projeto: {
      projectId: crypto.randomUUID(),
      sourceFileHash: 'hash-teste',
      sourceFileName: 'teste.xlsx',
      nomeProjeto: 'Projeto Teste',
      metadata: { rodovia: 'BR-050/MG', sentido: 'Crescente', kmInicial: 0, kmFinal: 1, localBruto: null, dataImport: new Date().toISOString() },
    },
    estacas,
    summary: { rodovia: 'BR-050/MG', sentido: 'Crescente', kmInicial: 0, kmFinal: 1, totalEstacas: estacas.length, faixasDetectadas: [1], intervaloMedioEstacas: 0.02 },
    issues: [],
    canProceed: true,
  };
}

afterEach(async () => {
  cleanup();
  await db.projects.clear();
  await db.stations.clear();
  await db.fieldLogs.clear();
  await db.fieldChangeHistory.clear();
});

describe('VistoriaScreen — Alterações reflete alteração confirmada (regressão pós-rodada-3)', () => {
  it('confirmar uma alteração de solução (Confirmar + Concluir) aparece imediatamente na aba Alterações, na lista e no contador', async () => {
    const user = userEvent.setup();
    const projectId = await createProjectFromImport(buildImportResult([estaca(0)]));

    render(
      <VistoriaScreen
        projectId={projectId}
        config={CONFIG}
        limiaresTolerancia={null}
        onVoltar={() => {}}
        onExportar={() => {}}
      />,
    );

    // espera a tela sair do "Carregando…" inicial
    await waitFor(() => expect(screen.getByText('Alterar')).toBeInTheDocument());

    await user.click(screen.getByText('Alterar'));
    const modal = await screen.findByText('Solução original do projeto');
    const modalContainer = modal.closest('.fixed')!;

    await user.click(within(modalContainer as HTMLElement).getByText('Reconstrução'));
    await user.click(within(modalContainer as HTMLElement).getByText('Confirmar'));
    await waitFor(() => expect(within(modalContainer as HTMLElement).getByText('Faixa 1 salva')).toBeInTheDocument());
    await user.click(within(modalContainer as HTMLElement).getByText('Concluir'));

    // aba some a folha de edição
    await waitFor(() => expect(screen.queryByText('Solução original do projeto')).not.toBeInTheDocument());

    // contador na aba já reflete a alteração confirmada
    const abaAlteracoes = screen.getByRole('button', { name: /Alterações/ });
    expect(abaAlteracoes).toHaveTextContent('Alterações (1)');

    await user.click(abaAlteracoes);

    // a lista mostra o evento recém-confirmado, sem precisar recarregar a tela
    expect(await screen.findByText('REX', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Faixa 1')).toBeInTheDocument();
    expect(screen.getByText('Reverter')).toBeInTheDocument();
  });
});
