import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Estaca } from '../types/domain';
import { RotaPolyline } from './RotaPolyline';

interface Props {
  estacas: Estaca[];
  estacaAtualIndex: number;
}

/**
 * Mapa real com tiles do OpenStreetMap (item 4 da 3ª rodada de UX) — só
 * existe aqui, no Dashboard, nunca na Vistoria. Totalmente isolado do motor
 * GPS→estaca: recebe só lat/long já resolvidas, não participa de nenhuma
 * etapa de busca de candidato, confiança ou avanço de estaca ativa. Se os
 * tiles não carregarem (sem rede, ou nenhum tile em cache), degrada pra
 * polyline esquemática sem travar a tela — a vistoria em si nunca depende
 * disso.
 */
export function MapaReal({ estacas, estacaAtualIndex }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const trilhaRef = useRef<L.Polyline | null>(null);
  const marcadorRef = useRef<L.CircleMarker | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [tilesFalharam, setTilesFalharam] = useState(false);
  // segue a posição atual automaticamente (item 3 da rodada 7) até o
  // operador arrastar o mapa manualmente pra olhar outro lugar — aí destrava
  // e só volta a seguir quando ele tocar o botão de centralizar de novo.
  const seguindoRef = useRef(true);

  useEffect(() => {
    const aoFicarOnline = () => setOnline(true);
    const aoFicarOffline = () => setOnline(false);
    window.addEventListener('online', aoFicarOnline);
    window.addEventListener('offline', aoFicarOffline);
    return () => {
      window.removeEventListener('online', aoFicarOnline);
      window.removeEventListener('offline', aoFicarOffline);
    };
  }, []);

  const usarFallback = !online || tilesFalharam;

  const pontosValidos = estacas.map((e, i) => ({ i, lat: e.latitude, lon: e.longitude })).filter((p): p is { i: number; lat: number; lon: number } => p.lat !== null && p.lon !== null);

  useEffect(() => {
    if (usarFallback || !containerRef.current || pontosValidos.length === 0) return;

    if (!mapRef.current) {
      const map = L.map(containerRef.current, { attributionControl: true });
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        // atribuição obrigatória do OpenStreetMap (item 4)
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      let errosDeTile = 0;
      tiles.on('tileerror', () => {
        errosDeTile++;
        // alguns tiles isolados falhando é normal (zoom/pan); só cai pro
        // fallback esquemático se a maioria estiver falhando de verdade.
        if (errosDeTile >= 6) setTilesFalharam(true);
      });
      tiles.addTo(map);
      mapRef.current = map;

      // só um arrasto de verdade do operador destrava o "seguir" — zoom (que
      // o próprio `flyTo`/`panTo` programático também dispara) não conta.
      map.on('dragstart', () => {
        seguindoRef.current = false;
      });

      const todos = pontosValidos.map((p) => [p.lat, p.lon] as [number, number]);
      L.polyline(todos, { color: '#9ca3af', weight: 2 }).addTo(map);
      trilhaRef.current = L.polyline([], { color: '#2563eb', weight: 3 }).addTo(map);
      marcadorRef.current = L.circleMarker([0, 0], { radius: 7, color: 'white', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }).addTo(map);
      map.fitBounds(L.latLngBounds(todos), { padding: [16, 16] });
    }

    return () => {
      if (usarFallback) {
        mapRef.current?.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usarFallback]);

  useEffect(() => {
    if (!mapRef.current || pontosValidos.length === 0) return;
    const trilha = pontosValidos.filter((p) => p.i <= estacaAtualIndex).map((p) => [p.lat, p.lon] as [number, number]);
    trilhaRef.current?.setLatLngs(trilha);
    const atual = pontosValidos.find((p) => p.i === estacaAtualIndex) ?? pontosValidos[pontosValidos.length - 1];
    marcadorRef.current?.setLatLng([atual.lat, atual.lon]);
    if (seguindoRef.current) mapRef.current.panTo([atual.lat, atual.lon], { animate: true });
  }, [estacaAtualIndex, pontosValidos]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  function centralizar() {
    const atual = pontosValidos.find((p) => p.i === estacaAtualIndex) ?? pontosValidos[pontosValidos.length - 1];
    if (!mapRef.current || !atual) return;
    seguindoRef.current = true; // volta a seguir a posição atual automaticamente
    mapRef.current.flyTo([atual.lat, atual.lon], Math.max(mapRef.current.getZoom(), 14));
  }

  if (usarFallback) {
    return (
      <div>
        <RotaPolyline estacas={estacas} estacaAtualIndex={estacaAtualIndex} />
        <p className="mt-1 text-[10px] text-neutral-500">{!online ? 'Sem conexão — mostrando traçado esquemático.' : 'Mapa indisponível — mostrando traçado esquemático.'}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={containerRef} className="h-56 w-full overflow-hidden rounded-lg border border-neutral-300" />
      {/* botão de centralizar (item 4 da rodada 6): sem isso, o mapa fica
          "solto" — dá pra arrastar/dar zoom e perder de vista a posição
          atual, sem jeito de voltar sem recarregar a tela. z-index acima dos
          controles do próprio Leaflet (zoom +/-, ~400-1000). */}
      <button
        onClick={centralizar}
        aria-label="Centralizar mapa na posição atual"
        title="Centralizar na posição atual"
        className="absolute right-2 top-2 z-[1000] flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 bg-white text-base shadow-sm active:bg-neutral-100"
      >
        🎯
      </button>
    </div>
  );
}
