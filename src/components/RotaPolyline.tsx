import { useMemo } from 'react';
import type { Estaca } from '../types/domain';

interface Props {
  estacas: Estaca[];
  estacaAtualIndex: number;
}

const LARGURA = 320;
const ALTURA = 160;
const MARGEM = 12;

/** Rota V1 reduzida (seção 9): polyline simples a partir das coordenadas da
 * própria planilha, sem tiles de mapa. Marcador de posição atual, trilha já
 * percorrida, ícones dos marcadores de Observações. */
export function RotaPolyline({ estacas, estacaAtualIndex }: Props) {
  const pontos = useMemo(() => {
    const validos = estacas
      .map((e, i) => ({ i, lat: e.latitude, lon: e.longitude }))
      .filter((p): p is { i: number; lat: number; lon: number } => p.lat !== null && p.lon !== null);
    if (validos.length === 0) return null;

    const lats = validos.map((p) => p.lat);
    const lons = validos.map((p) => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const rangeLat = maxLat - minLat || 1;
    const rangeLon = maxLon - minLon || 1;

    const projetar = (lat: number, lon: number) => ({
      x: MARGEM + ((lon - minLon) / rangeLon) * (LARGURA - 2 * MARGEM),
      // latitude cresce pra cima, mas SVG y cresce pra baixo — inverte
      y: ALTURA - MARGEM - ((lat - minLat) / rangeLat) * (ALTURA - 2 * MARGEM),
    });

    return validos.map((p) => ({ ...projetar(p.lat, p.lon), i: p.i }));
  }, [estacas]);

  if (!pontos) {
    return <p className="rounded-lg border border-neutral-300 bg-white p-4 text-sm text-neutral-500">Sem coordenadas para desenhar a rota.</p>;
  }

  const trilha = pontos.filter((p) => p.i <= estacaAtualIndex);
  const atual = pontos.find((p) => p.i === estacaAtualIndex) ?? pontos.reduce((a, b) => (Math.abs(b.i - estacaAtualIndex) < Math.abs(a.i - estacaAtualIndex) ? b : a));
  const marcadores = estacas
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.tipoSecao)
    .map(({ i }) => pontos.find((p) => p.i === i))
    .filter((p): p is { x: number; y: number; i: number } => !!p);

  const pathTodos = pontos.map((p) => `${p.x},${p.y}`).join(' ');
  const pathTrilha = trilha.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="rounded-lg border border-neutral-300 bg-white p-2">
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="w-full" role="img" aria-label="Rota da vistoria">
        <polyline points={pathTodos} fill="none" stroke="#d4d4d4" strokeWidth={2} />
        <polyline points={pathTrilha} fill="none" stroke="#2563eb" strokeWidth={3} />
        {marcadores.map((m, idx) => (
          <circle key={idx} cx={m.x} cy={m.y} r={3} fill="#002060" />
        ))}
        <circle cx={atual.x} cy={atual.y} r={6} fill="#dc2626" stroke="white" strokeWidth={2} />
      </svg>
    </div>
  );
}
