import Dexie, { type EntityTable } from 'dexie';
import type { Estaca, FieldChangeHistoryEntry, FieldLog, Projeto } from '../types/domain';

// Station persistida = Estaca (somente leitura, vinda do import) + o projectId
// dono, já que uma mesma tabela guarda estacas de todos os projetos do aparelho.
export interface StationRow extends Estaca {
  projectId: string;
}

export class VistoriaDB extends Dexie {
  projects!: EntityTable<Projeto, 'projectId'>;
  stations!: EntityTable<StationRow, 'projectId'>; // chave composta real: [projectId+id]
  fieldLogs!: EntityTable<FieldLog, 'id'>;
  fieldChangeHistory!: EntityTable<FieldChangeHistoryEntry, 'id'>;

  constructor(name = 'vistoria-pavimento') {
    super(name);
    this.version(1).stores({
      projects: 'projectId, sourceFileHash',
      stations: '[projectId+id], projectId',
      fieldLogs: '++id, [projectId+estacaId+faixa], projectId',
      fieldChangeHistory: '++id, projectId, estacaId, timestamp',
    });
  }
}

export const db = new VistoriaDB();
