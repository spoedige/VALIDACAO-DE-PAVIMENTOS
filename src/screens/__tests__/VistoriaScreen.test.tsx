import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Estaca, ImportResult, NormalizedSolution } from '../../types/domain';
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

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn();
});

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
    await user.click(within(modalContainer as HTMLElement).getByText('Adicionar'));
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

// Regressão rodada 5 (bug da rodada 4 não foi corrigido de fato): clicar em
// posições diferentes da régua não atualizava os valores exibidos nos cards
// de Faixa 1/2/3, mesmo com o estado de "estaca consultada" mudando
// corretamente — os cards liam sempre `estacaAtiva`, nunca a estaca
// consultada. Este teste sobe a TELA INTEIRA (régua real + cards reais,
// contra Dexie real) e verifica o TEXTO renderizado nos cards a cada
// clique, não só o estado interno — exatamente o que faltou na rodada 4.

// item 2 da rodada 7: a régua trocou onClick por pointerdown/move/up (pra
// suportar arrastar) — "tocar" nos testes agora é pointerdown+pointerup sem
// pointermove no meio (jsdom não implementa setPointerCapture; stubado).
function tocarRegua(elemento: Element, clientY: number) {
  fireEvent.pointerDown(elemento, { clientY });
  fireEvent.pointerUp(elemento, { clientY });
}

function estacaComIri(id: number, hodometroContinuo: number, iri: number): Estaca {
  return {
    id,
    numeroEstaca: `0+${Math.round(hodometroContinuo * 1000)}`,
    hodometroContinuo,
    hodometroMarco: `0+${Math.round(hodometroContinuo * 1000)}`,
    latitude: null,
    longitude: null,
    tipoSecao: null,
    marcoKm: null,
    observacaoOriginal: null,
    dreno: 'ausente',
    faixas: [{ numero: 1, parametros: { iri }, solucoesOriginais: [] }],
  };
}

describe('VistoriaScreen — clique na régua atualiza os cards de Faixa (regressão pós-rodada-4)', () => {
  it('clicar em 3 posições diferentes da régua muda o IRI exibido no card a cada clique, refletindo a estaca clicada', async () => {
    const user = userEvent.setup();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 88, bottom: 420, width: 88, height: 420, x: 0, y: 0, toJSON: () => {},
    });

    const estacas = [
      estacaComIri(0, 0, 1.11),
      estacaComIri(1, 0.5, 2.22),
      estacaComIri(2, 1, 3.33),
      estacaComIri(3, 1.5, 4.44),
      estacaComIri(4, 2, 5.55),
    ];
    const projectId = await createProjectFromImport(buildImportResult(estacas));

    render(
      <VistoriaScreen
        projectId={projectId}
        config={CONFIG}
        limiaresTolerancia={null}
        onVoltar={() => {}}
        onExportar={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText('Alterar')).toBeInTheDocument());

    // estaca ativa é a índice 0 (sem GPS travado em teste) — IRI inicial 1,11
    expect(screen.getByText('1,11')).toBeInTheDocument();

    // "ver trecho todo" torna a janela da régua = [hodômetro mín, hodômetro
    // máx] inteiro, com altura determinística — sem isso a régua só mostra
    // uma janela de ~2km à frente da estaca ativa, e nem toda estaca do
    // teste caberia num único clique.
    await user.click(screen.getByText('ver trecho todo'));
    const regua = screen.getByRole('button', { name: /Régua de consulta/i });

    // clique 1: topo da régua = hodômetro maior = estaca 4 (IRI 5,55)
    tocarRegua(regua, 10);
    await waitFor(() => expect(screen.getByText('5,55')).toBeInTheDocument());
    expect(screen.queryByText('1,11')).not.toBeInTheDocument();

    // clique 2: meio da régua = estaca intermediária (IRI 3,33)
    tocarRegua(regua, 240);
    await waitFor(() => expect(screen.getByText('3,33')).toBeInTheDocument());
    expect(screen.queryByText('5,55')).not.toBeInTheDocument();

    // clique 3: fundo da régua = hodômetro menor = estaca 0 (volta ao IRI ativo, 1,11)
    tocarRegua(regua, 470);
    await waitFor(() => expect(screen.getByText('1,11')).toBeInTheDocument());
    expect(screen.queryByText('3,33')).not.toBeInTheDocument();
  });

  it('editar via consulta na régua salva na estaca CONSULTADA, nunca na ativa', async () => {
    const user = userEvent.setup();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 88, bottom: 420, width: 88, height: 420, x: 0, y: 0, toJSON: () => {},
    });

    const estacas = [estacaComIri(0, 0, 1.11), estacaComIri(1, 1, 9.99)];
    const projectId = await createProjectFromImport(buildImportResult(estacas));

    render(
      <VistoriaScreen
        projectId={projectId}
        config={CONFIG}
        limiaresTolerancia={null}
        onVoltar={() => {}}
        onExportar={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText('Alterar')).toBeInTheDocument());

    const regua = screen.getByRole('button', { name: /Régua de consulta/i });
    tocarRegua(regua, 10); // consulta a outra estaca (índice 1, não a ativa)
    await waitFor(() => expect(screen.getByText('9,99')).toBeInTheDocument());

    // "Alterar" continua habilitado durante a consulta — o item 3 da rodada
    // 6 exige edição livre; o que impede editar a estaca errada não é
    // desabilitar o botão, é fixar por ID qual estaca a folha está editando.
    await user.click(screen.getByText('Alterar'));
    const modal = await screen.findByText('Solução original do projeto');
    const modalContainer = modal.closest('.fixed')!;
    await user.click(within(modalContainer as HTMLElement).getByText('Reconstrução'));
    await user.click(within(modalContainer as HTMLElement).getByText('Adicionar'));
    await waitFor(() => expect(within(modalContainer as HTMLElement).getByText('Faixa 1 salva')).toBeInTheDocument());
    await user.click(within(modalContainer as HTMLElement).getByText('Concluir'));

    await user.click(screen.getByRole('button', { name: /Alterações/ }));
    // o registro precisa citar a estaca consultada (0+1000), não a ativa (0+0)
    expect(await screen.findByText(/Estaca 0\+1000/)).toBeInTheDocument();
    expect(screen.queryByText(/Estaca 0\+0\b/)).not.toBeInTheDocument();
  });

  it('GPS avançar a estaca ativa enquanto a folha de edição está aberta não desvia a edição pra estaca nova (bug relatado na rodada 6)', async () => {
    const user = userEvent.setup();

    // estacas com lat/long reais e próximas o bastante pro motor de GPS
    // confirmar a segunda como ativa em 2 leituras estáveis.
    const original: NormalizedSolution[] = [];
    const estacas: Estaca[] = [
      { id: 0, numeroEstaca: '0+000', hodometroContinuo: 0, hodometroMarco: '0+000', latitude: -18.4, longitude: -48.0, tipoSecao: null, marcoKm: null, observacaoOriginal: null, dreno: 'ausente', faixas: [{ numero: 1, parametros: {}, solucoesOriginais: original }] },
      { id: 1, numeroEstaca: '0+050', hodometroContinuo: 0.05, hodometroMarco: '0+050', latitude: -18.3996, longitude: -48.0, tipoSecao: null, marcoKm: null, observacaoOriginal: null, dreno: 'ausente', faixas: [{ numero: 1, parametros: {}, solucoesOriginais: original }] },
    ];
    const projectId = await createProjectFromImport(buildImportResult(estacas));

    let sucessoGps: ((pos: GeolocationPosition) => void) | null = null;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (sucesso: (pos: GeolocationPosition) => void) => {
          sucessoGps = sucesso;
          return 1;
        },
        clearWatch: () => {},
      },
    });

    render(
      <VistoriaScreen
        projectId={projectId}
        config={CONFIG}
        limiaresTolerancia={null}
        onVoltar={() => {}}
        onExportar={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText('Alterar')).toBeInTheDocument());

    // operador toca "Alterar" na estaca ativa (0+000) — a folha precisa ficar
    // presa nessa estaca pelo resto da edição, custe o que custar.
    await user.click(screen.getByText('Alterar'));
    const modal = await screen.findByText('Solução original do projeto');
    const modalContainer = modal.closest('.fixed')!;
    expect(within(modalContainer as HTMLElement).getByText('Sem solução')).toBeInTheDocument();

    // com a folha ainda aberta, o veículo continua andando: 2 leituras de
    // GPS estáveis perto da PRÓXIMA estaca fazem o motor confirmar a
    // mudança de estaca ativa por baixo, sem nenhuma ação do operador.
    function leitura(lat: number, lon: number, timestamp: number): GeolocationPosition {
      return { coords: { latitude: lat, longitude: lon, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp } as GeolocationPosition;
    }
    sucessoGps!(leitura(-18.3996, -48.0, 1000));
    sucessoGps!(leitura(-18.3996, -48.0, 1500));

    await waitFor(() => expect(screen.getByText('0+050')).toBeInTheDocument()); // confirma que a estaca ativa avançou de verdade

    // a folha continua aberta e ainda mostra a estaca original (0+000) —
    // nunca trocou por baixo dos pés do operador.
    expect(within(modalContainer as HTMLElement).getByText('Sem solução')).toBeInTheDocument();

    await user.click(within(modalContainer as HTMLElement).getByText('Reconstrução'));
    await user.click(within(modalContainer as HTMLElement).getByText('Adicionar'));
    await waitFor(() => expect(within(modalContainer as HTMLElement).getByText('Faixa 1 salva')).toBeInTheDocument());
    await user.click(within(modalContainer as HTMLElement).getByText('Concluir'));

    await user.click(screen.getByRole('button', { name: /Alterações/ }));
    // o registro precisa citar 0+000 (a estaca que estava sendo editada
    // quando "Alterar" foi tocado), nunca 0+050 (onde o GPS terminou)
    expect(await screen.findByText(/Estaca 0\+000/)).toBeInTheDocument();
    expect(screen.queryByText(/Estaca 0\+050/)).not.toBeInTheDocument();
  });
});

// Rodada "subir o unifilar": a régua passou a ocupar a altura real da coluna
// ao lado (GPS + consulta + cards), medida via ResizeObserver. Bug real
// encontrado nessa mudança: o `useEffect` que criava o observer dependia de
// `[modo]`, mas a div observada só existe depois que os dados terminam de
// carregar — como `modo` não muda entre o "Carregando…" e o conteúdo real,
// o observer nunca era recriado pra pegar o elemento certo, e ficava preso
// olhando pra um ref nulo (ou pra nada). Corrigido trocando por um
// ref-callback, que dispara exatamente quando o elemento monta.
describe('VistoriaScreen — régua observa a altura real da coluna (mesmo após o "Carregando…" inicial)', () => {
  it('ResizeObserver.observe é chamado com o elemento real da coluna, não fica preso num ref nulo do primeiro render', async () => {
    const observeSpy = vi.fn();
    class FakeResizeObserver {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        observeSpy(target);
        this.callback([{ contentRect: { height: 690 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

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

    await waitFor(() => expect(screen.getByText('Alterar')).toBeInTheDocument());

    // se o bug voltar (effect preso num ref nulo do render de "Carregando…"),
    // observe nunca é chamado com o elemento de verdade.
    await waitFor(() => expect(observeSpy).toHaveBeenCalled());
    const elementoObservado = observeSpy.mock.calls[0][0] as HTMLElement;
    expect(elementoObservado.textContent).toContain('Faixa 1');

    vi.unstubAllGlobals();
  });
});
