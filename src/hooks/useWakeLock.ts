import { useEffect } from 'react';

export function useWakeLock(ativo: boolean) {
  useEffect(() => {
    if (!ativo || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelado = false;

    async function pedir() {
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelado) {
          await s.release();
        } else {
          sentinel = s;
        }
      } catch {
        // ambiente sem suporte, ou tela não visível — sem crash, sem retry agressivo
      }
    }
    pedir();

    function aoVoltarVisivel() {
      if (document.visibilityState === 'visible') pedir();
    }
    document.addEventListener('visibilitychange', aoVoltarVisivel);

    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', aoVoltarVisivel);
      sentinel?.release().catch(() => {});
    };
  }, [ativo]);
}
