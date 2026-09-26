import type { DrenoStatus } from '../types/domain';
import { CORES_DRENO } from '../config/paleta';

const LABEL: Record<DrenoStatus, string> = { raso: 'Raso', profundo: 'Profundo', ausente: 'Ausente' };

/** Barra contínua de 8-10px na lateral direita — seção 7. Cor + texto (nunca só cor). */
export function DrenoBar({ status }: { status: DrenoStatus }) {
  return (
    <div className="flex items-center gap-1" title={`Dreno: ${LABEL[status]}`}>
      <span className="h-10 w-2.5 rounded-full" style={{ backgroundColor: CORES_DRENO[status] }} />
      <span className="text-[10px] font-bold text-neutral-600">{LABEL[status][0]}</span>
    </div>
  );
}
