import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { openDb } from "./db";
import { colunaDoEixo, type Eixo } from "./eixos";
import { NATUREZA_INFO, type Natureza } from "./mandato";
import { periodoDaLegislatura } from "./legislaturas";
import { resumoDistribuicao, type ResumoDistribuicao } from "./presenca";

/*
 * Read-only queries for the site. Heavy aggregates (party positions, agreement, loyalty) come
 * from the derived tables built by `npm run derive` (scripts/build-derived.ts).
 */

let _db: DatabaseSync | null = null;
function db(): DatabaseSync {
  if (!_db) _db = openDb(true);
  return _db;
}

/** Só para testes: usa o banco informado (ex.: em memória) no lugar do arquivo; `null` volta ao padrão. */
export function useDb(d: DatabaseSync | null) {
  _db = d;
}

/** node:sqlite returns null-prototype rows; spread into plain objects. */
function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return (db().prepare(sql).all(...params) as Record<string, unknown>[]).map((r) => ({ ...r }) as T);
}
function one<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  const r = db().prepare(sql).get(...params) as Record<string, unknown> | undefined;
  return r ? ({ ...r } as T) : undefined;
}

export type Member = {
  id: string;
  chamber: "C" | "S";
  name: string;
  party: string | null;
  uf: string | null;
  photo_url: string | null;
};

export function stats() {
  return one<{ votacoes: number; members: number; votes: number; first: string; last: string }>(
    `SELECT (SELECT COUNT(*) FROM session_vote WHERE is_nominal = 1) AS votacoes,
            (SELECT COUNT(*) FROM member) AS members,
            (SELECT COUNT(*) FROM member_vote) AS votes,
            (SELECT MIN(date) FROM session_vote WHERE is_nominal = 1) AS first,
            (SELECT MAX(date) FROM session_vote WHERE is_nominal = 1) AS last`,
  )!;
}

export function listMembers(opts: { q?: string; party?: string; chamber?: string }) {
  const where: string[] = [];
  const params: SQLInputValue[] = [];
  if (opts.q) {
    // Sem acento e sem diferença de maiúsculas (índice FTS); se o texto não tiver palavras, cai no LIKE simples.
    const fts = ftsQuery(opts.q);
    if (fts) {
      where.push("m.id IN (SELECT member_id FROM member_fts WHERE member_fts MATCH ?)");
      params.push(fts);
    } else {
      where.push("m.name LIKE ?");
      params.push(`%${opts.q}%`);
    }
  }
  if (opts.party) {
    where.push("m.party = ?");
    params.push(opts.party);
  }
  if (opts.chamber === "C" || opts.chamber === "S") {
    where.push("m.chamber = ?");
    params.push(opts.chamber);
  }
  return all<Member & { votes: number }>(
    `SELECT m.*, (SELECT COUNT(*) FROM member_vote v WHERE v.member_id = m.id) AS votes
       FROM member m ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY m.name LIMIT 200`,
    ...params,
  );
}

export function getMember(id: string) {
  return one<Member>("SELECT * FROM member WHERE id = ?", id);
}

/* ----- Ex-parlamentares (legislaturas anteriores) ----- */

export type MemberHistorico = Member & {
  votes: number;
  /** 1 = está no cargo hoje (lista oficial); 0 = ex-parlamentar, inclusive quem saiu durante a legislatura atual. */
  atual: number;
  /** Data do último voto nominal. */
  ultimo_voto: string | null;
  /** Última legislatura em que votou. */
  ultima_leg: number | null;
};

const HISTORICO_COLS = `m.id, m.chamber, m.name, m.party, m.uf, m.photo_url, m.em_exercicio AS atual, m.ultimo_voto,
  (SELECT COUNT(*) FROM member_vote_all v WHERE v.member_id = m.id) AS votes,
  (SELECT MAX(v.legislatura) FROM member_vote_all v WHERE v.member_id = m.id) AS ultima_leg`;

/** Como listMembers, mas incluindo quem só votou em legislaturas anteriores (opção "legislatura vigente" desmarcada). */
export function listMembersTodos(opts: { q?: string; party?: string; chamber?: string }): MemberHistorico[] {
  const where: string[] = [];
  const params: SQLInputValue[] = [];
  if (opts.q) {
    const fts = ftsQuery(opts.q);
    if (fts) {
      where.push("m.id IN (SELECT member_id FROM member_fts_all WHERE member_fts_all MATCH ?)");
      params.push(fts);
    } else {
      where.push("m.name LIKE ?");
      params.push(`%${opts.q}%`);
    }
  }
  if (opts.party) {
    where.push("m.party = ?");
    params.push(opts.party);
  }
  if (opts.chamber === "C" || opts.chamber === "S") {
    where.push("m.chamber = ?");
    params.push(opts.chamber);
  }
  return all<MemberHistorico>(
    `SELECT ${HISTORICO_COLS} FROM member_all m ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY m.name LIMIT 200`,
    ...params,
  );
}

/** Busca por nome incluindo ex-parlamentares. */
export function buscarParlamentaresTodos(texto: string, limit = 30): MemberHistorico[] {
  const m = ftsQuery(texto);
  if (!m) return [];
  return all<MemberHistorico>(
    `SELECT ${HISTORICO_COLS}
       FROM member_fts_all f JOIN member_all m ON m.id = f.member_id
      WHERE member_fts_all MATCH ? ORDER BY bm25(member_fts_all, 0, 5.0, 1.0, 1.0), m.name LIMIT ?`,
    m,
    limit,
  );
}

/** Parlamentar de qualquer legislatura (a página de um ex-parlamentar usa isto quando getMember não o encontra). */
export function getMemberHistorico(id: string): MemberHistorico | undefined {
  return one<MemberHistorico>(`SELECT ${HISTORICO_COLS} FROM member_all m WHERE m.id = ?`, id);
}

/** Votos nominais e partido principal do parlamentar em cada legislatura em que votou (da mais recente à mais antiga). */
export function legislaturasDoMembro(id: string) {
  return all<{ legislatura: number; votos: number; partido: string | null; primeira: string; ultima: string }>(
    `SELECT v.legislatura,
            COUNT(*) AS votos,
            (SELECT v2.party_at_time FROM member_vote_all v2 WHERE v2.member_id = v.member_id AND v2.legislatura = v.legislatura
              GROUP BY v2.party_at_time ORDER BY COUNT(*) DESC LIMIT 1) AS partido,
            MIN(s.date) AS primeira, MAX(s.date) AS ultima
       FROM member_vote_all v JOIN session_vote_all s ON s.id = v.session_vote_id
      WHERE v.member_id = ?
      GROUP BY v.legislatura ORDER BY v.legislatura DESC`,
    id,
  );
}

export function memberSummary(id: string) {
  const counts = all<{ vote: string; n: number }>(
    "SELECT vote, COUNT(*) n FROM member_vote WHERE member_id = ? GROUP BY vote",
    id,
  );
  const total = one<{ n: number }>(
    `SELECT COUNT(*) n FROM session_vote WHERE is_nominal = 1 AND chamber = (SELECT chamber FROM member WHERE id = ?)`,
    id,
  )!.n;
  const byVote = Object.fromEntries(counts.map((c) => [c.vote, c.n])) as Record<string, number>;
  const cast = counts.reduce((a, c) => a + c.n, 0);
  // Loyalty = agreement with own party's majority (leave-one-out), from member_loyalty.
  const l = one<{ shared: number; same: number }>("SELECT shared, same FROM member_loyalty WHERE member_id = ?", id);
  return { byVote, cast, total, loyalty: l && l.shared ? { same: l.same, n: l.shared } : null };
}

export type MemberVoteRow = {
  session_vote_id: string;
  vote: string;
  date: string;
  description: string | null;
  result: string | null;
  bill_label: string | null;
  bill_id: string | null;
  ementa: string | null;
  party_pos: string | null;
};

export function memberVotes(id: string, limit: number, offset: number, vote?: string) {
  const voteFilter = vote && ["SIM", "NAO", "ABS", "OBS", "OUTRO"].includes(vote) ? "AND mv.vote = ?" : "";
  const params: SQLInputValue[] = [id];
  if (voteFilter) params.push(vote!);
  params.push(limit, offset);
  return all<MemberVoteRow>(
    `SELECT mv.session_vote_id, mv.vote, sv.date, sv.description, sv.result,
            b.label AS bill_label, sv.bill_id AS bill_id, b.ementa, pp.pos AS party_pos
       FROM member_vote mv
       JOIN session_vote sv ON sv.id = mv.session_vote_id
       LEFT JOIN bill b ON b.id = sv.bill_id
       LEFT JOIN party_position pp ON pp.sv = mv.session_vote_id AND pp.party = mv.party_at_time
      WHERE mv.member_id = ? ${voteFilter}
      ORDER BY sv.date DESC, mv.session_vote_id DESC
      LIMIT ? OFFSET ?`,
    ...params,
  );
}

export function listParties() {
  return all<{ party: string; members: number; votes: number; cohesion: number | null; governo: number | null }>(
    `SELECT m.party AS party,
            COUNT(*) AS members,
            (SELECT COUNT(*) FROM member_vote v WHERE v.party_at_time = m.party) AS votes,
            (SELECT cohesion FROM party_stats s WHERE s.party = m.party) AS cohesion,
            (SELECT same * 1.0 / shared FROM party_governo g WHERE g.party = m.party) AS governo
       FROM member m
      WHERE m.party IS NOT NULL
      GROUP BY m.party
      ORDER BY members DESC`,
  );
}

export function partySummary(party: string) {
  const counts = all<{ vote: string; n: number }>(
    "SELECT vote, COUNT(*) n FROM member_vote WHERE party_at_time = ? GROUP BY vote",
    party,
  );
  const s = one<{ cohesion: number | null; positions: number }>(
    "SELECT cohesion, positions FROM party_stats WHERE party = ?",
    party,
  );
  return {
    byVote: Object.fromEntries(counts.map((c) => [c.vote, c.n])) as Record<string, number>,
    cohesion: s?.cohesion ?? null,
    positions: s?.positions ?? 0,
  };
}

export type AgreementRow = { a: string; b: string; shared: number; same: number };

export type ChamberFilter = "C" | "S" | "ALL";

/** Pairwise agreement between parties' majority positions (largest parties by distinct voters). */
export function agreementMatrix(chamber: ChamberFilter = "ALL", topN = 18): { parties: string[]; rows: AgreementRow[] } {
  const parties = all<{ party: string }>(
    `SELECT party_at_time AS party FROM member_vote
      WHERE party_at_time IS NOT NULL AND party_at_time NOT IN ('S/Partido', 'Sem Partido')
        AND vote IN ('SIM','NAO') ${chamber === "ALL" ? "" : "AND member_id LIKE ?"}
      GROUP BY party_at_time ORDER BY COUNT(DISTINCT member_id) DESC LIMIT ?`,
    ...(chamber === "ALL" ? [] : [`${chamber}:%`]),
    topN,
  ).map((r) => r.party);
  const rows = all<AgreementRow>(
    `SELECT a, b, SUM(shared) AS shared, SUM(same) AS same FROM party_agreement
      ${chamber === "ALL" ? "" : "WHERE chamber = ?"} GROUP BY a, b`,
    ...(chamber === "ALL" ? [] : [chamber]),
  );
  return { parties, rows };
}

export type PairVoteRow = {
  sv: string;
  date: string;
  description: string | null;
  bill_label: string | null;
  bill_id: string | null;
  ementa: string | null;
  pos_a: string;
  pos_b: string;
};

export function pairVotes(a: string, b: string, chamber: ChamberFilter = "ALL", limit = 60) {
  const ch = chamber === "ALL" ? "" : "AND x.sv LIKE ?";
  const chParams: SQLInputValue[] = chamber === "ALL" ? [] : [`${chamber}:%`];
  const summary = one<{ shared: number; same: number }>(
    `SELECT COUNT(*) AS shared, COALESCE(SUM(x.pos = y.pos), 0) AS same
       FROM party_position x JOIN party_position y ON x.sv = y.sv AND y.party = ?
      WHERE x.party = ? ${ch}`,
    b,
    a,
    ...chParams,
  )!;
  const votes = all<PairVoteRow>(
    `SELECT x.sv, sv.date, sv.description, bl.label AS bill_label, sv.bill_id AS bill_id, bl.ementa,
            x.pos AS pos_a, y.pos AS pos_b
       FROM party_position x JOIN party_position y ON x.sv = y.sv AND y.party = ?
       JOIN session_vote sv ON sv.id = x.sv
       LEFT JOIN bill bl ON bl.id = sv.bill_id
      WHERE x.party = ? ${ch}
      ORDER BY (x.pos = y.pos), sv.date DESC
      LIMIT ?`,
    b,
    a,
    ...chParams,
    limit,
  );
  return { summary, votes };
}

/** Bills a party most consistently backed / rejected (≥80% united), most recent first. */
export function partyTopBills(party: string, position: "SIM" | "NAO", limit = 8) {
  return all<{ label: string | null; bill_id: string | null; ementa: string | null; date: string; cohesion: number; result: string | null }>(
    `SELECT b.label, b.id AS bill_id, b.ementa, sv.date, pp.cohesion, sv.result
       FROM party_position pp
       JOIN session_vote sv ON sv.id = pp.sv
       JOIN bill b ON b.id = sv.bill_id
      WHERE pp.party = ? AND pp.pos = ? AND pp.cohesion >= 0.8
      GROUP BY b.id
      ORDER BY sv.date DESC
      LIMIT ?`,
    party,
    position,
    limit,
  );
}

/* ----- Member × party ----- */

export type MemberPartyRow = { party: string; shared: number; same: number; members: number };

/** How often the member's Yes/No matched each party's majority position. */
export function memberPartyAgreement(memberId: string) {
  return all<MemberPartyRow>(
    `SELECT a.party, a.shared, a.same,
            (SELECT COUNT(*) FROM member m WHERE m.party = a.party) AS members
       FROM member_party_agreement a
      WHERE a.member_id = ?
      ORDER BY a.same * 1.0 / a.shared DESC, a.shared DESC`,
    memberId,
  );
}

export type MemberVsPartyRow = {
  sv: string;
  date: string;
  description: string | null;
  bill_label: string | null;
  bill_id: string | null;
  ementa: string | null;
  member_vote: string;
  party_pos: string;
};

/**
 * The votes behind a member × party number, disagreements first. For the member's own party the
 * member is removed from the party count (same leave-one-out as the derived table).
 */
export function memberVsParty(memberId: string, party: string, limit = 80) {
  const rows = all<MemberVsPartyRow & { y: number; n: number }>(
    `SELECT pp.sv, sv.date, sv.description, bl.label AS bill_label, sv.bill_id AS bill_id, bl.ementa,
            mv.vote AS member_vote,
            CASE WHEN mv.party_at_time = pp.party THEN pp.yes - (mv.vote = 'SIM') ELSE pp.yes END AS y,
            CASE WHEN mv.party_at_time = pp.party THEN pp.no  - (mv.vote = 'NAO') ELSE pp.no  END AS n
       FROM member_vote mv
       JOIN party_position pp ON pp.sv = mv.session_vote_id AND pp.party = ?
       JOIN session_vote sv ON sv.id = mv.session_vote_id
       LEFT JOIN bill bl ON bl.id = sv.bill_id
      WHERE mv.member_id = ? AND mv.vote IN ('SIM','NAO')`,
    party,
    memberId,
  );
  const valid = rows
    .filter((r) => r.y !== r.n && r.y + r.n >= 2)
    .map((r) => ({ ...r, party_pos: r.y > r.n ? "SIM" : "NAO" }));
  const same = valid.filter((r) => r.member_vote === r.party_pos).length;
  valid.sort((p, q) => {
    const dp = Number(p.member_vote === p.party_pos);
    const dq = Number(q.member_vote === q.party_pos);
    return dp - dq || q.date.localeCompare(p.date);
  });
  return { shared: valid.length, same, votes: valid.slice(0, limit) as MemberVsPartyRow[] };
}

export function listPartyAcronyms() {
  return all<{ party: string }>("SELECT party FROM party_stats ORDER BY party").map((r) => r.party);
}

/* ----- IV bars, evidence and topic summaries ----- */

export type IvScores = {
  left: number | null;
  right: number | null;
  privilege: number | null;
  nEconomic: number;
  nPrivilege: number;
  /** Votos substantivos (sem os procedimentais) e quantos têm direção marcada: a cobertura do perfil. */
  nSubst: number;
  nDirecao: number;
  /** Mesmas notas usando só marcações de confiança ≥ 50%. */
  leftRobust: number | null;
  rightRobust: number | null;
  privilegeRobust: number | null;
};

type IvRow = {
  left_pct: number | null;
  right_pct: number | null;
  privilege_pct: number | null;
  n_economic: number;
  n_privilege: number;
  n_subst: number;
  n_dir: number;
  left_pct_robust: number | null;
  right_pct_robust: number | null;
  privilege_pct_robust: number | null;
};
const IV_COLS =
  "left_pct, right_pct, privilege_pct, n_economic, n_privilege, n_subst, n_dir, left_pct_robust, right_pct_robust, privilege_pct_robust";
const toIv = (r: IvRow | undefined): IvScores | null =>
  r
    ? {
        left: r.left_pct,
        right: r.right_pct,
        privilege: r.privilege_pct,
        nEconomic: r.n_economic,
        nPrivilege: r.n_privilege,
        nSubst: r.n_subst,
        nDirecao: r.n_dir,
        leftRobust: r.left_pct_robust,
        rightRobust: r.right_pct_robust,
        privilegeRobust: r.privilege_pct_robust,
      }
    : null;

export function memberIv(id: string) {
  return toIv(one<IvRow>(`SELECT ${IV_COLS} FROM member_iv WHERE member_id = ?`, id));
}
export function partyIv(party: string) {
  return toIv(one<IvRow>(`SELECT ${IV_COLS} FROM party_iv WHERE party = ?`, party));
}

export type IvAxis = "left" | "right" | "privilege";

export type EvidenceRow = {
  sv: string;
  date: string;
  vote: string;
  value: number;
  confidence: number;
  rationale: string | null;
  source: string;
  push: number; // +1 pushed toward right / more privilege, -1 toward left / less privilege
  bill_label: string | null;
  bill_id: string | null;
  summary: string | null;
  description: string | null;
};

/** The tagged votes behind a member's bar (economic for left/right, privilege for privilege). */
export function ivEvidence(memberId: string, axis: IvAxis, limit = 300) {
  const col = axis === "privilege" ? "t.privilege" : "t.economic";
  const min = axis === "privilege" ? 0.3 : 0.2;
  return all<EvidenceRow>(
    `SELECT mv.session_vote_id AS sv, sv.date, mv.vote, ${col} AS value, t.confidence, t.rationale, t.source,
            CASE mv.vote WHEN 'SIM' THEN 1 ELSE -1 END * (CASE WHEN ${col} > 0 THEN 1 ELSE -1 END) AS push,
            b.label AS bill_label, sv.bill_id AS bill_id, bi.summary, sv.description
       FROM member_vote mv
       JOIN vote_tag_eff t ON t.sv = mv.session_vote_id
       JOIN session_vote sv ON sv.id = mv.session_vote_id
       LEFT JOIN bill b ON b.id = sv.bill_id
       LEFT JOIN bill_info_eff bi ON bi.bill_id = sv.bill_id
      WHERE mv.member_id = ? AND mv.vote IN ('SIM','NAO') AND t.procedural = 0 AND ABS(${col}) >= ${min}
      ORDER BY ABS(${col}) * t.confidence DESC, sv.date DESC
      LIMIT ?`,
    memberId,
    limit,
  );
}

export type TopicRow = { topic: string; yes: number; no: number };

/** What a member backed (Yes) and opposed (No), by bill topic. Procedural votes are excluded. */
export function memberTopics(memberId: string) {
  return all<TopicRow>(
    `SELECT bi.topic, SUM(mv.vote = 'SIM') AS yes, SUM(mv.vote = 'NAO') AS no
       FROM member_vote mv
       JOIN session_vote sv ON sv.id = mv.session_vote_id
       JOIN bill_info_eff bi ON bi.bill_id = sv.bill_id
       LEFT JOIN vote_tag_eff t ON t.sv = mv.session_vote_id
      WHERE mv.member_id = ? AND mv.vote IN ('SIM','NAO') AND COALESCE(t.procedural, 0) = 0
      GROUP BY bi.topic ORDER BY yes + no DESC`,
    memberId,
  );
}

/** Same for a party, using the party's majority position in each votação. */
export function partyTopics(party: string) {
  return all<TopicRow>(
    `SELECT bi.topic, SUM(pp.pos = 'SIM') AS yes, SUM(pp.pos = 'NAO') AS no
       FROM party_position pp
       JOIN session_vote sv ON sv.id = pp.sv
       JOIN bill_info_eff bi ON bi.bill_id = sv.bill_id
       LEFT JOIN vote_tag_eff t ON t.sv = pp.sv
      WHERE pp.party = ? AND COALESCE(t.procedural, 0) = 0
      GROUP BY bi.topic ORDER BY yes + no DESC`,
    party,
  );
}

export type NotableRow = { sv: string; date: string; vote: string | null; bill_label: string | null; bill_id: string | null; summary: string | null; economic: number; privilege: number };

/** Most recent votes with a strong, clearly tagged direction (|economic| ≥ 0.5 or |privilege| ≥ 0.5). */
function notableVotesRaw(opts: { memberId?: string; party?: string }, limit: number) {
  if (opts.memberId) {
    return all<NotableRow>(
      `SELECT mv.session_vote_id AS sv, sv.date, mv.vote, b.label AS bill_label, sv.bill_id AS bill_id, bi.summary, t.economic, t.privilege
         FROM member_vote mv
         JOIN vote_tag_eff t ON t.sv = mv.session_vote_id
         JOIN session_vote sv ON sv.id = mv.session_vote_id
         LEFT JOIN bill b ON b.id = sv.bill_id
         LEFT JOIN bill_info_eff bi ON bi.bill_id = sv.bill_id
        WHERE mv.member_id = ? AND t.procedural = 0 AND t.confidence >= 0.5 AND (ABS(t.economic) >= 0.5 OR ABS(t.privilege) >= 0.5)
        ORDER BY sv.date DESC, mv.session_vote_id DESC LIMIT ?`,
      opts.memberId,
      limit,
    );
  }
  return all<NotableRow>(
    `SELECT pp.sv, sv.date, pp.pos AS vote, b.label AS bill_label, sv.bill_id AS bill_id, bi.summary, t.economic, t.privilege
       FROM party_position pp
       JOIN vote_tag_eff t ON t.sv = pp.sv
       JOIN session_vote sv ON sv.id = pp.sv
       LEFT JOIN bill b ON b.id = sv.bill_id
       LEFT JOIN bill_info_eff bi ON bi.bill_id = sv.bill_id
      WHERE pp.party = ? AND t.procedural = 0 AND t.confidence >= 0.5 AND (ABS(t.economic) >= 0.5 OR ABS(t.privilege) >= 0.5)
      ORDER BY sv.date DESC, pp.sv DESC LIMIT ?`,
    opts.party ?? "",
    limit,
  );
}

/* ----- Review (admin) ----- */

export type ReviewRow = {
  sv: string; date: string; bill_label: string | null; bill_id: string | null; summary: string | null; description: string | null;
  economic: number; privilege: number; procedural: number; confidence: number; rationale: string | null; source: string;
};

/** Tagged votes worth a second look: low confidence, or a strong claim. Neutral defaults are skipped. */
export function reviewQueue(kind: "uncertain" | "strong", limit: number, offset: number) {
  const cond =
    kind === "uncertain"
      ? "t.procedural = 0 AND t.confidence < 0.5 AND (ABS(t.economic) >= 0.2 OR ABS(t.privilege) >= 0.3)"
      : "t.procedural = 0 AND t.confidence >= 0.5 AND (ABS(t.economic) >= 0.5 OR ABS(t.privilege) >= 0.5)";
  return all<ReviewRow>(
    `SELECT t.sv, sv.date, b.label AS bill_label, sv.bill_id AS bill_id, bi.summary, sv.description,
            t.economic, t.privilege, t.procedural, t.confidence, t.rationale, t.source
       FROM vote_tag_eff t
       JOIN session_vote sv ON sv.id = t.sv
       LEFT JOIN bill b ON b.id = sv.bill_id
       LEFT JOIN bill_info_eff bi ON bi.bill_id = sv.bill_id
      WHERE ${cond}
      ORDER BY (SELECT COUNT(*) FROM member_vote mv WHERE mv.session_vote_id = t.sv) DESC, sv.date DESC
      LIMIT ? OFFSET ?`,
    limit,
    offset,
  );
}

/** One entry per bill (the most recent vote on it), newest first. */
export function notableVotes(opts: { memberId?: string; party?: string }, limit = 6): NotableRow[] {
  const seen = new Set<string>();
  const out: NotableRow[] = [];
  for (const r of notableVotesRaw(opts, limit * 8)) {
    const key = r.bill_label ?? r.sv;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length === limit) break;
  }
  return out;
}

/* ----- Rankings ----- */

export type RankMemberRow = {
  rk: number;
  id: string;
  name: string;
  party: string | null;
  uf: string | null;
  chamber: "C" | "S";
  photo_url: string | null;
  score: number;
  n: number;
};

const NO_PARTY = ["S/Partido", "Sem Partido"];

/** Parlamentares com nota no eixo, ordenados do maior para o menor. Empates recebem a mesma posição. */
export function rankMembers(
  eixo: Eixo,
  f: { chamber?: string; party?: string; uf?: string; limit: number; offset: number },
) {
  const col = colunaDoEixo(eixo); // vem de uma lista fixa, nunca de entrada do usuário
  const n = eixo.contagem === "privilegio" ? "i.n_privilege" : "i.n_economic";
  const where = [`i.${col} IS NOT NULL`, `${n} >= ${eixo.minimoRanking}`];
  const params: SQLInputValue[] = [];
  if (f.chamber === "C" || f.chamber === "S") {
    where.push("m.chamber = ?");
    params.push(f.chamber);
  }
  if (f.party) {
    where.push("m.party = ?");
    params.push(f.party);
  }
  if (f.uf) {
    where.push("m.uf = ?");
    params.push(f.uf);
  }
  const base = `
    SELECT m.id, m.name, m.party, m.uf, m.chamber, m.photo_url, i.${col} AS score, ${n} AS n
      FROM member_iv i JOIN member m ON m.id = i.member_id
     WHERE ${where.join(" AND ")}`;
  const rows = all<RankMemberRow>(
    `WITH base AS (${base}), ranked AS (SELECT *, RANK() OVER (ORDER BY ROUND(score, 4) DESC) AS rk FROM base)
     SELECT * FROM ranked ORDER BY rk, n DESC, name LIMIT ? OFFSET ?`,
    ...params,
    f.limit,
    f.offset,
  );
  const total = one<{ c: number }>(`SELECT COUNT(*) AS c FROM (${base})`, ...params)!.c;
  return { rows, total };
}

export type RankPartyRow = { rk: number; party: string; score: number; n: number; members: number };

/** Partidos com nota no eixo (exclui "sem partido"). */
export function rankParties(eixo: Eixo) {
  const col = colunaDoEixo(eixo);
  const n = eixo.contagem === "privilegio" ? "n_privilege" : "n_economic";
  return all<RankPartyRow>(
    `WITH base AS (
       SELECT p.party, p.${col} AS score, p.${n} AS n,
              (SELECT COUNT(DISTINCT v.member_id) FROM member_vote v WHERE v.party_at_time = p.party) AS members
         FROM party_iv p
        WHERE p.${col} IS NOT NULL AND p.party IS NOT NULL AND p.party NOT IN (${NO_PARTY.map(() => "?").join(",")})
     )
     SELECT *, RANK() OVER (ORDER BY ROUND(score, 4) DESC) AS rk FROM base ORDER BY rk, n DESC, party`,
    ...NO_PARTY,
  );
}

export type Posicao = { rank: number; total: number };

/** Posição de um parlamentar no eixo, na lista geral e dentro da própria casa. */
export function posicaoMembro(memberId: string, eixo: Eixo): { geral: Posicao; casa: Posicao } | null {
  const col = colunaDoEixo(eixo);
  const n = eixo.contagem === "privilegio" ? "i.n_privilege" : "i.n_economic";
  const me = one<{ score: number | null; chamber: string; n: number }>(
    `SELECT i.${col} AS score, m.chamber, ${n} AS n FROM member_iv i JOIN member m ON m.id = i.member_id WHERE i.member_id = ?`,
    memberId,
  );
  // Sem nota, ou com poucos votos para entrar no ranking: sem posição.
  if (!me || me.score === null || me.n < eixo.minimoRanking) return null;
  const pos = (chamber?: string): Posicao => {
    const w = chamber ? "AND m.chamber = ?" : "";
    const p: SQLInputValue[] = chamber ? [chamber] : [];
    const r = one<{ total: number; higher: number }>(
      `SELECT COUNT(*) AS total, SUM(ROUND(i.${col}, 4) > ROUND(?, 4)) AS higher
         FROM member_iv i JOIN member m ON m.id = i.member_id WHERE i.${col} IS NOT NULL AND ${n} >= ${eixo.minimoRanking} ${w}`,
      me.score,
      ...p,
    )!;
    return { rank: (r.higher ?? 0) + 1, total: r.total };
  };
  return { geral: pos(), casa: pos(me.chamber) };
}

export function posicaoPartido(party: string, eixo: Eixo): Posicao | null {
  const lista = rankParties(eixo);
  const r = lista.find((x) => x.party === party);
  return r ? { rank: r.rk, total: lista.length } : null;
}

export function listUfs() {
  return all<{ uf: string }>("SELECT DISTINCT uf FROM member WHERE uf IS NOT NULL ORDER BY uf").map((r) => r.uf);
}

/* ----- Status dos dados ----- */

export type DataStatus = { atualizadoEm: string | null; ultimaVotacao: string | null; pendentes: number };

/** Data da última atualização, última votação importada e quantas votações nominais ainda esperam marcação. */
export function getStatus(): DataStatus {
  const meta = new Map(
    all<{ key: string; value: string }>("SELECT key, value FROM meta").map((r) => [r.key, r.value] as const),
  );
  const pend = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM session_vote WHERE is_nominal = 1 AND id NOT IN (SELECT sv FROM vote_tag)",
  )!.n;
  return {
    atualizadoEm: meta.get("ultima_atualizacao") ?? null,
    ultimaVotacao: meta.get("ultima_votacao") ?? one<{ d: string | null }>("SELECT MAX(date) AS d FROM session_vote WHERE is_nominal = 1")?.d ?? null,
    pendentes: pend,
  };
}

/* ----- Alinhamento com orientações (Câmara) ----- */

export type Alinhamento = { shared: number; same: number };

/** Quanto o parlamentar votou como o Governo orientou (só Câmara). */
export function memberAlinhamento(memberId: string): { governo: Alinhamento | null } {
  return { governo: one<Alinhamento>("SELECT shared, same FROM member_governo WHERE member_id = ?", memberId) ?? null };
}

/** Parcela dos votos dos parlamentares do partido que acompanharam a orientação do Governo. */
export function partyGoverno(party: string): Alinhamento | null {
  return one<Alinhamento>("SELECT shared, same FROM party_governo WHERE party = ?", party) ?? null;
}

/* ----- Página de votação e de projeto ----- */

export type Votacao = {
  id: string;
  chamber: "C" | "S";
  date: string;
  description: string | null;
  result: string | null;
  bill_id: string | null;
  bill_label: string | null;
  ementa: string | null;
  keywords: string | null;
  summary: string | null;
  topic: string | null;
  economic: number | null;
  privilege: number | null;
  procedural: number | null;
  confidence: number | null;
  rationale: string | null;
  tag_source: string | null;
};

export function getVotacao(id: string) {
  return one<Votacao>(
    `SELECT sv.id, sv.chamber, sv.date, sv.description, sv.result, sv.bill_id, b.label AS bill_label, b.ementa, b.keywords,
            bi.summary, bi.topic, t.economic, t.privilege, t.procedural, t.confidence, t.rationale, t.source AS tag_source
       FROM session_vote sv
       LEFT JOIN bill b ON b.id = sv.bill_id
       LEFT JOIN bill_info_eff bi ON bi.bill_id = sv.bill_id
       LEFT JOIN vote_tag_eff t ON t.sv = sv.id
      WHERE sv.id = ?`,
    id,
  );
}

export type VotacaoPartido = {
  party: string;
  sim: number;
  nao: number;
  abs: number;
  obs: number;
  total: number;
  pos: string | null;
  orientacao: string | null;
};

/** Como cada partido votou numa votação, com a posição (maioria) e a orientação do próprio partido, se houver. */
export function votacaoPorPartido(sv: string) {
  return all<VotacaoPartido>(
    `SELECT COALESCE(mv.party_at_time, 'Sem partido') AS party,
            SUM(mv.vote = 'SIM') AS sim, SUM(mv.vote = 'NAO') AS nao, SUM(mv.vote = 'ABS') AS abs, SUM(mv.vote = 'OBS') AS obs,
            COUNT(*) AS total, pp.pos AS pos,
            (SELECT o.orientation FROM orientation o WHERE o.session_vote_id = ? AND o.kind = 'party' AND o.key = mv.party_at_time) AS orientacao
       FROM member_vote mv
       LEFT JOIN party_position pp ON pp.sv = mv.session_vote_id AND pp.party = mv.party_at_time
      WHERE mv.session_vote_id = ?
      GROUP BY mv.party_at_time
      ORDER BY total DESC, party`,
    sv,
    sv,
  );
}

const ORIENT_ORDER = ["Governo", "Maioria", "Minoria", "Oposição"];

/** Orientações de Governo, Maioria, Minoria, Oposição e blocos (Câmara). Partidos vêm na tabela por partido. */
export function votacaoOrientacoes(sv: string) {
  const rows = all<{ key: string; orientation: string }>(
    "SELECT key, orientation FROM orientation WHERE session_vote_id = ? AND kind = 'bloc'",
    sv,
  );
  const rank = (k: string) => (ORIENT_ORDER.includes(k) ? ORIENT_ORDER.indexOf(k) : 99);
  return rows.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

export type VotoRow = { id: string; name: string; party: string | null; uf: string | null; vote: string; photo_url: string | null };

export function votacaoVotos(sv: string, f: { vote?: string; party?: string; limit: number; offset: number }) {
  const where = ["mv.session_vote_id = ?"];
  const params: SQLInputValue[] = [sv];
  if (f.vote && ["SIM", "NAO", "ABS", "OBS", "OUTRO"].includes(f.vote)) {
    where.push("mv.vote = ?");
    params.push(f.vote);
  }
  if (f.party) {
    where.push("mv.party_at_time = ?");
    params.push(f.party);
  }
  const base = `FROM member_vote mv JOIN member m ON m.id = mv.member_id WHERE ${where.join(" AND ")}`;
  const rows = all<VotoRow>(
    `SELECT m.id, m.name, mv.party_at_time AS party, m.uf, mv.vote, m.photo_url ${base} ORDER BY m.name LIMIT ? OFFSET ?`,
    ...params,
    f.limit,
    f.offset,
  );
  const total = one<{ c: number }>(`SELECT COUNT(*) AS c ${base}`, ...params)!.c;
  return { rows, total };
}

export type Projeto = {
  id: string;
  chamber: "C" | "S";
  label: string;
  ementa: string | null;
  keywords: string | null;
  summary: string | null;
  topic: string | null;
};

export function getProjeto(id: string) {
  return one<Projeto>(
    `SELECT b.id, b.chamber, b.label, b.ementa, b.keywords, bi.summary, bi.topic
       FROM bill b LEFT JOIN bill_info_eff bi ON bi.bill_id = b.id WHERE b.id = ?`,
    id,
  );
}

export type VotacaoDoProjeto = {
  id: string;
  date: string;
  description: string | null;
  result: string | null;
  sim: number;
  nao: number;
  procedural: number | null;
};

export function votacoesDoProjeto(billId: string) {
  return all<VotacaoDoProjeto>(
    `SELECT sv.id, sv.date, sv.description, sv.result,
            (SELECT COUNT(*) FROM member_vote v WHERE v.session_vote_id = sv.id AND v.vote = 'SIM') AS sim,
            (SELECT COUNT(*) FROM member_vote v WHERE v.session_vote_id = sv.id AND v.vote = 'NAO') AS nao,
            t.procedural
       FROM session_vote sv LEFT JOIN vote_tag_eff t ON t.sv = sv.id
      WHERE sv.bill_id = ? AND sv.is_nominal = 1
      ORDER BY sv.date, sv.id`,
    billId,
  );
}

/* ----- Busca ----- */

/**
 * Transforma o texto digitado numa consulta FTS5 segura: cada palavra vira um prefixo entre aspas, então
 * "reforma tribut" encontra "reforma tributária". Devolve null se não sobrar nenhuma palavra.
 */
export function ftsQuery(texto: string): string | null {
  const tokens = texto.split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 8);
  return tokens.length ? tokens.map((t) => `"${t}"*`).join(" ") : null;
}

export type ProjetoBusca = {
  bill_id: string;
  label: string;
  ementa: string | null;
  summary: string | null;
  topic: string | null;
  votacoes: number;
  ultima: string | null;
};

export function buscarProjetos(texto: string, f: { topic?: string; casa?: "C" | "S"; ano?: string; limit: number }) {
  const m = ftsQuery(texto);
  if (!m) return [];
  const where = ["bill_fts MATCH ?"];
  const params: SQLInputValue[] = [m];
  if (f.casa) {
    where.push("f.bill_id LIKE ?");
    params.push(`${f.casa}:%`);
  }
  if (f.topic) {
    where.push("bi.topic = ?");
    params.push(f.topic);
  }
  if (f.ano && /^\d{4}$/.test(f.ano)) {
    where.push("b.label LIKE ?");
    params.push(`%/${f.ano}%`);
  }
  return all<ProjetoBusca>(
    `SELECT f.bill_id, b.label, b.ementa, bi.summary, bi.topic,
            (SELECT COUNT(*) FROM session_vote sv WHERE sv.bill_id = f.bill_id AND sv.is_nominal = 1) AS votacoes,
            (SELECT MAX(sv.date) FROM session_vote sv WHERE sv.bill_id = f.bill_id AND sv.is_nominal = 1) AS ultima
       FROM bill_fts f
       JOIN bill b ON b.id = f.bill_id
       LEFT JOIN bill_info_eff bi ON bi.bill_id = f.bill_id
      WHERE ${where.join(" AND ")}
      ORDER BY bm25(bill_fts, 0, 8.0, 1.0, 3.0, 2.0), b.label
      LIMIT ?`,
    ...params,
    f.limit,
  );
}

export function buscarParlamentares(texto: string, limit = 30) {
  const m = ftsQuery(texto);
  if (!m) return [];
  return all<Member & { votes: number }>(
    `SELECT m.*, (SELECT COUNT(*) FROM member_vote v WHERE v.member_id = m.id) AS votes
       FROM member_fts f JOIN member m ON m.id = f.member_id
      WHERE member_fts MATCH ? ORDER BY bm25(member_fts, 0, 5.0, 1.0, 1.0), m.name LIMIT ?`,
    m,
    limit,
  );
}

/* ----- Parlamentar × parlamentar ----- */

export type MemberVsMemberRow = {
  sv: string;
  date: string;
  description: string | null;
  bill_label: string | null;
  bill_id: string | null;
  ementa: string | null;
  vote_a: string;
  vote_b: string;
};

/** Votações em que os dois votaram Sim ou Não: quantas vezes votaram igual e a lista (divergências primeiro). */
export function memberVsMember(a: string, b: string, limit = 80) {
  const rows = all<MemberVsMemberRow>(
    `SELECT v1.session_vote_id AS sv, sv.date, sv.description, bl.label AS bill_label, sv.bill_id AS bill_id, bl.ementa,
            v1.vote AS vote_a, v2.vote AS vote_b
       FROM member_vote v1
       JOIN member_vote v2 ON v2.session_vote_id = v1.session_vote_id AND v2.member_id = ?
       JOIN session_vote sv ON sv.id = v1.session_vote_id
       LEFT JOIN bill bl ON bl.id = sv.bill_id
      WHERE v1.member_id = ? AND v1.vote IN ('SIM','NAO') AND v2.vote IN ('SIM','NAO')`,
    b,
    a,
  );
  const same = rows.filter((r) => r.vote_a === r.vote_b).length;
  rows.sort((p, q) => Number(p.vote_a === p.vote_b) - Number(q.vote_a === q.vote_b) || q.date.localeCompare(p.date));
  return { shared: rows.length, same, votes: rows.slice(0, limit) };
}

/* ----- Mapa de votos e validação ----- */

export type PontoMapaRow = { id: string; name: string; party: string | null; uf: string | null; d1: number; d2: number; n: number };

export function mapaPontos(chamber: "C" | "S") {
  return all<PontoMapaRow>(
    `SELECT m.id, m.name, m.party, m.uf, mm.d1, mm.d2, mm.n_votes AS n
       FROM member_mapa mm JOIN member m ON m.id = mm.member_id
      WHERE mm.chamber = ? ORDER BY m.name`,
    chamber,
  );
}

export function mapaMeta(chamber: "C" | "S") {
  return one<{ var1: number; var2: number; votacoes: number; membros: number }>(
    "SELECT var1, var2, votacoes, membros FROM mapa_meta WHERE chamber = ?",
    chamber,
  );
}

/** Correlações de Spearman guardadas no derive: nome → { valor, n }. */
export function validacao(): Record<string, { valor: number | null; n: number }> {
  return Object.fromEntries(
    all<{ nome: string; valor: number | null; n: number }>("SELECT nome, valor, n FROM validacao").map((r) => [r.nome, { valor: r.valor, n: r.n }]),
  );
}

/** O parlamentar está no mapa? (tem votos suficientes) */
export function estaNoMapa(memberId: string): boolean {
  return !!one("SELECT 1 FROM member_mapa WHERE member_id = ?", memberId);
}

export type DivergenciaRow = ReviewRow & {
  kind: string;
  e_b: number;
  p_b: number;
  c_b: number;
  why_b: string | null;
  impacto: number;
};

/** Votos em que a marcação atual e a segunda (às cegas) discordam e ainda não receberam revisão humana. */
export function reviewDivergencias(limit: number, offset: number) {
  return all<DivergenciaRow>(
    `SELECT t.sv, sv.date, b.label AS bill_label, sv.bill_id AS bill_id, bi.summary, sv.description,
            t.economic, t.privilege, t.procedural, t.confidence, t.rationale, t.source,
            d.kind, d.e_b, d.p_b, d.c_b, d.why_b, d.impacto
       FROM tag_divergence d
       JOIN vote_tag_eff t ON t.sv = d.sv
       JOIN session_vote sv ON sv.id = d.sv
       LEFT JOIN bill b ON b.id = sv.bill_id
       LEFT JOIN bill_info_eff bi ON bi.bill_id = sv.bill_id
      WHERE t.source <> 'human'
      ORDER BY d.impacto DESC, (SELECT COUNT(*) FROM member_vote mv WHERE mv.session_vote_id = d.sv) DESC
      LIMIT ? OFFSET ?`,
    limit,
    offset,
  );
}

export function contarDivergencias() {
  return one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tag_divergence d JOIN vote_tag_eff t ON t.sv = d.sv WHERE t.source <> 'human'`,
  )!.n;
}

/** Resultados da comparação entre a marcação atual e a segunda marcação às cegas (vazio se ainda não houve). */
export function getConsistencia(): Record<string, { valor: number | null; n: number }> {
  try {
    return Object.fromEntries(
      all<{ nome: string; valor: number | null; n: number }>("SELECT nome, valor, n FROM consistencia").map((r) => [r.nome, { valor: r.valor, n: r.n }]),
    );
  } catch {
    return {};
  }
}

/* ----- Mandatos (pessoa × legislatura) ----- */

export type MandatoRow = {
  member_id: string;
  legislatura: number;
  condicao: "Titular" | "Suplente" | null;
  natureza: Natureza;
  motivo: string | null;
  inicio: string | null;
  fim: string | null;
  licencas: { data: string | null; motivo: string }[];
  partido: string | null;
  partido_sigla: string | null;
  votos: number;
  primeira: string | null;
  ultima: string | null;
  total_votacoes: number | null;
};

type MandatoDb = Omit<MandatoRow, "licencas" | "natureza"> & { licencas: string | null; natureza: string };
const toMandato = (r: MandatoDb): MandatoRow => ({
  ...r,
  natureza: (r.natureza in NATUREZA_INFO ? r.natureza : "indefinido") as Natureza,
  licencas: r.licencas ? (JSON.parse(r.licencas) as MandatoRow["licencas"]) : [],
});

/** Mandatos de uma pessoa, do mais recente para o mais antigo (só as legislaturas em que votou). */
export function mandatosDoMembro(id: string): MandatoRow[] {
  return all<MandatoDb>("SELECT * FROM mandato WHERE member_id = ? ORDER BY legislatura DESC", id).map(toMandato);
}

export function getMandato(id: string, legislatura: number): MandatoRow | undefined {
  const r = one<MandatoDb>("SELECT * FROM mandato WHERE member_id = ? AND legislatura = ?", id, legislatura);
  return r ? toMandato(r) : undefined;
}

/** Perfil de votação só com os votos daquela legislatura. */
export function mandatoIv(id: string, legislatura: number) {
  return toIv(one<IvRow>(`SELECT ${IV_COLS} FROM member_iv_leg WHERE member_id = ? AND legislatura = ?`, id, legislatura));
}

/** Contagem de votos por tipo naquela legislatura. */
export function mandatoVotosPorTipo(id: string, legislatura: number) {
  const c = all<{ vote: string; n: number }>(
    "SELECT vote, COUNT(*) n FROM member_vote_all WHERE member_id = ? AND legislatura = ? GROUP BY vote",
    id,
    legislatura,
  );
  return Object.fromEntries(c.map((x) => [x.vote, x.n])) as Record<string, number>;
}

/** Alinhamento com a orientação do Governo naquela legislatura (só Câmara; null se não houve orientação clara). */
export function mandatoGoverno(id: string, legislatura: number): Alinhamento | null {
  return one<Alinhamento>("SELECT shared, same FROM member_governo_leg WHERE member_id = ? AND legislatura = ?", id, legislatura) ?? null;
}

/** Alinhamento com cada partido (linhagem) e fidelidade ao próprio partido, só com os votos daquela legislatura. */
export function mandatoAlinhamento(id: string, legislatura: number) {
  const partidos = all<{ party: string; shared: number; same: number }>(
    `SELECT party, shared, same FROM member_party_agreement_leg WHERE member_id = ? AND legislatura = ?
      ORDER BY same * 1.0 / shared DESC, shared DESC`,
    id,
    legislatura,
  );
  const l = one<{ shared: number; same: number }>("SELECT shared, same FROM member_loyalty_leg WHERE member_id = ? AND legislatura = ?", id, legislatura);
  return { partidos, fidelidade: l && l.shared ? { same: l.same, n: l.shared } : null };
}

/** Votos de uma legislatura, do mais recente ao mais antigo (mesmas colunas de memberVotes). */
export function votosDoMandato(id: string, legislatura: number, limit: number, offset: number, vote?: string): MemberVoteRow[] {
  const filtro = vote && ["SIM", "NAO", "ABS", "OBS", "OUTRO"].includes(vote) ? "AND mv.vote = ?" : "";
  const params: SQLInputValue[] = [id, legislatura];
  if (filtro) params.push(vote!);
  params.push(limit, offset);
  return all<MemberVoteRow>(
    `SELECT mv.session_vote_id, mv.vote, sv.date, sv.description, sv.result,
            b.label AS bill_label, sv.bill_id AS bill_id, b.ementa, pp.pos AS party_pos
       FROM member_vote_all mv
       JOIN session_vote_all sv ON sv.id = mv.session_vote_id
       LEFT JOIN bill b ON b.id = sv.bill_id
       LEFT JOIN party_alias pa ON pa.sigla = mv.party_at_time
       LEFT JOIN party_position_all pp ON pp.sv = mv.session_vote_id AND pp.party = COALESCE(pa.canonica, mv.party_at_time)
      WHERE mv.member_id = ? AND mv.legislatura = ? ${filtro}
      ORDER BY sv.date DESC, mv.session_vote_id DESC LIMIT ? OFFSET ?`,
    ...params,
  );
}

export type MandatoLista = MandatoRow & { name: string; chamber: string; uf: string | null; photo_url: string | null; em_exercicio: number };

/** Consulta de mandatos (pessoa × legislatura) com filtros. */
export function listarMandatos(f: { legislatura?: number; chamber?: string; partido?: string; natureza?: string; condicao?: string; q?: string; limit: number; offset: number }) {
  const where: string[] = [];
  const params: SQLInputValue[] = [];
  if (f.legislatura) { where.push("m.legislatura = ?"); params.push(f.legislatura); }
  if (f.chamber === "C" || f.chamber === "S") { where.push("a.chamber = ?"); params.push(f.chamber); }
  if (f.partido) { where.push("m.partido = ?"); params.push(f.partido); }
  if (f.natureza && f.natureza in NATUREZA_INFO) { where.push("m.natureza = ?"); params.push(f.natureza); }
  if (f.condicao === "Titular" || f.condicao === "Suplente") { where.push("m.condicao = ?"); params.push(f.condicao); }
  if (f.q) {
    const fts = ftsQuery(f.q);
    if (fts) { where.push("m.member_id IN (SELECT member_id FROM member_fts_all WHERE member_fts_all MATCH ?)"); params.push(fts); }
    else { where.push("a.name LIKE ?"); params.push(`%${f.q}%`); }
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = one<{ n: number }>(`SELECT COUNT(*) n FROM mandato m JOIN member_all a ON a.id = m.member_id ${w}`, ...params)!.n;
  const rows = all<MandatoDb & { name: string; chamber: string; uf: string | null; photo_url: string | null; em_exercicio: number }>(
    `SELECT m.*, a.name, a.chamber, a.uf, a.photo_url, a.em_exercicio
       FROM mandato m JOIN member_all a ON a.id = m.member_id ${w}
      ORDER BY m.legislatura DESC, a.name LIMIT ? OFFSET ?`,
    ...params,
    f.limit,
    f.offset,
  ).map((r) => ({ ...toMandato(r), name: r.name, chamber: r.chamber, uf: r.uf, photo_url: r.photo_url, em_exercicio: r.em_exercicio }));
  return { total, rows };
}

/** Contagem de mandatos por natureza (para o filtro e para a página de metodologia). */
export function mandatosPorNatureza(): { natureza: Natureza; n: number }[] {
  return all<{ natureza: Natureza; n: number }>("SELECT natureza, COUNT(*) n FROM mandato GROUP BY natureza ORDER BY n DESC");
}

/** Partidos (linhagens) que aparecem em algum mandato, para o filtro. */
export function partidosDosMandatos(): string[] {
  return all<{ partido: string }>("SELECT DISTINCT partido FROM mandato WHERE partido IS NOT NULL ORDER BY partido").map((r) => r.partido);
}

/** Quantas votações nominais da legislatura já foram classificadas (as procedimentais automáticas não contam). */
export function coberturaLegislatura(legislatura: number): { total: number; classificadas: number } {
  return one<{ total: number; classificadas: number }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(EXISTS (SELECT 1 FROM vote_tag t WHERE t.sv = s.id AND COALESCE(t.rubric_ver, '') <> 'auto')), 0) AS classificadas
       FROM session_vote_all s WHERE s.is_nominal = 1 AND s.legislatura = ?`,
    legislatura,
  )!;
}

/* ----- História: partidos ao longo das legislaturas ----- */

/** Mínimos de votações (não de votos) para mostrar um ponto na linha do tempo: abaixo disso é lacuna, não zero. */
export const HISTORIA_MIN_ECONOMICAS = 10;
export const HISTORIA_MIN_PRIVILEGIOS = 5;

export type HistoriaCelula = {
  legislatura: number;
  party: string;
  /** Votações em que o partido teve posição (maioria de Sim/Não). */
  n_votacoes: number;
  /** Votações classificadas em que a posição do partido empurrou para cada lado. */
  n_estado: number;
  n_mercado: number;
  n_priv_mais: number;
  n_priv_menos: number;
  /** Percentuais ponderados pelos votos dos parlamentares (mesma conta das barras), ou null sem base. */
  left_pct: number | null;
  right_pct: number | null;
  privilege_pct: number | null;
};

/** Uma linha por partido (linhagem) e legislatura, de uma casa. */
export function historiaPartidos(chamber: "C" | "S"): HistoriaCelula[] {
  return all<HistoriaCelula>(
    `SELECT l.legislatura, l.party, l.n_votacoes, l.n_estado, l.n_mercado, l.n_priv_mais, l.n_priv_menos,
            i.left_pct, i.right_pct, i.privilege_pct
       FROM party_leg l
       LEFT JOIN party_iv_leg i ON i.chamber = l.chamber AND i.legislatura = l.legislatura AND i.party = l.party
      WHERE l.chamber = ?
      ORDER BY l.legislatura, l.party`,
    chamber,
  );
}

/** Legislaturas com votações classificadas (as procedimentais automáticas não contam), numa casa. */
export function legislaturasClassificadas(chamber: "C" | "S"): { legislatura: number; total: number; classificadas: number }[] {
  return all<{ legislatura: number; total: number; classificadas: number }>(
    `SELECT s.legislatura,
            COUNT(*) AS total,
            COALESCE(SUM(EXISTS (SELECT 1 FROM vote_tag t WHERE t.sv = s.id AND COALESCE(t.rubric_ver, '') <> 'auto')), 0) AS classificadas
       FROM session_vote_all s WHERE s.is_nominal = 1 AND s.chamber = ? AND s.legislatura IS NOT NULL
      GROUP BY s.legislatura ORDER BY s.legislatura`,
    chamber,
  );
}

/* ----- Teste independente por legislatura (mapa de votos × perfil) ----- */

export type ValidacaoLegislatura = {
  legislatura: number;
  membros: number;
  votacoes: number;
  var1: number;
  estado_d1: number | null;
  privilegio_d1: number | null;
  partidos_estado_d1: number | null;
  n_partidos: number;
  governo_d1: number | null;
};

/** Correlações entre o perfil e o mapa de votos, uma linha por legislatura de uma casa. */
export function validacaoLegislaturas(chamber: "C" | "S"): ValidacaoLegislatura[] {
  try {
    const v = (nome: string, col: "valor" | "n") =>
      `(SELECT ${col} FROM validacao_leg x WHERE x.chamber = m.chamber AND x.legislatura = m.legislatura AND x.nome = '${nome}')`;
    return all<ValidacaoLegislatura>(
      `SELECT m.legislatura, m.membros, m.votacoes, m.var1,
              ${v("estado_d1", "valor")} AS estado_d1, ${v("privilegio_d1", "valor")} AS privilegio_d1,
              ${v("partidos_estado_d1", "valor")} AS partidos_estado_d1, COALESCE(${v("partidos_estado_d1", "n")}, 0) AS n_partidos,
              ${v("governo_d1", "valor")} AS governo_d1
         FROM mapa_meta_leg m WHERE m.chamber = ? ORDER BY m.legislatura`,
      chamber,
    );
  } catch {
    return [];
  }
}


export type PesadaRow = ReviewRow & { votantes: number; influencia: number };

/**
 * As votações classificadas com direção que mais pesam nas barras de uma legislatura. A influência de uma votação é
 * max(|econômico|, |privilégio|) × confiança × número de votantes Sim/Não: uma marcação errada numa votação assim muda
 * as barras de centenas de pessoas, então vale conferir primeiro.
 */
export function votosPesados(legislatura: number, limit: number, offset: number): PesadaRow[] {
  return all<PesadaRow>(
    `SELECT * FROM (
       SELECT t.sv, sv.date, b.label AS bill_label, sv.bill_id AS bill_id, bi.summary, sv.description,
              t.economic, t.privilege, t.procedural, t.confidence, t.rationale, t.source,
              (SELECT COUNT(*) FROM member_vote_all v WHERE v.session_vote_id = t.sv AND v.vote IN ('SIM', 'NAO')) AS votantes,
              MAX(ABS(t.economic), ABS(t.privilege)) * t.confidence *
                (SELECT COUNT(*) FROM member_vote_all v WHERE v.session_vote_id = t.sv AND v.vote IN ('SIM', 'NAO')) AS influencia
         FROM vote_tag_eff t
         JOIN session_vote_all sv ON sv.id = t.sv
         LEFT JOIN bill b ON b.id = sv.bill_id
         LEFT JOIN bill_info_eff bi ON bi.bill_id = sv.bill_id
        WHERE sv.legislatura = ? AND t.procedural = 0 AND (ABS(t.economic) >= 0.2 OR ABS(t.privilege) >= 0.3)
     ) ORDER BY influencia DESC, date DESC LIMIT ? OFFSET ?`,
    legislatura,
    limit,
    offset,
  );
}

/* ----- Participação e presença ----- */

export type Participacao = {
  member_id: string;
  legislatura: number;
  chamber: "C" | "S";
  /** 'eventos' = períodos oficiais de exercício; 'estimada' = do primeiro ao último voto (faltam eventos). */
  janela: string;
  votacoes: number;
  votou: number;
  sim: number;
  nao: number;
  abstencao: number;
  obstrucao: number;
  presidiu: number;
  ausente: number;
  justificadas: number;
  nao_compareceu: number;
  presente_sem_voto: number;
  outras: number;
  sessoes: number;
  sessoes_presente: number;
  maior_seq: number;
  seq_de: string | null;
  seq_ate: string | null;
  primeira: string | null;
  ultima: string | null;
  cargo_mesa: string | null;
};

export function participacaoDoMembro(id: string, legislatura: number): Participacao | undefined {
  try {
    return one<Participacao>("SELECT * FROM participacao_mandato WHERE member_id = ? AND legislatura = ?", id, legislatura);
  } catch {
    return undefined;
  }
}

export function participacaoMeses(id: string, legislatura: number) {
  return all<{ mes: string; votacoes: number; votou: number }>(
    "SELECT mes, votacoes, votou FROM participacao_mes WHERE member_id = ? AND legislatura = ? ORDER BY mes",
    id,
    legislatura,
  );
}

export function participacaoTipos(id: string, legislatura: number) {
  return all<{ tipo: string; votacoes: number; votou: number }>(
    "SELECT tipo, votacoes, votou FROM participacao_tipo WHERE member_id = ? AND legislatura = ? ORDER BY votacoes DESC, tipo",
    id,
    legislatura,
  );
}

export function participacaoMarcas(id: string, legislatura: number) {
  return one<{ apertadas: number; apertadas_votou: number; importantes: number; importantes_votou: number }>(
    "SELECT apertadas, apertadas_votou, importantes, importantes_votou FROM participacao_marcas WHERE member_id = ? AND legislatura = ?",
    id,
    legislatura,
  );
}

export function periodosForaDoExercicio(id: string, legislatura: number) {
  return all<{ inicio: string; fim: string | null; motivo: string }>(
    "SELECT inicio, fim, motivo FROM fora_exercicio WHERE member_id = ? AND legislatura = ? ORDER BY inicio",
    id,
    legislatura,
  );
}

export function periodosDeExercicioDoMembro(id: string, legislatura: number) {
  return all<{ inicio: string; fim: string | null; motivo_fim: string | null }>(
    "SELECT inicio, fim, motivo_fim FROM exercicio_periodo WHERE member_id = ? AND legislatura = ? ORDER BY inicio",
    id,
    legislatura,
  );
}

/** Quem tem pelo menos esta parcela das votações da legislatura entra em médias e rankings (evita comparar mandatos de poucas semanas). */
export const EXPOSICAO_MINIMA = 0.3;

function totalVotacoes(chamber: string, legislatura: number): number {
  return one<{ n: number }>("SELECT COUNT(*) n FROM session_vote_all WHERE is_nominal = 1 AND chamber = ? AND legislatura = ?", chamber, legislatura)?.n ?? 0;
}

export type Comparacao = {
  elegivel: boolean;
  casa: { media: number; n: number } | null;
  partido: { sigla: string; media: number; n: number } | null;
  uf: { sigla: string; media: number; n: number } | null;
  posicao: { rank: number; total: number } | null;
};

/**
 * Participação da pessoa ao lado da média da casa, do partido (linhagem) e da bancada do estado, entre quem esteve em
 * exercício por tempo suficiente (≥ 30% das votações) e não é da Mesa Diretora. A posição só existe para quem entra na comparação.
 */
export function comparacaoDeParticipacao(id: string, legislatura: number): Comparacao | null {
  const p = participacaoDoMembro(id, legislatura);
  if (!p) return null;
  const minimo = Math.ceil(totalVotacoes(p.chamber, legislatura) * EXPOSICAO_MINIMA);
  const base = `FROM participacao_mandato p
       JOIN member_all a ON a.id = p.member_id
       LEFT JOIN mandato m ON m.member_id = p.member_id AND m.legislatura = p.legislatura
      WHERE p.legislatura = ? AND p.chamber = ? AND p.votacoes >= ? AND p.cargo_mesa IS NULL`;
  const taxa = "1.0 * p.votou / p.votacoes";
  const elegivel = p.votacoes >= minimo && !p.cargo_mesa;
  const media = (extra: string, ...params: SQLInputValue[]) =>
    one<{ media: number | null; n: number }>(`SELECT AVG(${taxa}) AS media, COUNT(*) AS n ${base} ${extra}`, legislatura, p.chamber, minimo, ...params);
  const casa = media("");
  const dono = one<{ uf: string | null; partido: string | null }>(
    "SELECT a.uf AS uf, m.partido AS partido FROM member_all a LEFT JOIN mandato m ON m.member_id = a.id AND m.legislatura = ? WHERE a.id = ?",
    legislatura,
    id,
  );
  const pt = dono?.partido ? media("AND m.partido = ?", dono.partido) : undefined;
  const uf = dono?.uf ? media("AND a.uf = ?", dono.uf) : undefined;
  let posicao: Comparacao["posicao"] = null;
  if (elegivel) {
    const r = one<{ acima: number; total: number }>(
      `SELECT SUM(${taxa} > ?) AS acima, COUNT(*) AS total ${base}`,
      p.votou / p.votacoes,
      legislatura,
      p.chamber,
      minimo,
    );
    if (r) posicao = { rank: (r.acima ?? 0) + 1, total: r.total };
  }
  return {
    elegivel,
    casa: casa?.media != null ? { media: casa.media, n: casa.n } : null,
    partido: pt?.media != null && dono?.partido ? { sigla: dono.partido, media: pt.media, n: pt.n } : null,
    uf: uf?.media != null && dono?.uf ? { sigla: dono.uf, media: uf.media, n: uf.n } : null,
    posicao,
  };
}

export type AusenciaRow = {
  sv: string;
  date: string;
  description: string | null;
  bill_id: string | null;
  bill_label: string | null;
  codigo: string | null;
  motivo: string | null;
  apertada: number;
  importante: number;
  sim: number | null;
  nao: number | null;
};

/** Votações em que a pessoa não registrou voto, da mais recente para a mais antiga. */
export function ausenciasDoMembro(id: string, legislatura: number, filtro: "todas" | "apertadas" | "importantes", limit: number, offset: number): AusenciaRow[] {
  const extra = filtro === "apertadas" ? "AND COALESCE(m.apertada, 0) = 1" : filtro === "importantes" ? "AND t.sv IS NOT NULL" : "";
  return all<AusenciaRow>(
    `SELECT a.sv, s.date, s.description, s.bill_id, b.label AS bill_label, a.codigo, a.descricao AS motivo,
            COALESCE(m.apertada, 0) AS apertada, CASE WHEN t.sv IS NULL THEN 0 ELSE 1 END AS importante, m.sim, m.nao
       FROM participacao_ausencia a
       JOIN session_vote_all s ON s.id = a.sv
       LEFT JOIN bill b ON b.id = s.bill_id
       LEFT JOIN votacao_margem m ON m.sv = a.sv
       LEFT JOIN vote_tag_eff t ON t.sv = a.sv AND t.procedural = 0 AND (ABS(t.economic) >= 0.2 OR ABS(t.privilege) >= 0.3)
      WHERE a.member_id = ? AND a.legislatura = ? ${extra}
      ORDER BY s.date DESC, a.sv DESC LIMIT ? OFFSET ?`,
    id,
    legislatura,
    limit,
    offset,
  );
}

export function contarAusencias(id: string, legislatura: number, filtro: "todas" | "apertadas" | "importantes"): number {
  const extra = filtro === "apertadas" ? "AND COALESCE(m.apertada, 0) = 1" : filtro === "importantes" ? "AND t.sv IS NOT NULL" : "";
  return (
    one<{ n: number }>(
      `SELECT COUNT(*) n FROM participacao_ausencia a
         LEFT JOIN votacao_margem m ON m.sv = a.sv
         LEFT JOIN vote_tag_eff t ON t.sv = a.sv AND t.procedural = 0 AND (ABS(t.economic) >= 0.2 OR ABS(t.privilege) >= 0.3)
        WHERE a.member_id = ? AND a.legislatura = ? ${extra}`,
      id,
      legislatura,
    )?.n ?? 0
  );
}

export type RankingParticipacao = {
  member_id: string;
  name: string;
  chamber: string;
  party: string | null;
  uf: string | null;
  votacoes: number;
  votou: number;
  taxa: number;
  sessoes: number;
  sessoes_presente: number;
  importantes: number | null;
  importantes_votou: number | null;
};

/**
 * Ranking de participação nas votações nominais da legislatura atual, só de quem está em exercício hoje, esteve em
 * exercício em pelo menos 30% das votações e não é da Mesa Diretora (que preside sessões). Licenças e suplência não
 * contam contra: o denominador é o período em exercício.
 */
export function rankingParticipacao(f: { chamber?: string; party?: string; uf?: string; ordem: "maior" | "menor"; limit: number; offset: number }, legislatura: number) {
  const where: string[] = ["p.legislatura = ?", "p.cargo_mesa IS NULL"];
  const params: SQLInputValue[] = [legislatura];
  const casas: ("C" | "S")[] = f.chamber === "C" ? ["C"] : f.chamber === "S" ? ["S"] : ["C", "S"];
  const condMin = casas.map((c) => `(p.chamber = '${c}' AND p.votacoes >= ${Math.ceil(totalVotacoes(c, legislatura) * EXPOSICAO_MINIMA)})`).join(" OR ");
  where.push(`(${condMin})`);
  if (f.party) { where.push("m.party = ?"); params.push(f.party); }
  if (f.uf) { where.push("m.uf = ?"); params.push(f.uf); }
  const dir = f.ordem === "maior" ? "DESC" : "ASC";
  const rows = all<RankingParticipacao>(
    `SELECT p.member_id, m.name, m.chamber, m.party, m.uf, p.votacoes, p.votou, 1.0 * p.votou / p.votacoes AS taxa, p.sessoes, p.sessoes_presente, k.importantes, k.importantes_votou
       FROM participacao_mandato p JOIN member m ON m.id = p.member_id
       LEFT JOIN participacao_marcas k ON k.member_id = p.member_id AND k.legislatura = p.legislatura
      WHERE ${where.join(" AND ")}
      ORDER BY taxa ${dir}, p.votacoes DESC, m.name LIMIT ? OFFSET ?`,
    ...params,
    f.limit,
    f.offset,
  );
  const total = one<{ n: number }>(`SELECT COUNT(*) n FROM participacao_mandato p JOIN member m ON m.id = p.member_id WHERE ${where.join(" AND ")}`, ...params)?.n ?? 0;
  return { rows, total };
}

/** Média de participação das pessoas do ranking (referência para ler os números). */
export function mediaDoRanking(legislatura: number, chamber?: string): number | null {
  const casas = chamber === "C" ? ["C"] : chamber === "S" ? ["S"] : ["C", "S"];
  const cond = casas.map((c) => `(p.chamber = '${c}' AND p.votacoes >= ${Math.ceil(totalVotacoes(c, legislatura) * EXPOSICAO_MINIMA)})`).join(" OR ");
  return one<{ m: number | null }>(
    `SELECT AVG(1.0 * p.votou / p.votacoes) m FROM participacao_mandato p JOIN member m ON m.id = p.member_id
      WHERE p.legislatura = ? AND p.cargo_mesa IS NULL AND (${cond})`,
    legislatura,
  )?.m ?? null;
}


/**
 * Quantas sessões deliberativas realizadas do Plenário têm lista de presença numa legislatura. As sem lista ficam fora
 * das contas de presença; este número diz o quanto foi deixado de fora.
 */
export function coberturaPresenca(legislatura: number): { realizadas: number; comLista: number } {
  const { inicio, fim } = periodoDaLegislatura(legislatura);
  try {
    return (
      one<{ realizadas: number; comLista: number }>(
        "SELECT COUNT(*) AS realizadas, COALESCE(SUM(com_presenca), 0) AS comLista FROM sessao_plenario WHERE data >= ? AND data <= ?",
        inicio,
        fim,
      ) ?? { realizadas: 0, comLista: 0 }
    );
  } catch {
    return { realizadas: 0, comLista: 0 };
  }
}


export type ParticipacaoPartido = {
  resumo: ResumoDistribuicao;
  topo: { member_id: string; name: string; taxa: number }[];
  fundo: { member_id: string; name: string; taxa: number }[];
  /** Quantos do partido ficaram de fora da conta (Mesa Diretora ou menos de 30% das votações). */
  fora: number;
};

/** Participação de quem está hoje no partido: quem entra, quem sai da conta e os extremos. */
export function participacaoDoPartido(sigla: string, legislatura: number): ParticipacaoPartido | null {
  let rows: { member_id: string; name: string; chamber: string; votacoes: number; votou: number; cargo_mesa: string | null }[];
  try {
    rows = all(
      `SELECT p.member_id, m.name, p.chamber, p.votacoes, p.votou, p.cargo_mesa
         FROM participacao_mandato p JOIN member m ON m.id = p.member_id
        WHERE p.legislatura = ? AND m.party = ?`,
      legislatura,
      sigla,
    );
  } catch {
    return null;
  }
  const minimo = { C: Math.ceil(totalVotacoes("C", legislatura) * EXPOSICAO_MINIMA), S: Math.ceil(totalVotacoes("S", legislatura) * EXPOSICAO_MINIMA) };
  const elegiveis = rows
    .filter((r) => !r.cargo_mesa && r.votacoes >= minimo[r.chamber as "C" | "S"])
    .map((r) => ({ member_id: r.member_id, name: r.name, taxa: r.votou / r.votacoes }))
    .sort((a, b) => b.taxa - a.taxa || a.name.localeCompare(b.name));
  const resumo = resumoDistribuicao(elegiveis.map((e) => e.taxa));
  if (!resumo) return null;
  return { resumo, topo: elegiveis.slice(0, 3), fundo: elegiveis.slice(-3).reverse(), fora: rows.length - elegiveis.length };
}

export type MotivoSenado = {
  descricao: string;
  total: number;
  senadores: { member_id: string; name: string; n: number; votacoes: number }[];
};

/** Ausências de senadores por motivo oficial, com os 5 senadores que mais tiveram cada motivo. */
export function ausenciasSenadoPorMotivo(legislatura: number, topN = 5): MotivoSenado[] {
  let motivos: { descricao: string; total: number }[];
  try {
    motivos = all(
      `SELECT COALESCE(a.descricao, 'Sem motivo informado') AS descricao, COUNT(*) AS total
         FROM participacao_ausencia a JOIN participacao_mandato p ON p.member_id = a.member_id AND p.legislatura = a.legislatura
        WHERE a.legislatura = ? AND p.chamber = 'S' GROUP BY 1 ORDER BY total DESC`,
      legislatura,
    );
  } catch {
    return [];
  }
  return motivos.map((m) => ({
    ...m,
    senadores: all<{ member_id: string; name: string; n: number; votacoes: number }>(
      `SELECT a.member_id, x.name, COUNT(*) AS n, p.votacoes
         FROM participacao_ausencia a
         JOIN participacao_mandato p ON p.member_id = a.member_id AND p.legislatura = a.legislatura
         JOIN member_all x ON x.id = a.member_id
        WHERE a.legislatura = ? AND p.chamber = 'S' AND COALESCE(a.descricao, 'Sem motivo informado') = ?
        GROUP BY a.member_id ORDER BY n DESC, x.name LIMIT ?`,
      legislatura,
      m.descricao,
      topN,
    ),
  }));
}


/* ----- Atividade do mandato (Câmara): autoria e comissões ----- */

export type AutoriaRow = { prop_id: number; tipo: string | null; numero: number | null; ano: number | null; ementa: string | null; apresentacao: string; url: string | null; coautores: number };

/** Tipos que contam como projeto de autoria: proposições que criam ou alteram norma. Requerimentos, emendas, pareceres e indicações ficam de fora. */
export const TIPOS_PROJETO = ["PL", "PLP", "PEC", "PDL", "PDC", "MPV", "PLV", "PLN", "PRC", "PFC", "PLC", "PLS"] as const;
const SQL_TIPOS = TIPOS_PROJETO.map((t) => `'${t}'`).join(",");

export type AtividadeMandato = { projetos: number; porTipo: { tipo: string; n: number }[]; outras: number; comissoes: number; presidiu: number };

/** Resumo de autoria e comissões de um mandato. Zeros quando não há dado (o Senado nunca tem). */
export function atividadeDoMandato(id: string, legislatura: number): AtividadeMandato {
  try {
    const porTipo = all<{ tipo: string; n: number }>(
      `SELECT tipo, COUNT(*) AS n FROM autoria WHERE member_id = ? AND legislatura = ? AND tipo IN (${SQL_TIPOS}) GROUP BY 1 ORDER BY n DESC, tipo`,
      id,
      legislatura,
    );
    const outras = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM autoria WHERE member_id = ? AND legislatura = ? AND (tipo IS NULL OR tipo NOT IN (${SQL_TIPOS}))`,
      id,
      legislatura,
    )?.n ?? 0;
    const c = one<{ n: number; pres: number }>(
      "SELECT COUNT(DISTINCT sigla) AS n, COALESCE(SUM(CASE WHEN cargo = 'Presidente' THEN 1 ELSE 0 END), 0) AS pres FROM member_comissao WHERE member_id = ? AND legislatura = ?",
      id,
      legislatura,
    );
    return { projetos: porTipo.reduce((s, r) => s + r.n, 0), porTipo, outras, comissoes: c?.n ?? 0, presidiu: c?.pres ?? 0 };
  } catch {
    return { projetos: 0, porTipo: [], outras: 0, comissoes: 0, presidiu: 0 };
  }
}

/** Proposições de autoria, das mais recentes para as mais antigas. */
export function autoriaDoMandato(id: string, legislatura: number, limit: number, offset: number): AutoriaRow[] {
  return all<AutoriaRow>(
    `SELECT prop_id, tipo, numero, ano, ementa, apresentacao, url, coautores FROM autoria
      WHERE member_id = ? AND legislatura = ? AND tipo IN (${SQL_TIPOS}) ORDER BY apresentacao DESC, prop_id DESC LIMIT ? OFFSET ?`,
    id,
    legislatura,
    limit,
    offset,
  );
}

export type ComissaoRow = { sigla: string; nome: string | null; cargos: string[]; inicio: string; fim: string | null };

const ORDEM_CARGO = ["Presidente", "1º Vice-Presidente", "2º Vice-Presidente", "3º Vice-Presidente", "Titular", "Suplente"];

/** Comissões do mandato, uma linha por órgão: cargos que teve e do primeiro início ao último fim (vazio = ainda participa). */
export function comissoesDoMandato(id: string, legislatura: number): ComissaoRow[] {
  const linhas = all<{ sigla: string; nome: string | null; cargo: string; inicio: string; fim: string | null }>(
    "SELECT sigla, nome, cargo, inicio, fim FROM member_comissao WHERE member_id = ? AND legislatura = ? ORDER BY inicio",
    id,
    legislatura,
  );
  const por = new Map<string, ComissaoRow>();
  for (const l of linhas) {
    const c = por.get(l.sigla);
    if (!c) {
      por.set(l.sigla, { sigla: l.sigla, nome: l.nome, cargos: [l.cargo], inicio: l.inicio, fim: l.fim });
      continue;
    }
    if (!c.cargos.includes(l.cargo)) c.cargos.push(l.cargo);
    if (l.inicio < c.inicio) c.inicio = l.inicio;
    c.fim = c.fim === null || l.fim === null ? null : l.fim > c.fim ? l.fim : c.fim;
  }
  const rank = (c: ComissaoRow) => Math.min(...c.cargos.map((x) => (ORDEM_CARGO.includes(x) ? ORDEM_CARGO.indexOf(x) : ORDEM_CARGO.length)));
  return [...por.values()].sort((a, b) => rank(a) - rank(b) || a.sigla.localeCompare(b.sigla));
}


/* ----- Discursos do mandato ----- */

export type DiscursoRow = { data: string; tipo: string; fase: string | null; grupo: string; sumario: string | null; url: string | null; video: string | null };

export type DiscursosMandato = {
  /** false = este mandato ainda não foi importado (diferente de zero discursos). */
  importado: boolean;
  pronunciamentos: number;
  intervencoes: number;
  presidencia: number;
  porTipo: { tipo: string; n: number }[];
};

/** Contagens de discursos do mandato. A Presidência (quem dirige a sessão) fica fora de pronunciamentos e intervenções. */
export function discursosDoMandato(id: string, legislatura: number): DiscursosMandato {
  const vazio: DiscursosMandato = { importado: false, pronunciamentos: 0, intervencoes: 0, presidencia: 0, porTipo: [] };
  try {
    const marca = one<{ n: number }>("SELECT COUNT(*) AS n FROM discurso_mandato WHERE member_id = ? AND legislatura = ?", id, legislatura);
    if (!marca?.n) return vazio;
    const g = all<{ grupo: string; n: number }>("SELECT grupo, COUNT(*) AS n FROM discurso WHERE member_id = ? AND legislatura = ? GROUP BY grupo", id, legislatura);
    const n = (k: string) => g.find((x) => x.grupo === k)?.n ?? 0;
    const porTipo = all<{ tipo: string; n: number }>(
      "SELECT tipo, COUNT(*) AS n FROM discurso WHERE member_id = ? AND legislatura = ? AND grupo <> 'presidencia' GROUP BY tipo ORDER BY n DESC, tipo LIMIT 8",
      id,
      legislatura,
    );
    return { importado: true, pronunciamentos: n("pronunciamento"), intervencoes: n("intervencao"), presidencia: n("presidencia"), porTipo };
  } catch {
    return vazio;
  }
}

/** Discursos do mandato, dos mais recentes para os mais antigos; por padrão só pronunciamentos. */
export function discursosLista(id: string, legislatura: number, grupo: "pronunciamento" | "intervencao", limit: number, offset: number): DiscursoRow[] {
  return all<DiscursoRow>(
    `SELECT data, tipo, fase, grupo, sumario, url, video FROM discurso
      WHERE member_id = ? AND legislatura = ? AND grupo = ? ORDER BY data DESC, rowid DESC LIMIT ? OFFSET ?`,
    id,
    legislatura,
    grupo,
    limit,
    offset,
  );
}

/**
 * Taxa de participação (votos ÷ votações) de várias pessoas numa legislatura, para mostrar nas listas.
 * Quem está na Mesa Diretora não entra (a taxa não é comparável); quem não tem dado também não.
 */
export function taxasDeParticipacao(ids: string[], legislatura: number): Map<string, number> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  try {
    for (let i = 0; i < ids.length; i += 500) {
      const parte = ids.slice(i, i + 500);
      const rows = all<{ member_id: string; votou: number; votacoes: number }>(
        `SELECT member_id, votou, votacoes FROM participacao_mandato
          WHERE legislatura = ? AND cargo_mesa IS NULL AND votacoes > 0 AND member_id IN (${parte.map(() => "?").join(",")})`,
        legislatura,
        ...parte,
      );
      for (const r of rows) out.set(r.member_id, r.votou / r.votacoes);
    }
  } catch {
    /* tabela ausente: sem números */
  }
  return out;
}


/* ----- Aprovação dos projetos de autoria ----- */

export type AprovacaoMandato = {
  /** false = a situação das proposições ainda não foi importada para este mandato. */
  coletado: boolean;
  propostos: number;
  leis: number;
  /** leis ÷ propostos (null quando não há projetos). */
  taxa: number | null;
  porSituacao: { grupo: string; n: number; pct: number }[];
  porTipo: { tipo: string; n: number; pct: number; leis: number; taxaLei: number }[];
};

const ORDEM_SITUACAO = ["lei", "senado", "veto", "tramitando", "arquivada", "retirada", "outra"];

/**
 * Do que o deputado propôs de fato (só tipos legislativos), quantos viraram lei e como estão os demais. Cada projeto
 * conta uma vez para cada autor proponente, então coautoria conta para todos. "Aprovado" aqui é "virou norma jurídica".
 */
export function aprovacaoDoMandato(id: string, legislatura: number): AprovacaoMandato {
  const vazio: AprovacaoMandato = { coletado: false, propostos: 0, leis: 0, taxa: null, porSituacao: [], porTipo: [] };
  try {
    const rows = all<{ grupo: string | null; tipo: string; n: number }>(
      `SELECT grupo_situacao AS grupo, tipo, COUNT(*) AS n FROM autoria
        WHERE member_id = ? AND legislatura = ? AND tipo IN (${SQL_TIPOS}) GROUP BY 1, 2`,
      id,
      legislatura,
    );
    if (!rows.length) return { ...vazio, coletado: true };
    if (rows.every((r) => r.grupo === null)) return vazio;
    const total = rows.reduce((s, r) => s + r.n, 0);
    const leis = rows.filter((r) => r.grupo === "lei").reduce((s, r) => s + r.n, 0);
    const sit = new Map<string, number>();
    const tip = new Map<string, { n: number; leis: number }>();
    for (const r of rows) {
      const g = r.grupo ?? "outra";
      sit.set(g, (sit.get(g) ?? 0) + r.n);
      const t = tip.get(r.tipo) ?? { n: 0, leis: 0 };
      t.n += r.n;
      if (g === "lei") t.leis += r.n;
      tip.set(r.tipo, t);
    }
    return {
      coletado: true,
      propostos: total,
      leis,
      taxa: total ? leis / total : null,
      porSituacao: ORDEM_SITUACAO.filter((g) => sit.has(g)).map((g) => ({ grupo: g, n: sit.get(g)!, pct: sit.get(g)! / total })),
      porTipo: [...tip.entries()]
        .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
        .map(([tipo, v]) => ({ tipo, n: v.n, pct: v.n / total, leis: v.leis, taxaLei: v.leis / v.n })),
    };
  } catch {
    return vazio;
  }
}

export const MIN_PROJETOS_COMPARACAO = 10;

/** Taxa de "virou lei" dos deputados da legislatura com pelo menos 10 projetos, para dar contexto. */
export function comparacaoAprovacao(legislatura: number): { n: number; media: number; mediana: number } | null {
  try {
    const rows = all<{ n: number; leis: number }>(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN grupo_situacao = 'lei' THEN 1 ELSE 0 END) AS leis FROM autoria
        WHERE legislatura = ? AND tipo IN (${SQL_TIPOS}) AND grupo_situacao IS NOT NULL GROUP BY member_id HAVING COUNT(*) >= ${MIN_PROJETOS_COMPARACAO}`,
      legislatura,
    );
    const r = resumoDistribuicao(rows.map((x) => x.leis / x.n));
    return r ? { n: r.n, media: r.media, mediana: r.mediana } : null;
  } catch {
    return null;
  }
}
