// Geocodificação reversa (item 7 da rodada 7) — só resolve o nome do
// município a partir de lat/long pra exibição, nunca participa da cadeia
// GPS→estaca (isso continua 100% offline, isolado em gpsEngine.ts). Depende
// de rede; se falhar, quem chama decide como degradar (mostrar o último
// município já resolvido, ou "indisponível offline").

interface NominatimAddress {
  city?: string;
  town?: string;
  municipality?: string;
  village?: string;
  'ISO3166-2-lvl4'?: string; // ex: "BR-MG"
}

interface NominatimResponse {
  address?: NominatimAddress;
}

export interface MunicipioResolvido {
  nome: string;
  uf: string | null;
}

export async function buscarMunicipio(lat: number, lon: number): Promise<MunicipioResolvido | null> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
      { headers: { Accept: 'application/json' } },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as NominatimResponse;
    const endereco = data.address;
    if (!endereco) return null;
    const nome = endereco.city ?? endereco.town ?? endereco.municipality ?? endereco.village ?? null;
    if (!nome) return null;
    const uf = endereco['ISO3166-2-lvl4']?.split('-')[1] ?? null;
    return { nome, uf };
  } catch {
    return null; // sem rede, timeout, CORS — quem chama trata como indisponível
  }
}
