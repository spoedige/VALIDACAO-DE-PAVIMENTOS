import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarMunicipio } from '../geocodificacao';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buscarMunicipio', () => {
  it('extrai nome do município e UF de uma resposta real do Nominatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ address: { city: 'Uberlândia', state: 'Minas Gerais', 'ISO3166-2-lvl4': 'BR-MG' } }),
      }),
    );

    const resultado = await buscarMunicipio(-18.9, -48.27);
    expect(resultado).toEqual({ nome: 'Uberlândia', uf: 'MG' });
  });

  it('usa town/municipality/village como alternativa quando não há city', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ address: { town: 'Araguari' } }) }));
    expect(await buscarMunicipio(-18.6, -48.1)).toEqual({ nome: 'Araguari', uf: null });
  });

  it('retorna null se a resposta não veio ok (sem lançar exceção)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await buscarMunicipio(0, 0)).toBeNull();
  });

  it('retorna null se o fetch falhar (sem rede) — nunca lança', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem rede')));
    await expect(buscarMunicipio(0, 0)).resolves.toBeNull();
  });

  it('retorna null se o endereço não tiver nenhum campo de município reconhecido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ address: { country: 'Brasil' } }) }));
    expect(await buscarMunicipio(0, 0)).toBeNull();
  });
});
