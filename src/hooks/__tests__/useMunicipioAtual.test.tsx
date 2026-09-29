import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useMunicipioAtual } from '../useMunicipioAtual';
import * as geocodificacao from '../../services/geocodificacao';

// Item 7 da rodada 7: geocodificação reversa é online, mas nunca pode "apagar"
// o último município já resolvido só porque uma tentativa mais recente
// falhou (sem rede, serviço fora do ar) — precisa continuar mostrando o
// último conhecido, marcado como desatualizado.

function Sonda({ lat, lon }: { lat: number | null; lon: number | null }) {
  const { municipio, desatualizado, carregando } = useMunicipioAtual(lat, lon);
  return (
    <p>
      {municipio ? `${municipio.nome}${municipio.uf ? `-${municipio.uf}` : ''}` : carregando ? 'carregando' : 'sem-municipio'}
      {desatualizado ? ' desatualizado' : ''}
    </p>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useMunicipioAtual', () => {
  it('resolve o município com sucesso', async () => {
    vi.spyOn(geocodificacao, 'buscarMunicipio').mockResolvedValue({ nome: 'Uberlândia', uf: 'MG' });
    render(<Sonda lat={-18.9} lon={-48.27} />);
    await waitFor(() => expect(screen.getByText(/Uberlândia-MG/)).toBeInTheDocument());
  });

  it('mantém o último município resolvido, marcado como desatualizado, se a busca seguinte falhar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi.spyOn(geocodificacao, 'buscarMunicipio');
    spy.mockResolvedValueOnce({ nome: 'Uberlândia', uf: 'MG' });
    const { rerender } = render(<Sonda lat={-18.9} lon={-48.27} />);
    await waitFor(() => expect(screen.getByText(/Uberlândia-MG/)).toBeInTheDocument());

    // passa do intervalo mínimo entre buscas (20s) pra próxima tentativa não
    // ser bloqueada pelo throttle
    spy.mockResolvedValueOnce(null); // segunda tentativa falha (sem rede)
    vi.advanceTimersByTime(21000);
    rerender(<Sonda lat={-18.91} lon={-48.28} />);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    // o texto continua mostrando Uberlândia (nunca reseta pra null sozinho),
    // agora marcado como desatualizado
    await waitFor(() => expect(screen.getByText(/Uberlândia-MG desatualizado/)).toBeInTheDocument());
    vi.useRealTimers();
  });

  it('sem lat/lon, não busca nada e mostra o estado vazio', () => {
    const spy = vi.spyOn(geocodificacao, 'buscarMunicipio');
    render(<Sonda lat={null} lon={null} />);
    expect(screen.getByText('sem-municipio')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});
