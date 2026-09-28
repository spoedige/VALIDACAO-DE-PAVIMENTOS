import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Estaca } from '../../types/domain';
import { VerticalRuler } from '../VerticalRuler';

// Regressão pós-rodada-3 (correção urgente): tocar em pontos diferentes da
// régua parou de atualizar o painel de consulta. Este teste cobre o cálculo
// de posição -> hodômetro tocado -> callback, direto no componente, sem
// depender de GPS/IndexedDB — se algo no handler de toque (`aoTocarNaRegua`)
// voltar a travar num valor antigo, este teste falha.

function estaca(id: number, hodometroContinuo: number): Estaca {
  return {
    id,
    numeroEstaca: `0+${id * 100}`,
    hodometroContinuo,
    hodometroMarco: `0+${id * 100}`,
    latitude: null,
    longitude: null,
    tipoSecao: null,
    marcoKm: null,
    observacaoOriginal: null,
    dreno: 'ausente',
    faixas: [{ numero: 1, parametros: {}, solucoesOriginais: [] }],
  };
}

const ESTACAS: Estaca[] = [estaca(0, 0), estaca(1, 0.5), estaca(2, 1), estaca(3, 1.5), estaca(4, 2)];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('VerticalRuler — toque na régua atualiza a consulta (regressão pós-rodada-3)', () => {
  it('tocar em posições diferentes chama onConsultarHodometro com estacas diferentes', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 88, bottom: 420, width: 88, height: 420, x: 0, y: 0, toJSON: () => {},
    });

    const onConsultarHodometro = vi.fn();
    render(
      <VerticalRuler
        estacas={ESTACAS}
        estacaAtivaIndex={2}
        estacaConsultadaIndex={null}
        fieldLogs={new Map()}
        onConsultarHodometro={onConsultarHodometro}
      />,
    );

    const regua = screen.getByRole('button', { name: /Régua de consulta/i });

    // topo da régua = hodômetro maior (estaca mais à frente)
    fireEvent.click(regua, { clientY: 10 });
    // fundo da régua = hodômetro menor (estaca mais atrás)
    fireEvent.click(regua, { clientY: 410 });

    expect(onConsultarHodometro).toHaveBeenCalledTimes(2);
    const [primeiraChamada, segundaChamada] = onConsultarHodometro.mock.calls.map((c) => c[0]);

    // as duas chamadas precisam apontar pra estacas diferentes — é exatamente
    // o sintoma da regressão: tocar em posições diferentes continuar preso
    // no mesmo índice.
    expect(primeiraChamada).not.toBe(segundaChamada);

    // tocar no topo deve resultar em hodômetro maior (mais à frente) que
    // tocar no fundo — não só "diferente", mas na direção certa.
    expect(ESTACAS[primeiraChamada].hodometroContinuo).toBeGreaterThan(ESTACAS[segundaChamada].hodometroContinuo);
  });

  it('tocar repetidamente em pontos diferentes sempre reflete o toque mais recente, nunca trava no primeiro', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 88, bottom: 420, width: 88, height: 420, x: 0, y: 0, toJSON: () => {},
    });

    const onConsultarHodometro = vi.fn();
    render(
      <VerticalRuler
        estacas={ESTACAS}
        estacaAtivaIndex={2}
        estacaConsultadaIndex={null}
        fieldLogs={new Map()}
        onConsultarHodometro={onConsultarHodometro}
      />,
    );
    const regua = screen.getByRole('button', { name: /Régua de consulta/i });

    fireEvent.click(regua, { clientY: 50 });
    fireEvent.click(regua, { clientY: 200 });
    fireEvent.click(regua, { clientY: 380 });

    expect(onConsultarHodometro).toHaveBeenCalledTimes(3);
    const chamadas = onConsultarHodometro.mock.calls.map((c) => c[0]);
    // pelo menos as chamadas nos extremos (1ª e 3ª) precisam ser diferentes
    expect(chamadas[0]).not.toBe(chamadas[2]);
  });
});
