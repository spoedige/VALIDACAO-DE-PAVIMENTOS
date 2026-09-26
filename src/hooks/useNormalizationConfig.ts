import { useEffect, useState } from 'react';
import { loadNormalizationConfig, type NormalizationConfig } from '../services/normalizer';

export function useNormalizationConfig() {
  const [config, setConfig] = useState<NormalizationConfig | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    loadNormalizationConfig()
      .then((c) => { if (!cancelado) setConfig(c); })
      .catch((e: unknown) => { if (!cancelado) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { cancelado = true; };
  }, []);

  return { config, erro };
}
