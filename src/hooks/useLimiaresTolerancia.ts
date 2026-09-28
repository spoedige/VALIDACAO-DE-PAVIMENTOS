import { useEffect, useState } from 'react';
import { loadLimiaresTolerancia, type LimiaresToleranciaConfig } from '../services/tolerancia';

export function useLimiaresTolerancia() {
  const [config, setConfig] = useState<LimiaresToleranciaConfig | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    loadLimiaresTolerancia()
      .then((c) => { if (!cancelado) setConfig(c); })
      .catch((e: unknown) => { if (!cancelado) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { cancelado = true; };
  }, []);

  return { config, erro };
}
