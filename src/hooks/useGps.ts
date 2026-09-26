import { useEffect, useRef, useState } from 'react';
import { GpsEngine, type EstacaGps, type GpsReading, type GpsSuggestion } from '../services/gpsEngine';

export function useGps(estacas: EstacaGps[], estacaInicialIndex: number, intervaloMedioEstacasKm?: number) {
  const engineRef = useRef<GpsEngine>(new GpsEngine(estacas, estacaInicialIndex));
  const [estacaAtualIndex, setEstacaAtualIndex] = useState(estacaInicialIndex);
  const [sugestao, setSugestao] = useState<GpsSuggestion | null>(null);
  const [gpsDisponivel, setGpsDisponivel] = useState(true);
  const [modoAutomatico, setModoAutomatico] = useState(true);
  const velocidadeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!modoAutomatico || !('geolocation' in navigator)) {
      if (!('geolocation' in navigator)) setGpsDisponivel(false);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsDisponivel(true);
        const reading: GpsReading = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: pos.timestamp };
        if (pos.coords.speed != null && pos.coords.speed >= 0) velocidadeRef.current = pos.coords.speed * 3.6;
        const s = engineRef.current.processReading(reading, velocidadeRef.current, intervaloMedioEstacasKm);
        setSugestao(s);
      },
      () => {
        // perda de sinal / erro: última posição confirmada permanece ativa (seção 5)
        setGpsDisponivel(false);
      },
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [modoAutomatico, intervaloMedioEstacasKm]);

  function confirmarSugestao() {
    if (sugestao?.estacaSugeridaIndex == null) return;
    engineRef.current.setEstacaAtual(sugestao.estacaSugeridaIndex);
    setEstacaAtualIndex(sugestao.estacaSugeridaIndex);
    setSugestao(null);
  }

  function avancarManual(delta: number) {
    const novo = Math.max(0, Math.min(estacas.length - 1, estacaAtualIndex + delta));
    engineRef.current.setEstacaAtual(novo);
    setEstacaAtualIndex(novo);
    setSugestao(null);
    setModoAutomatico(false);
  }

  function usarGpsNovamente() {
    engineRef.current.voltarAoModoAutomatico();
    setModoAutomatico(true);
  }

  return { estacaAtualIndex, sugestao, gpsDisponivel, modoAutomatico, confirmarSugestao, avancarManual, usarGpsNovamente };
}
