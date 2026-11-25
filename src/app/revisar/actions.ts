"use server";

import { openDb } from "@/lib/db";
import { deriveHistorico, deriveIv } from "@/lib/derive";

/** Salva a correção humana da marcação de uma votação e recalcula o perfil de votação. Só uso local (ADMIN=1). */
export async function saveTag(formData: FormData) {
  if (process.env.ADMIN !== "1") throw new Error("A revisão está desativada. Inicie o servidor com ADMIN=1.");

  const sv = String(formData.get("sv") ?? "");
  const num = (k: string, lo: number, hi: number) => {
    const v = Number(formData.get(k));
    if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${k} deve estar entre ${lo} e ${hi}`);
    return v;
  };
  const economic = num("economic", -1, 1);
  const privilege = num("privilege", -1, 1);
  const confidence = num("confidence", 0, 1);
  const procedural = formData.get("procedural") === "on" ? 1 : 0;
  const rationale = String(formData.get("rationale") ?? "").slice(0, 300) || null;

  const db = openDb();
  // session_vote_all: a revisão vale para qualquer legislatura, não só a atual.
  const exists = db.prepare("SELECT 1 FROM session_vote_all WHERE id = ?").get(sv);
  if (!exists) throw new Error(`Votação desconhecida: ${sv}`);
  db.prepare(
    `INSERT OR REPLACE INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver)
     VALUES (?, 'human', ?, ?, ?, ?, ?, 'human')`,
  ).run(sv, economic, privilege, procedural, confidence, rationale);
  deriveIv(db);
  // Perfis por legislatura e por partido (sem recalcular a concordância entre partidos, que não depende das marcações).
  deriveHistorico(db, undefined, { perfilApenas: true });
}
