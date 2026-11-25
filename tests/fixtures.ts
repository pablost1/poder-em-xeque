import type { DatabaseSync } from "node:sqlite";
import { openMemoryDb } from "../src/lib/db";

/**
 * Banco minúsculo com números calculáveis à mão.
 *
 * Partidos (Câmara): A = a1 a2 a3, B = b1 b2 b3, C = c1 c2. Senado: s1 e s3 (A), s2 (B).
 *
 *            a1   a2   a3   b1   b2   b3   c1   c2   | posição A / B / C
 *   v1  (+0,6 mercado, conf 1,0)
 *            S    S    N    N    N    N    S    N    | SIM / NAO / (empate: sem posição)
 *   v2  (−0,5 Estado, conf 0,8)
 *            S    S    S    N    S    N    S    S    | SIM / NAO / SIM
 *   v3  (privilégio +1,0, conf 1,0)
 *            N    N    N    N    N    S    N    ABS  | NAO / NAO / (1 votante: sem posição)
 *   v4  (+1,0 mercado, conf 0,5)
 *            S    N    –    S    S    –    –    –    | (empate: sem posição) / SIM / –
 *   v5  procedimental: todos SIM
 *   v6  Senado: s1 SIM, s2 NAO, s3 SIM
 */
export const F = {
  parties: ["A", "B", "C"],
  deputies: { A: ["a1", "a2", "a3"], B: ["b1", "b2", "b3"], C: ["c1", "c2"] } as Record<string, string[]>,
};

const S_ = "SIM", N_ = "NAO", X_ = "ABS";

const VOTES: Record<string, Record<string, string>> = {
  "C:100-1": { a1: S_, a2: S_, a3: N_, b1: N_, b2: N_, b3: N_, c1: S_, c2: N_ },
  "C:100-2": { a1: S_, a2: S_, a3: S_, b1: N_, b2: S_, b3: N_, c1: S_, c2: S_ },
  "C:100-3": { a1: N_, a2: N_, a3: N_, b1: N_, b2: N_, b3: S_, c1: N_, c2: X_ },
  "C:100-4": { a1: S_, a2: N_, b1: S_, b2: S_ },
  "C:100-5": { a1: S_, a2: S_, a3: S_, b1: S_, b2: S_, b3: S_, c1: S_, c2: S_ },
  "S:200": { s1: S_, s2: N_, s3: S_ },
};

const TAGS: Record<string, { e: number; p: number; proc: number; c: number }> = {
  "C:100-1": { e: 0.6, p: 0, proc: 0, c: 1.0 },
  "C:100-2": { e: -0.5, p: 0, proc: 0, c: 0.8 },
  "C:100-3": { e: 0, p: 1.0, proc: 0, c: 1.0 },
  "C:100-4": { e: 1.0, p: 0, proc: 0, c: 0.5 },
  "C:100-5": { e: 0, p: 0, proc: 1, c: 0.9 },
};

export function buildFixture(): DatabaseSync {
  const db = openMemoryDb();
  const party: Record<string, string> = {};
  for (const [p, ms] of Object.entries(F.deputies)) for (const m of ms) party[m] = p;
  party.s1 = "A"; party.s2 = "B"; party.s3 = "A";

  const insM = db.prepare("INSERT INTO member (id, chamber, name, party, uf, photo_url) VALUES (?, ?, ?, ?, ?, NULL)");
  for (const [m, p] of Object.entries(party)) {
    const chamber = m.startsWith("s") ? "S" : "C";
    insM.run(`${chamber}:${m}`, chamber, m.toUpperCase(), p, m.startsWith("s") ? "RJ" : "PE");
  }

  const insB = db.prepare("INSERT INTO bill (id, chamber, label, ementa) VALUES (?, ?, ?, ?)");
  const insSv = db.prepare("INSERT INTO session_vote (id, chamber, date, bill_id, description, result, is_nominal) VALUES (?, ?, ?, ?, ?, ?, 1)");
  const insV = db.prepare("INSERT INTO member_vote (session_vote_id, member_id, party_at_time, vote) VALUES (?, ?, ?, ?)");
  let day = 1;
  for (const [sv, votes] of Object.entries(VOTES)) {
    const chamber = sv[0];
    const bill = `${chamber}:B${sv.slice(2).split("-")[0]}${sv.includes("-") ? sv.split("-")[1] : ""}`;
    insB.run(bill, chamber, `PL ${day}/2025`, `Ementa do projeto ${day}`);
    insSv.run(sv, chamber, `2025-01-${String(day++).padStart(2, "0")}`, bill, `Votação ${sv}`, "approved");
    for (const [m, v] of Object.entries(votes)) insV.run(sv, `${chamber}:${m}`, party[m], v);
  }

  const insT = db.prepare(
    "INSERT INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver) VALUES (?, 'llm', ?, ?, ?, ?, 'teste', 'r1')",
  );
  for (const [sv, t] of Object.entries(TAGS)) insT.run(sv, t.e, t.p, t.proc, t.c);

  // Orientações (Câmara): usadas nos testes de alinhamento com o Governo e com o líder.
  const insO = db.prepare("INSERT INTO orientation (session_vote_id, key, kind, orientation) VALUES (?, ?, ?, ?)");
  insO.run("C:100-1", "Governo", "bloc", "Sim");
  insO.run("C:100-1", "A", "party", "Sim");
  insO.run("C:100-1", "B", "party", "Não");
  insO.run("C:100-2", "Governo", "bloc", "Não");
  insO.run("C:100-2", "A", "party", "Sim");
  insO.run("C:100-3", "Governo", "bloc", "Liberado");
  insO.run("C:100-3", "A", "party", "Não");
  insO.run("C:100-4", "Governo", "bloc", "Sim");
  return db;
}
