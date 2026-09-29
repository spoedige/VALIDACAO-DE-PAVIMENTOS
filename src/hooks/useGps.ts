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

// Alguns navegadores (Brave incluso) não são confiáveis pra honrar a opção
// `timeout` do `watchPosition` — o callback de erro simplesmente nunca
// dispara, e a tela fica presa em "GPS: buscando…" pra sempre, mesmo sem
// nenhum bug no motor de posicionamento em si. Esse watchdog próprio é uma
// rede de segurança: se nenhuma leitura (sucesso OU erro) chegar dentro
// desse prazo (maior que o timeout pedido ao navegador, pra não competir com
// o timeout dele), força a transição pra 'timeout' por conta própria.
const WATCHDOG_MS = 15000;

/**
 * Não existe mais nenhum caminho de definição manual de estaca (seção 11): o
 * hook só expõe o status calculado pelo motor. "Voltar ao GPS" (seção 6) é
 * puramente uma troca de view da UI (sair do modo de consulta) — não chama
 * nada aqui, porque o motor nunca parou de rodar.
 */
export function useGps(estacas: EstacaGps[], estacaInicialIndex: number, intervaloMedioEstacasKm?: number) {
  // Bug real encontrado na rodada 6 ("GPS: buscando…" travado pra sempre,
  // sem nenhuma mensagem de erro): `VistoriaScreen` chama este hook antes de
  // `estacas` (a lista de estações do projeto) terminar de carregar do
  // IndexedDB — no primeiro render, essa lista chega vazia aqui. Construir o
  // motor logo nesse primeiro render deixava `estacaAtiva` como `undefined`
  // pra sempre (`[].find(...) ?? [][0]`), e como esse `useRef` só roda o
  // inicializador uma vez, todo motor ficava permanentemente quebrado —
  // qualquer leitura real de GPS lançava uma exceção dentro do callback de
  // sucesso do `watchPosition`, ANTES de `setStatus` rodar, e a tela nunca
  // saía de "buscando…", mesmo com permissão concedida e sinal de satélite
  // normal. Corrigido construindo o motor só quando a lista de estações
  // realmente tiver conteúdo.
  const engineRef = useRef<GpsEngine | null>(null);
  if (!engineRef.current && estacas.length > 0) {
    engineRef.current = new GpsEngine(estacas, estacaInicialIndex);
  }
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

    let watchdog = window.setTimeout(() => setPermissao((p) => (p === 'concedida' ? p : 'timeout')), WATCHDOG_MS);
    function reiniciarWatchdog() {
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(() => setPermissao((p) => (p === 'concedida' ? p : 'timeout')), WATCHDOG_MS);
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        reiniciarWatchdog();
        setPermissao('concedida');
        if (!engineRef.current) return; // lista de estações ainda carregando — próxima leitura tenta de novo
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
        reiniciarWatchdog();
        // perda de sinal / erro: última estaca ativa confirmada permanece —
        // o motor não é tocado, só o status de permissão/disponibilidade muda.
        if (erro.code === erro.PERMISSION_DENIED) setPermissao('negada');
        else if (erro.code === erro.TIMEOUT) setPermissao('timeout');
        else setPermissao((p) => (p === 'concedida' ? 'concedida' : 'indisponivel'));
      },
      GEO_OPTIONS,
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      window.clearTimeout(watchdog);
    };
  }, [estacas, intervaloMedioEstacasKm]);

  return { status, permissao, sessaoInfo, estacaAtivaIndex: status?.estacaAtivaIndex ?? estacaInicialIndex };
}

export const MENSAGEM_PERMISSAO_NEGADA = 'Permissão de localização negada. Habilite a localização no navegador para navegação automática.';
