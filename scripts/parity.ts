/**
 * Prova de paridade: o que o site mostra para a legislatura atual não pode mudar quando acrescentamos histórico.
 *   npx tsx scripts/parity.ts --save   # grava data/history/parity-baseline.json
 *   npx tsx scripts/parity.ts          # compara o banco atual com a linha de base
 * Resume (contagem + hash) as tabelas derivadas e o resultado de consultas representativas.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db";
import * as q from "../src/lib/queries";
import { EIXOS } from "../src/lib/eixos";

const BASE = path.join(process.cwd(), "data", "history", "parity-baseline.json");
const db = openDb(true);
const sha = (x: unknown) => crypto.createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0, 12);
/** Ordena arrays recursivamente: para consultas cujo desempate entre linhas iguais não é definido (depende do plano do SQLite). */
const canon = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(canon).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) :
  x && typeof x === "object" ? Object.fromEntries(Object.entries(x).sort().map(([k, v]) => [k, canon(v)])) : x;
const SEM_ORDEM = new Set(["agreementMatrix", "pairVotes"]);

const TABELAS = [
  "party_position", "party_stats", "party_agreement", "member_party_agreement", "member_loyalty", "member_governo",
  "party_governo", "member_iv", "party_iv", "member_mapa", "mapa_meta", "validacao", "vote_tag_eff",
  "member", "session_vote", "member_vote", "orientation",
];
const snap: Record<string, string> = {};
for (const t of TABELAS) {
  try {
    // vote_tag_eff passa a conter também marcações de legislaturas antigas: compara só as da atual.
    const sql =
      t === "vote_tag_eff" ? "SELECT * FROM vote_tag_eff WHERE sv IN (SELECT id FROM session_vote)"
      : t === "orientation" ? "SELECT * FROM orientation WHERE session_vote_id IN (SELECT id FROM session_vote)"
      : `SELECT * FROM ${t}`;
    const rows = db.prepare(sql).all().map((r) => ({ ...(r as object) }));
    const cols = rows.length ? Object.keys(rows[0]).filter((c) => c !== "legislatura" && c !== "atual" && c !== "ultimo_voto") : [];
    const norm = rows.map((r) => cols.map((c) => (r as Record<string, unknown>)[c]));
    norm.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    snap[`tabela:${t}`] = `${rows.length}:${sha(norm)}`;
  } catch (e) {
    snap[`tabela:${t}`] = `ERRO ${(e as Error).message}`;
  }
}

const primeiro = (db.prepare("SELECT id FROM member WHERE chamber='C' ORDER BY id LIMIT 1").get() as { id: string }).id;
const senador = (db.prepare("SELECT id FROM member WHERE chamber='S' ORDER BY id LIMIT 1").get() as { id: string }).id;
const bacelar = (db.prepare("SELECT id FROM member WHERE name LIKE 'Bacelar%' LIMIT 1").get() as { id: string } | undefined)?.id ?? primeiro;
const consultas: Record<string, () => unknown> = {
  stats: () => q.stats(),
  listMembers: () => q.listMembers({}),
  listParties: () => q.listParties(),
  memberSummary: () => [primeiro, senador, bacelar].map((i) => q.memberSummary(i)),
  memberVotes: () => [primeiro, bacelar].map((i) => q.memberVotes(i, 50, 0)),
  agreementMatrix: () => [q.agreementMatrix("ALL"), q.agreementMatrix("C"), q.agreementMatrix("S")],
  pairVotes: () => q.pairVotes("PT", "PL", "C"),
  memberVsParty: () => q.memberVsParty(bacelar, "PL"),
  memberIv: () => [primeiro, senador, bacelar].map((i) => q.memberIv(i)),
  partyIv: () => ["PT", "PL", "PSOL", "NOVO"].map((p) => q.partyIv(p)),
  memberTopics: () => q.memberTopics(bacelar),
  notableVotes: () => q.notableVotes({ memberId: bacelar }),
  rankings: () => EIXOS.map((e) => [q.rankMembers(e, { limit: 200, offset: 0 }), q.rankParties(e)]),
  posicoes: () => EIXOS.map((e) => [q.posicaoMembro(bacelar, e), q.posicaoPartido("PT", e)]),
  status: () => q.getStatus(),
  alinhamento: () => [q.memberAlinhamento(bacelar), q.partyGoverno("PT")],
  votacao: () => [q.getVotacao("C:2655570-57"), q.votacaoPorPartido("C:2655570-57"), q.votacaoVotos("C:2655570-57", { limit: 30, offset: 0 })],
  busca: () => [q.buscarProjetos("tribut", { limit: 50 }), q.buscarParlamentares("silva")],
  mapa: () => [q.mapaPontos("C"), q.mapaMeta("C"), q.mapaPontos("S"), q.validacao()],
  memberVsMember: () => q.memberVsMember(bacelar, primeiro),
};
for (const [nome, fn] of Object.entries(consultas)) {
  try {
    snap[`consulta:${nome}`] = sha(SEM_ORDEM.has(nome) ? canon(fn()) : fn());
  } catch (e) {
    snap[`consulta:${nome}`] = `ERRO ${(e as Error).message.slice(0, 80)}`;
  }
}

if (process.argv.includes("--save")) {
  fs.writeFileSync(BASE, JSON.stringify(snap, null, 2));
  console.log(`Linha de base gravada (${Object.keys(snap).length} itens) em ${BASE}`);
  for (const [k, v] of Object.entries(snap)) if (v.startsWith("ERRO")) console.log("  aviso:", k, v);
} else {
  const base = JSON.parse(fs.readFileSync(BASE, "utf8")) as Record<string, string>;
  let diff = 0;
  for (const k of Object.keys(base)) {
    if (base[k] !== snap[k]) {
      diff++;
      console.log(`DIFERE ${k}: antes ${base[k]} | agora ${snap[k]}`);
    }
  }
  console.log(diff ? `${diff} item(ns) diferem` : `Paridade ok: ${Object.keys(base).length} itens idênticos`);
  process.exit(diff ? 1 : 0);
}
