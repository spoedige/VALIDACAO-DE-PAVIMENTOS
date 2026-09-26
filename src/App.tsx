import { useState } from 'react';
import type { ImportResult } from './types/domain';
import { useNormalizationConfig } from './hooks/useNormalizationConfig';
import { ListaProjetosScreen } from './screens/ListaProjetosScreen';
import { ImportScreen } from './screens/ImportScreen';
import { ValidationScreen } from './screens/ValidationScreen';
import { VistoriaScreen } from './screens/VistoriaScreen';
import { ExportScreen } from './screens/ExportScreen';
import { requestPersistentStorage } from './db/projectService';

type View =
  | { tipo: 'lista' }
  | { tipo: 'import' }
  | { tipo: 'validacao'; resultado: ImportResult }
  | { tipo: 'vistoria'; projectId: string }
  | { tipo: 'exportar'; projectId: string };

function App() {
  const { config, erro } = useNormalizationConfig();
  const [view, setView] = useState<View>({ tipo: 'lista' });

  useState(() => {
    requestPersistentStorage();
  });

  if (erro) {
    return <p className="p-4 font-bold text-red-700">Falha ao carregar configuração de normalização: {erro}</p>;
  }
  if (!config) {
    return <p className="p-4 text-neutral-600">Carregando…</p>;
  }

  switch (view.tipo) {
    case 'lista':
      return (
        <ListaProjetosScreen
          onNovoProjeto={() => setView({ tipo: 'import' })}
          onAbrirProjeto={(projectId) => setView({ tipo: 'vistoria', projectId })}
        />
      );
    case 'import':
      return (
        <ImportScreen
          config={config}
          onCancelar={() => setView({ tipo: 'lista' })}
          onImportado={(resultado) => setView({ tipo: 'validacao', resultado })}
        />
      );
    case 'validacao':
      return (
        <ValidationScreen
          resultado={view.resultado}
          onVoltar={() => setView({ tipo: 'import' })}
          onIniciarVistoria={(projectId) => setView({ tipo: 'vistoria', projectId })}
        />
      );
    case 'vistoria':
      return (
        <VistoriaScreen
          projectId={view.projectId}
          config={config}
          onVoltar={() => setView({ tipo: 'lista' })}
          onExportar={(projectId) => setView({ tipo: 'exportar', projectId })}
        />
      );
    case 'exportar':
      return <ExportScreen projectId={view.projectId} onVoltar={() => setView({ tipo: 'vistoria', projectId: view.projectId })} />;
  }
}

export default App;
