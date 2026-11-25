/**
 * Importa as votações nominais de plenário do Senado Federal.
 *   npx tsx scripts/ingest-senado.ts --from 2023-02-01 --to 2026-11-24
 *
 * Fonte: https://legis.senado.leg.br/dadosabertos/votacao (um registro por votação, com os votos e o partido de cada
 * senador). A API aceita no máximo 1 ano por requisição. Votações secretas e rótulos que não são voto são ignorados
 * (ver scripts/lib/parse-senado.ts).
 */
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/lib/db";
import { getJson } from "./lib/http";
import { windows, writeVotacao } from "./lib/parsed";
import { ausenciasDoSenado, parseVotacaoSenado, type VotacaoSenado } from "./lib/parse-senado";

const BASE = "https://legis.senado.leg.br/dadosabertos";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Importa o período e devolve quantas votações novas entraram. */
export async function ingestSenado(db: DatabaseSync, from: string, to: string): Promise<number> {
  const known = new Set(
    (db.prepare("SELECT id FROM session_vote_all WHERE chamber = 'S'").all() as { id: string }[]).map((r) => r.id),
  );
  let seen = 0;
  let secretas = 0;
  let novas = 0;
  // Janelas de ~6 meses (o limite da API é 1 ano; janelas menores deixam as respostas manejáveis).
  for (const [a, b] of windows(from, to, 183)) {
    const list = await getJson<VotacaoSenado[]>(`${BASE}/votacao?dataInicio=${a}&dataFim=${b}`, { cache: false });
    if (!Array.isArray(list)) throw new Error(`Resposta inesperada para ${a}..${b}: ${JSON.stringify(list).slice(0, 200)}`);
    for (const v of list) {
      seen++;
      if (v.votacaoSecreta === "S") {
        secretas++;
        continue;
      }
      if (known.has(`S:${v.codigoSessaoVotacao}`)) continue;
      const parsed = parseVotacaoSenado(v);
      if (!parsed) continue;
      writeVotacao(db, parsed);
      novas++;
    }
    console.log(`  Senado ${a} → ${b}: ${list.length} votações`);
  }
  console.log(`Senado: ${seen} vistas, ${secretas} secretas, ${novas} novas.`);
  return novas;
}

/**
 * Só as ausências (por que cada senador não votou) das votações que já estão no banco. Não mexe nos votos. Serve para
 * completar bancos importados antes de guardarmos esse motivo.
 */
export async function ingestSenadoAusencias(db: DatabaseSync, from: string, to: string): Promise<number> {
  const known = new Set((db.prepare("SELECT id FROM session_vote_all WHERE chamber = 'S'").all() as { id: string }[]).map((r) => r.id));
  const ins = db.prepare("INSERT OR REPLACE INTO ausencia_senado (session_vote_id, member_id, codigo, descricao) VALUES (?, ?, ?, ?)");
  let n = 0;
  for (const [a, b] of windows(from, to, 183)) {
    const list = await getJson<VotacaoSenado[]>(`${BASE}/votacao?dataInicio=${a}&dataFim=${b}`, { cache: false });
    if (!Array.isArray(list)) throw new Error(`Resposta inesperada para ${a}..${b}`);
    db.exec("BEGIN");
    for (const v of list) {
      const sv = `S:${v.codigoSessaoVotacao}`;
      if (!known.has(sv)) continue;
      for (const x of ausenciasDoSenado(v)) {
        ins.run(sv, x.memberId, x.codigo, x.descricao);
        n++;
      }
    }
    db.exec("COMMIT");
    console.log(`  Senado ${a} → ${b}: ${n} ausências até agora`);
  }
  return n;
}

if (require.main === module) {
  const db = openDb();
  const soAusencias = process.argv.includes("--ausencias");
  (soAusencias
    ? ingestSenadoAusencias(db, arg("from", "2003-02-01"), arg("to", new Date().toISOString().slice(0, 10)))
    : ingestSenado(db, arg("from", "2023-02-01"), arg("to", new Date().toISOString().slice(0, 10)))
  )
    .then(() => {
      const c = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM session_vote WHERE chamber='S') AS votacoes,
                  (SELECT COUNT(*) FROM member WHERE chamber='S') AS senators,
                  (SELECT COUNT(*) FROM member_vote WHERE member_id LIKE 'S:%') AS votes`,
        )
        .get();
      console.log("Pronto.", c);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
