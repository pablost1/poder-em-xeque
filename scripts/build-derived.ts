/**
 * Rebuild the derived (precomputed) tables the site reads. Run after any ingestion or tag import:
 *   npm run derive            # tudo
 *   npm run derive -- --iv    # só o perfil de votação (rápido; use após mudar marcações)
 * The logic lives in src/lib/derive.ts so the review page can reuse the IV part.
 */
import { openDb } from "../src/lib/db";
import { deriveCore, deriveHistorico, deriveIv, deriveMandatos, deriveMapaLegislatura } from "../src/lib/derive";
import { derivePresenca } from "../src/lib/derive-presenca";

const db = openDb();
const t0 = Date.now();
const log = (name: string, s: number) => console.log(`  ${name} (${s.toFixed(1)}s)`);

if (!process.argv.includes("--iv")) deriveCore(db, log);
deriveIv(db, log);
deriveHistorico(db, log);
deriveMandatos(db, log);
deriveMapaLegislatura(db, log);
derivePresenca(db, log);

const n = (t: string) => (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
console.log(
  `Done in ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
  Object.fromEntries(
    ["party_position", "party_agreement", "member_party_agreement", "member_loyalty", "vote_tag_eff", "member_iv", "party_iv"].map(
      (t) => [t, n(t)],
    ),
  ),
);
