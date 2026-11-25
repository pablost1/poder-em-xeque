import type { DatabaseSync } from "node:sqlite";
import type { VoteCode } from "../../src/lib/db";
import { LEG_ATUAL, legislaturaDaData } from "../../src/lib/legislaturas";

/** Uma votação já convertida para o formato do banco, independente de qual API a originou. */
export type ParsedVotacao = {
  chamber: "C" | "S";
  svId: string; // 'C:2655570-57' | 'S:7117'
  date: string; // AAAA-MM-DD
  description: string | null;
  result: "approved" | "rejected" | null;
  nominal: boolean;
  bill: { id: string; label: string; ementa: string | null } | null;
  members: { id: string; name: string; party: string | null; uf: string | null; photo: string | null }[];
  votes: { memberId: string; party: string | null; vote: VoteCode }[];
  orientations: { key: string; kind: "party" | "bloc"; orientation: string }[];
  /** Senado: quem não votou e o motivo oficial (AP, LS, MIS, NCom, P-NRV …). */
  ausencias?: { memberId: string; codigo: string; descricao: string | null }[];
};

/** Grava uma votação (e tudo que depende dela) numa única transação. */
export function writeVotacao(db: DatabaseSync, p: ParsedVotacao) {
  // Só o voto mais recente decide nome, partido, UF e foto: ingerir uma votação antiga não pode apagar o partido atual.
  const upMember = db.prepare(
    `INSERT INTO member_all (id, chamber, name, party, uf, photo_url, atual, ultimo_voto, em_exercicio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name      = CASE WHEN excluded.ultimo_voto >= COALESCE(member_all.ultimo_voto, '') THEN excluded.name ELSE member_all.name END,
       party     = CASE WHEN excluded.ultimo_voto >= COALESCE(member_all.ultimo_voto, '') THEN excluded.party ELSE member_all.party END,
       uf        = CASE WHEN excluded.ultimo_voto >= COALESCE(member_all.ultimo_voto, '') THEN excluded.uf ELSE member_all.uf END,
       photo_url = CASE WHEN excluded.ultimo_voto >= COALESCE(member_all.ultimo_voto, '') THEN excluded.photo_url ELSE member_all.photo_url END,
       atual     = MAX(member_all.atual, excluded.atual),
       -- votar na legislatura atual liga em_exercicio até a próxima sincronização; nunca desliga (quem desliga é a lista oficial)
       em_exercicio = MAX(member_all.em_exercicio, excluded.em_exercicio),
       ultimo_voto = MAX(COALESCE(member_all.ultimo_voto, ''), excluded.ultimo_voto)`,
  );
  const upBill = db.prepare(
    `INSERT INTO bill (id, chamber, label, ementa) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET ementa = COALESCE(excluded.ementa, bill.ementa)`,
  );
  const insSv = db.prepare(
    `INSERT OR REPLACE INTO session_vote_all (id, chamber, date, bill_id, description, result, is_nominal, legislatura)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insVote = db.prepare(
    `INSERT OR REPLACE INTO member_vote_all (session_vote_id, member_id, party_at_time, vote, legislatura) VALUES (?, ?, ?, ?, ?)`,
  );
  const insOri = db.prepare(
    `INSERT OR REPLACE INTO orientation (session_vote_id, key, kind, orientation) VALUES (?, ?, ?, ?)`,
  );

  const insAus = db.prepare("INSERT OR REPLACE INTO ausencia_senado (session_vote_id, member_id, codigo, descricao) VALUES (?, ?, ?, ?)");

  db.exec("BEGIN");
  try {
    if (p.bill) upBill.run(p.bill.id, p.chamber, p.bill.label, p.bill.ementa);
    const leg = legislaturaDaData(p.date);
    insSv.run(p.svId, p.chamber, p.date, p.bill?.id ?? null, p.description, p.result, p.nominal ? 1 : 0, leg);
    for (const m of p.members) upMember.run(m.id, p.chamber, m.name, m.party, m.uf, m.photo, leg === LEG_ATUAL ? 1 : 0, p.date, leg === LEG_ATUAL ? 1 : 0);
    for (const v of p.votes) insVote.run(p.svId, v.memberId, v.party, v.vote, leg);
    for (const o of p.orientations) insOri.run(p.svId, o.key, o.kind, o.orientation);
    for (const a of p.ausencias ?? []) insAus.run(p.svId, a.memberId, a.codigo, a.descricao);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Divide [from, to] em janelas de no máximo `days` dias (as APIs rejeitam intervalos longos). */
export function windows(from: string, to: string, days: number): [string, string][] {
  const out: [string, string][] = [];
  const end = new Date(`${to}T00:00:00Z`);
  for (let s = new Date(`${from}T00:00:00Z`); s <= end; ) {
    const e = new Date(Math.min(s.getTime() + (days - 1) * 86400000, end.getTime()));
    out.push([s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)]);
    s = new Date(e.getTime() + 86400000);
  }
  return out;
}
