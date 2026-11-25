/**
 * Descobre quem está em exercício hoje, pelas listas oficiais, e grava em member_all.em_exercicio.
 *   npm run sync:exercicio
 * "Votou na legislatura atual" não basta: suplentes e titulares que saíram também votaram. Também é chamado por
 * `npm run update`. Se a API falhar ou devolver uma lista de tamanho implausível, nada é alterado.
 */
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/lib/db";
import { getJson } from "./lib/http";
import { aplicarExercicio, idsCamara, idsSenado, type CamaraRoster, type ResultadoSync, type SenadoRoster } from "./lib/parse-exercicio";

const CAMARA = "https://dadosabertos.camara.leg.br/api/v2/deputados?itens=100&pagina=1";
const SENADO = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual";

export async function sincronizarExercicio(db: DatabaseSync): Promise<ResultadoSync> {
  const camara: string[] = [];
  let url: string | undefined = CAMARA;
  while (url) {
    const p: CamaraRoster = await getJson<CamaraRoster>(url, { cache: false });
    camara.push(...idsCamara(p));
    url = p.links?.find((l) => l.rel === "next")?.href;
  }
  const senado = idsSenado(await getJson<SenadoRoster>(SENADO, { cache: false }));
  return aplicarExercicio(db, camara, senado);
}

if (require.main === module) {
  const db = openDb();
  sincronizarExercicio(db)
    .then((r) => console.log(`Em exercício: ${r.camara} deputados, ${r.senado} senadores (${r.mudancas} alterações).`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
