import { useEffect, useRef, useState } from 'react';
import { buscarMunicipio, type MunicipioResolvido } from '../services/geocodificacao';

// não bate na API a cada leitura de GPS (várias por minuto) — só de vez em
// quando, o suficiente pra acompanhar o veículo sem sobrecarregar o serviço
// gratuito do Nominatim.
const INTERVALO_MIN_MS = 20000;

/**
 * Município atual via geocodificação reversa online (item 7 da rodada 7).
 * Se a busca falhar (sem rede, serviço fora do ar), mantém o ÚLTIMO
 * município resolvido com sucesso e marca como desatualizado — nunca limpa
 * o valor anterior só porque a tentativa mais recente falhou.
 */
export function useMunicipioAtual(lat: number | null, lon: number | null) {
  const [municipio, setMunicipio] = useState<MunicipioResolvido | null>(null);
  const [desatualizado, setDesatualizado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const ultimaBuscaEmRef = useRef(0);
  const emVooRef = useRef(false);

  useEffect(() => {
    if (lat === null || lon === null) return;
    const agora = Date.now();
    if (emVooRef.current || agora - ultimaBuscaEmRef.current < INTERVALO_MIN_MS) return;

    emVooRef.current = true;
    ultimaBuscaEmRef.current = agora;
    setCarregando(true);
    buscarMunicipio(lat, lon)
      .then((resolvido) => {
        if (resolvido) setMunicipio(resolvido);
        setDesatualizado(resolvido === null);
      })
      .finally(() => {
        emVooRef.current = false;
        setCarregando(false);
      });
  }, [lat, lon]);

  return { municipio, desatualizado, carregando };
}
