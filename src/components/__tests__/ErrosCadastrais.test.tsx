import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CadastroSolucao, NormalizedSolution } from '../../types/domain';
import type { GrupoErroCadastral } from '../../services/errosCadastrais';
import type { SubtipoDisponivel } from '../../services/normalizer';
import { SolutionBadge } from '../SolutionBadge';
import { ErrosCadastraisPanel } from '../ErrosCadastraisPanel';
import { registrarLegendasPersonalizadas } from '../../config/paleta';

afterEach(() => {
  cleanup();
  registrarLegendasPersonalizadas([]);
});

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

  it('legenda própria registrada aparece com o nome e a cor escolhidos, sem ícone de erro', () => {
    registrarLegendasPersonalizadas([{ categoriaPai: 'Revest', textoCelula: '3', nome: 'GAP', cor: '#0EA5E9' }]);
    render(<SolutionBadge solucao={{ categoriaPai: 'Revest', subtipoCodigo: 'PERSONALIZADA:3', valorBruto: 3, normalizationStatus: 'recognized' }} />);
    expect(screen.getByText('GAP')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Erro cadastral' })).not.toBeInTheDocument();
  });
});

const GRUPO: GrupoErroCadastral = { categoriaPai: 'Revest', coluna: 'Revest.', textoCelula: '3', ocorrencias: 108, exemplos: ['36+1820 F1', '36+1820 F2'] };
const LEGENDAS: SubtipoDisponivel[] = [
  { categoriaPai: 'Revest', subtipoCodigo: 'M', precisaEspessura: false, label: 'Micro' },
  { categoriaPai: 'FresagemFuncional', subtipoCodigo: 'FresagemFuncional', precisaEspessura: true, label: 'Fresagem Funcional (espessura em cm)' },
];

function abrir(props: Partial<React.ComponentProps<typeof ErrosCadastraisPanel>> = {}) {
  const onSalvar = vi.fn();
  const onRemover = vi.fn();
  const onFechar = vi.fn();
  render(<ErrosCadastraisPanel grupos={[GRUPO]} cadastros={[]} legendas={LEGENDAS} onSalvar={onSalvar} onRemover={onRemover} onFechar={onFechar} {...props} />);
  return { onSalvar, onRemover, onFechar, user: userEvent.setup() };
}

describe('ErrosCadastraisPanel', () => {
  it('lista coluna, texto da célula, contagem e exemplos de cada grupo', async () => {
    const { onFechar, user } = abrir();
    expect(screen.getByText('Erros cadastrais (108)')).toBeInTheDocument();
    expect(screen.getByText(/Coluna "Revest\.": célula "3"/)).toBeInTheDocument();
    expect(screen.getByText('108×')).toBeInTheDocument();
    expect(screen.getByText(/36\+1820 F1, 36\+1820 F2/)).toBeInTheDocument();
    await user.click(screen.getByText('Fechar'));
    expect(onFechar).toHaveBeenCalled();
  });

  it('resolver com legenda existente: só habilita Salvar depois de escolher, e oferece usar o número como espessura', async () => {
    const { onSalvar, user } = abrir();
    await user.click(screen.getByText('Resolver'));
    expect(screen.getByText('Salvar')).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/Passa a valer como/), 'FresagemFuncional:FresagemFuncional');
    expect(screen.getByLabelText(/Usar o número da célula \(3\) como espessura/)).toBeChecked();
    await user.click(screen.getByText('Salvar'));

    await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
    expect(onSalvar).toHaveBeenCalledWith({
      categoriaPai: 'Revest',
      textoCelula: '3',
      destino: { tipo: 'legenda', categoriaPai: 'FresagemFuncional', subtipoCodigo: 'FresagemFuncional', comEspessura: true },
    });
  });

  it('legenda que não leva espessura não mostra a opção de espessura', async () => {
    const { user } = abrir();
    await user.click(screen.getByText('Resolver'));
    await user.selectOptions(screen.getByLabelText(/Passa a valer como/), 'Revest:M');
    expect(screen.queryByLabelText(/como espessura/)).not.toBeInTheDocument();
  });

  it('criar legenda própria: exige nome, usa a cor escolhida e salva como personalizada', async () => {
    const { onSalvar, user } = abrir();
    await user.click(screen.getByText('Resolver'));
    await user.click(screen.getByRole('radio', { name: 'Criar legenda própria' }));
    expect(screen.getByText('Salvar')).toBeDisabled(); // sem nome ainda

    await user.type(screen.getByLabelText(/Nome da legenda/), '  GAP ');
    await user.click(screen.getByRole('button', { name: 'Cor #7C3AED' }));
    await user.click(screen.getByText('Salvar'));

    await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
    expect(onSalvar).toHaveBeenCalledWith({ categoriaPai: 'Revest', textoCelula: '3', destino: { tipo: 'personalizada', nome: 'GAP', cor: '#7C3AED' } });
  });

  it('cancelar fecha o formulário sem salvar', async () => {
    const { onSalvar, user } = abrir();
    await user.click(screen.getByText('Resolver'));
    await user.click(screen.getByText('Cancelar'));
    expect(screen.queryByText('Salvar')).not.toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('lista o que já foi resolvido e permite desfazer', async () => {
    const feito: CadastroSolucao = { categoriaPai: 'Revest', textoCelula: '3', destino: { tipo: 'personalizada', nome: 'GAP', cor: '#0EA5E9' } };
    const { onRemover, user } = abrir({ grupos: [], cadastros: [feito] });
    expect(screen.getByText('Nenhuma solução pendente.')).toBeInTheDocument();
    expect(screen.getByText(/GAP \(legenda própria\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Desfazer cadastro de "3"/ }));
    expect(onRemover).toHaveBeenCalledWith(feito);
  });
});
