import { useEffect, useRef, useState } from 'react';
import { GpsEngine, type EstacaGps, type GpsReading, type GpsStatus } from '../services/gpsEngine';

export type PermissaoGeolocalizacao = 'perguntando' | 'concedida' | 'negada' | 'indisponivel' | 'timeout';

export interface SessaoGpsInfo {
  latitude: number | null;
  longitude: number | null;
  horaInicioSessao: string; // ISO, fixado na montagem do hook
  hodometroMinConfirmado: number | null; // menor hodômetro já confirmado como estaca ativa na sessão
  hodometroMaxConfirmado: number | null; // maior hodômetro já confirmado como estaca ativa na sessão
}

// Seção 3 do prompt de atualização de UX: opções reais da Geolocation API.
const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 };

/**
 * Não existe mais nenhum caminho de definição manual de estaca (seção 11): o
 * hook só expõe o status calculado pelo motor. "Voltar ao GPS" (seção 6) é
 * puramente uma troca de view da UI (sair do modo de consulta) — não chama
 * nada aqui, porque o motor nunca parou de rodar.
 */
export function useGps(estacas: EstacaGps[], estacaInicialIndex: number, intervaloMedioEstacasKm?: number) {
  const engineRef = useRef<GpsEngine>(new GpsEngine(estacas, estacaInicialIndex));
  const [status, setStatus] = useState<GpsStatus | null>(null);
  const [permissao, setPermissao] = useState<PermissaoGeolocalizacao>(() => ('geolocation' in navigator ? 'perguntando' : 'indisponivel'));
  const velocidadeRef = useRef<number | undefined>(undefined);
  const confirmadosRef = useRef<{ min: number | null; max: number | null }>({ min: null, max: null });
  const [sessaoInfo, setSessaoInfo] = useState<SessaoGpsInfo>(() => ({
    latitude: null,
    longitude: null,
    horaInicioSessao: new Date().toISOString(),
    hodometroMinConfirmado: null,
    hodometroMaxConfirmado: null,
  }));

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPermissao('concedida');
        const reading: GpsReading = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: pos.timestamp };
        if (pos.coords.speed != null && pos.coords.speed >= 0) velocidadeRef.current = pos.coords.speed * 3.6;
        const s = engineRef.current.processReading(reading, velocidadeRef.current, intervaloMedioEstacasKm);
        setStatus(s);

        // rastreio de trecho realmente percorrido (Dashboard, seção 5): só o
        // hodômetro da estaca ATIVA confirmada entra na conta, nunca o candidato.
        const estacaConfirmada = estacas.find((e) => e.index === s.estacaAtivaIndex);
        if (estacaConfirmada) {
          const { min, max } = confirmadosRef.current;
          confirmadosRef.current = {
            min: min === null ? estacaConfirmada.hodometroContinuo : Math.min(min, estacaConfirmada.hodometroContinuo),
            max: max === null ? estacaConfirmada.hodometroContinuo : Math.max(max, estacaConfirmada.hodometroContinuo),
          };
        }
        setSessaoInfo((prev) => ({
          ...prev,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          hodometroMinConfirmado: confirmadosRef.current.min,
          hodometroMaxConfirmado: confirmadosRef.current.max,
        }));
      },
      (erro) => {
        // perda de sinal / erro: última estaca ativa confirmada permanece —
        // o motor não é tocado, só o status de permissão/disponibilidade muda.
        if (erro.code === erro.PERMISSION_DENIED) setPermissao('negada');
        else if (erro.code === erro.TIMEOUT) setPermissao('timeout');
        else setPermissao((p) => (p === 'concedida' ? 'concedida' : 'indisponivel'));
      },
      GEO_OPTIONS,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [estacas, intervaloMedioEstacasKm]);

  return { status, permissao, sessaoInfo, estacaAtivaIndex: status?.estacaAtivaIndex ?? estacaInicialIndex };
}

export const MENSAGEM_PERMISSAO_NEGADA = 'Permissão de localização negada. Habilite a localização no navegador para navegação automática.';
