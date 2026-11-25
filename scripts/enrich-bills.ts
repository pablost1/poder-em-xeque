/**
 * Busca, na API da Câmara, as palavras-chave e o link do inteiro teor das proposições que têm votação nominal.
 *   npx tsx scripts/enrich-bills.ts
 * Só consulta proposições ainda sem `keywords` (vazio = já consultada, sem palavras-chave). Resposta em cache.
 * O Senado não oferece o mesmo campo; essas proposições seguem só com a ementa.
 */
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/lib/db";
import { getJson, pool } from "./lib/http";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";

type Proposicao = { dados: { keywords?: string | null; urlInteiroTeor?: string | null; ementaDetalhada?: string | null } | [] };

/** Devolve quantas proposições foram completadas. */
export async function enrichBills(db: DatabaseSync): Promise<number> {
  const todo = db
    .prepare(
      `SELECT DISTINCT b.id FROM bill b JOIN session_vote sv ON sv.bill_id = b.id
        WHERE sv.is_nominal = 1 AND b.id LIKE 'C:%' AND b.keywords IS NULL`,
    )
    .all() as { id: string }[];
  if (!todo.length) return 0;
  console.log(`Palavras-chave: ${todo.length} proposições da Câmara a consultar …`);
  const up = db.prepare("UPDATE bill SET keywords = ?, url_inteiro_teor = ? WHERE id = ?");
  let done = 0;
  await pool(todo, 4, async ({ id }) => {
    const r = await getJson<Proposicao>(`${BASE}/proposicoes/${id.slice(2)}`);
    const d = Array.isArray(r.dados) ? {} : r.dados;
    // "" marca "já consultada" para não repetir a chamada.
    up.run((d.keywords ?? "").trim(), d.urlInteiroTeor ?? null, id);
    if (++done % 100 === 0) console.log(`  ${done}/${todo.length}`);
  });
  return done;
}

if (require.main === module) {
  enrichBills(openDb())
    .then((n) => console.log(`Pronto: ${n} proposições completadas.`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
