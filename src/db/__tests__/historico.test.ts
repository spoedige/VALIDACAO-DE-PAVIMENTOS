import { describe, expect, it } from 'vitest';
import type { FieldChangeHistoryEntry, NormalizedSolution } from '../../types/domain';
import { calcularEstadoAtualDaCadeia } from '../historico';

function sol(subtipoCodigo: string): NormalizedSolution {
  return { categoriaPai: 'Estrutural', subtipoCodigo, valorBruto: subtipoCodigo, normalizationStatus: 'recognized' };
}

function evento(t: string, de: NormalizedSolution[], para: NormalizedSolution[], revertidoEm?: string): FieldChangeHistoryEntry {
  return { projectId: 'p1', estacaId: 0, faixa: 1, timestamp: t, de, para, revertidoEm };
}

const ORIGINAL = [sol('RPX')];
const A = [sol('ST')];
const B = [sol('MFS')];
const C = [sol('FF')];

describe('calcularEstadoAtualDaCadeia', () => {
  it('sem nenhum evento, o estado é a solução original', () => {
    expect(calcularEstadoAtualDaCadeia([], ORIGINAL)).toEqual(ORIGINAL);
  });

  it('um único evento válido: estado é o "para" dele', () => {
    const eventos = [evento('t1', ORIGINAL, A)];
    expect(calcularEstadoAtualDaCadeia(eventos, ORIGINAL)).toEqual(A);
  });

  it('reverter o único evento da cadeia volta pra solução original', () => {
    const eventos = [evento('t1', ORIGINAL, A, 't2')]; // revertido em t2
    expect(calcularEstadoAtualDaCadeia(eventos, ORIGINAL)).toEqual(ORIGINAL);
  });

  it('exemplo do prompt: original→A→B→C, reverter B (intermediário) resulta em C, não A', () => {
    const eventos = [
      evento('t1', ORIGINAL, A),
      evento('t2', A, B, 't4'), // revertido
      evento('t3', B, C),
    ];
    expect(calcularEstadoAtualDaCadeia(eventos, ORIGINAL)).toEqual(C);
  });

  it('reverter o evento mais recente (C) volta pro estado anterior válido (B), não pro original', () => {
    const eventos = [
      evento('t1', ORIGINAL, A),
      evento('t2', A, B),
      evento('t3', B, C, 't4'), // revertido
    ];
    expect(calcularEstadoAtualDaCadeia(eventos, ORIGINAL)).toEqual(B);
  });

  it('reverter o primeiro evento mas manter os posteriores válidos preserva o estado mais recente', () => {
    const eventos = [
      evento('t1', ORIGINAL, A, 't4'), // revertido
      evento('t2', A, B),
    ];
    expect(calcularEstadoAtualDaCadeia(eventos, ORIGINAL)).toEqual(B);
  });

  it('reverter todos os eventos da cadeia volta pro original', () => {
    const eventos = [evento('t1', ORIGINAL, A, 't3'), evento('t2', A, B, 't4')];
    expect(calcularEstadoAtualDaCadeia(eventos, ORIGINAL)).toEqual(ORIGINAL);
  });

  it('ordena por timestamp, não pela ordem de chegada no array', () => {
    const eventos = [evento('t2', A, B), evento('t1', ORIGINAL, A)];
    expect(calcularEstadoAtualDaCadeia(eventos, ORIGINAL)).toEqual(B);
  });
});
