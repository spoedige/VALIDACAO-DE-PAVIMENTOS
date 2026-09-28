// Checagem par-a-par de distinguibilidade da paleta sob daltonismo comum
// (deuteranopia/protanopia), usando a matriz de simulação de Machado et al.
// 2009 (aproximação padrão da indústria, mesma usada por ferramentas como o
// Chrome DevTools "Emulate vision deficiencies").
const MATRIZES = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
};

function hexParaRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function simular(matriz, [r, g, b]) {
  const [row1, row2, row3] = matriz;
  const aplicar = (row) => row[0] * r + row[1] * g + row[2] * b;
  return [aplicar(row1), aplicar(row2), aplicar(row3)].map((v) => Math.max(0, Math.min(255, v)));
}

function distanciaEuclidiana(a, b) {
  return Math.sqrt(a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0));
}

const paleta = {
  'Reparo Profundo (RPX)': '#FFC000',
  'Reconstrução (REX)': '#C00000',
  'Fresagem Fina (FF)': '#CC99FF',
  'Fresagem Funcional': '#9DC3E6',
  'Fresagem Estrutural': '#F8CBAD',
  'Selagem de Trincas (ST)': '#E87BA4',
  'Microfresagem (MFS)': '#1BAF7A',
  'Microrrevest. (M)': '#A9CF8F',
  'Dreno Raso': '#4EA6FC',
  'Dreno Profundo': '#1F4E79',
  'Dreno Ausente': '#C3C2B7',
};

const LIMIAR_ALERTA = 30; // distância euclidiana em RGB simulado abaixo disso = difícil distinguir

const nomes = Object.keys(paleta);
for (const [tipo, matriz] of Object.entries(MATRIZES)) {
  console.log(`\n=== ${tipo} ===`);
  const achados = [];
  for (let i = 0; i < nomes.length; i++) {
    for (let j = i + 1; j < nomes.length; j++) {
      const a = simular(matriz, hexParaRgb(paleta[nomes[i]]));
      const b = simular(matriz, hexParaRgb(paleta[nomes[j]]));
      const d = distanciaEuclidiana(a, b);
      if (d < LIMIAR_ALERTA) achados.push({ par: `${nomes[i]} vs ${nomes[j]}`, distancia: d.toFixed(1) });
    }
  }
  if (achados.length === 0) console.log('Nenhum par abaixo do limiar — todas as cores permanecem razoavelmente distinguíveis.');
  else achados.forEach((a) => console.log(`  ATENÇÃO: ${a.par} — distância ${a.distancia}`));
}
