import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NormalizedSolution } from '../../types/domain';
import { SolutionBadge } from '../SolutionBadge';
import { ErrosCadastraisPanel } from '../ErrosCadastraisPanel';

afterEach(cleanup);

const DESCONHECIDA: NormalizedSolution = { categoriaPai: 'Revest', subtipoCodigo: 'UNKNOWN', valorBruto: 3, normalizationStatus: 'unresolved' };
const CONHECIDA: NormalizedSolution = { categoriaPai: 'Revest', subtipoCodigo: 'M', valorBruto: 'M', normalizationStatus: 'recognized' };

describe('SolutionBadge — solução não reconhecida', () => {
  it('mostra o ícone de erro cadastral e o texto exato da célula', () => {
    render(<SolutionBadge solucao={DESCONHECIDA} />);
    expect(screen.getByRole('img', { name: 'Erro cadastral' })).toBeInTheDocument();
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getByText(/"3"/)).toBeInTheDocument();
  });

  it('solução reconhecida não ganha o ícone de erro', () => {
    render(<SolutionBadge solucao={CONHECIDA} />);
    expect(screen.queryByRole('img', { name: 'Erro cadastral' })).not.toBeInTheDocument();
  });
});

describe('ErrosCadastraisPanel', () => {
  it('lista coluna, texto da célula, contagem e exemplos de cada grupo', async () => {
    const onFechar = vi.fn();
    render(
      <ErrosCadastraisPanel
        grupos={[{ categoriaPai: 'Revest', coluna: 'Revest.', textoCelula: '3', ocorrencias: 108, exemplos: ['36+1820 F1', '36+1820 F2'] }]}
        onFechar={onFechar}
      />,
    );
    expect(screen.getByText('Erros cadastrais (108)')).toBeInTheDocument();
    expect(screen.getByText(/Coluna "Revest\.": célula "3"/)).toBeInTheDocument();
    expect(screen.getByText('108×')).toBeInTheDocument();
    expect(screen.getByText(/36\+1820 F1, 36\+1820 F2/)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByText('Fechar'));
    expect(onFechar).toHaveBeenCalled();
  });
});
