/**
 * Importa as votações nominais de plenário da Câmara dos Deputados.
 *   npx tsx scripts/ingest-camara.ts --from 2026-01-01 --to 2026-11-24
 * Retomável: votações já no banco são ignoradas; o JSON bruto da API fica em cache em data/raw.
 */
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/lib/db";
import { getJson, pool } from "./lib/http";
import { windows, writeVotacao } from "./lib/parsed";
import {
  parseVotacaoCamara,
  type Orient,
  type VotacaoDetail,
  type VotacaoListItem,
  type VotoItem,
} from "./lib/parse-camara";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";

type Link = { rel: string; href: string };
type ListResp<T> = { dados: T[]; links?: Link[] };

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function listVotacoes(from: string, to: string): Promise<VotacaoListItem[]> {
  const out: VotacaoListItem[] = [];
  // A API rejeita intervalos longos (HTTP 400): lista em janelas de até 30 dias.
  for (const [a, b] of windows(from, to, 30)) {
    let url: string | undefined =
      `${BASE}/votacoes?dataInicio=${a}&dataFim=${b}&itens=200&ordem=ASC&ordenarPor=dataHoraRegistro`;
    while (url) {
      const page: ListResp<VotacaoListItem> = await getJson(url, { cache: false });
      out.push(...page.dados);
      url = page.links?.find((l) => l.rel === "next")?.href;
    }
  }
  return out.filter((v) => v.siglaOrgao === "PLEN");
}

/** Importa o período e devolve quantas votações novas entraram. */
export async function ingestCamara(db: DatabaseSync, from: string, to: string): Promise<number> {
  const known = new Set(
    (db.prepare("SELECT id FROM session_vote_all WHERE chamber = 'C'").all() as { id: string }[]).map((r) => r.id),
  );
  console.log(`Câmara: listando votações de plenário ${from} → ${to} …`);
  const all = await listVotacoes(from, to);
  const todo = all.filter((v) => !known.has(`C:${v.id}`));
  console.log(`  ${all.length} votações de plenário, ${todo.length} novas.`);

  let done = 0;
  await pool(todo, 4, async (item) => {
    const [detail, votos, ori] = await Promise.all([
      getJson<VotacaoDetail>(`${BASE}/votacoes/${item.id}`),
      getJson<ListResp<VotoItem>>(`${BASE}/votacoes/${item.id}/votos`),
      getJson<ListResp<Orient>>(`${BASE}/votacoes/${item.id}/orientacoes`),
    ]);
    writeVotacao(db, parseVotacaoCamara(item, detail, votos, ori));
    if (++done % 25 === 0) console.log(`  ${done}/${todo.length}`);
  });
  return todo.length;
}

if (require.main === module) {
  const db = openDb();
  ingestCamara(db, arg("from", "2023-02-01"), arg("to", new Date().toISOString().slice(0, 10)))
    .then(() => {
      const c = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM session_vote WHERE chamber='C' AND is_nominal=1) AS nominal,
                  (SELECT COUNT(*) FROM member WHERE chamber='C') AS members,
                  (SELECT COUNT(*) FROM member_vote WHERE member_id LIKE 'C:%') AS votes`,
        )
        .get();
      console.log("Pronto.", c);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
