import type { DatabaseSync } from "node:sqlite";
import { calcularMapa, orientar, spearman, type Entrada, type OpcoesMapa } from "./mapa";
import { classificarMandatoCamara, classificarMandatoSenado, type ExercicioSenado } from "./mandato";
import { periodoDaLegislatura } from "./legislaturas";
import { LINHAGENS, SEM_PARTIDO, partidoCanonico, siglasDesconhecidas } from "./partidos";

/*
 * Derived (precomputed) tables, rebuilt from member_vote / vote_tag / bill_info.
 *   deriveCore: party positions, agreement, loyalty (heavy, ~15s)
 *   deriveIv:   effective tags and IV bars (fast, <2s) — also run after a human override.
 * A party's "position" in a votação = majority of its Yes/No voters (needs >= 2 voters, no tie).
 * For a member's OWN party the member's vote is removed first (leave-one-out).
 */

/** Minimum counted votes before a bar is shown (otherwise the bar is "not scored"). */
export const MIN_ECONOMIC_VOTES = 10;
export const MIN_PRIVILEGE_VOTES = 5;
/** |value| thresholds below which a tag does not count toward a bar. */
export const ECONOMIC_MIN_MAGNITUDE = 0.2;
export const PRIVILEGE_MIN_MAGNITUDE = 0.3;

type Log = (name: string, seconds: number) => void;

function step(db: DatabaseSync, name: string, sql: string, log?: Log) {
  const t = Date.now();
  db.exec(sql);
  log?.(name, (Date.now() - t) / 1000);
}

export function deriveCore(db: DatabaseSync, log?: Log) {
  db.exec("BEGIN");
  try {
    step(
      db,
      "party_position",
      `
      DROP TABLE IF EXISTS party_position;
      CREATE TABLE party_position (
        sv       TEXT NOT NULL,
        party    TEXT NOT NULL,
        yes      INTEGER NOT NULL,
        no       INTEGER NOT NULL,
        pos      TEXT NOT NULL,       -- 'SIM' | 'NAO'
        cohesion REAL NOT NULL,       -- share of the party's Yes/No voters on the winning side
        PRIMARY KEY (sv, party)
      ) WITHOUT ROWID;
      INSERT INTO party_position
        SELECT session_vote_id, party_at_time,
               SUM(vote = 'SIM'), SUM(vote = 'NAO'),
               CASE WHEN SUM(vote = 'SIM') > SUM(vote = 'NAO') THEN 'SIM' ELSE 'NAO' END,
               MAX(SUM(vote = 'SIM'), SUM(vote = 'NAO')) * 1.0 / (SUM(vote = 'SIM') + SUM(vote = 'NAO'))
          FROM member_vote
         WHERE vote IN ('SIM', 'NAO') AND party_at_time IS NOT NULL AND party_at_time NOT IN ('S/Partido', 'Sem Partido')
         GROUP BY session_vote_id, party_at_time
        HAVING SUM(vote = 'SIM') + SUM(vote = 'NAO') >= 2 AND SUM(vote = 'SIM') <> SUM(vote = 'NAO');
      CREATE INDEX idx_pp_party ON party_position(party);
    `,
      log,
    );

    step(
      db,
      "party_stats",
      `
      DROP TABLE IF EXISTS party_stats;
      CREATE TABLE party_stats AS
        SELECT party, AVG(cohesion) AS cohesion, COUNT(*) AS positions FROM party_position GROUP BY party;
      CREATE UNIQUE INDEX idx_ps_party ON party_stats(party);
    `,
      log,
    );

    step(
      db,
      "party_agreement",
      `
      DROP TABLE IF EXISTS party_agreement;
      CREATE TABLE party_agreement AS
        SELECT substr(a.sv, 1, 1) AS chamber, a.party AS a, b.party AS b, COUNT(*) AS shared, SUM(a.pos = b.pos) AS same
          FROM party_position a JOIN party_position b ON a.sv = b.sv AND a.party < b.party
         GROUP BY substr(a.sv, 1, 1), a.party, b.party;
      CREATE UNIQUE INDEX idx_pa ON party_agreement(chamber, a, b);
    `,
      log,
    );

    // Member × party: among votes where the member voted Yes/No and the party had a position,
    // how often did they match. Own party uses leave-one-out counts.
    const joined = `
      SELECT mv.member_id AS member_id, pp.party AS party, mv.vote AS vote,
             CASE WHEN mv.party_at_time = pp.party THEN pp.yes - (mv.vote = 'SIM') ELSE pp.yes END AS y,
             CASE WHEN mv.party_at_time = pp.party THEN pp.no  - (mv.vote = 'NAO') ELSE pp.no  END AS n,
             (mv.party_at_time = pp.party) AS own
        FROM member_vote mv JOIN party_position pp ON pp.sv = mv.session_vote_id
       WHERE mv.vote IN ('SIM', 'NAO')`;

    step(
      db,
      "member_party_agreement",
      `
      DROP TABLE IF EXISTS member_party_agreement;
      CREATE TABLE member_party_agreement (
        member_id TEXT NOT NULL,
        party     TEXT NOT NULL,
        shared    INTEGER NOT NULL,
        same      INTEGER NOT NULL,
        PRIMARY KEY (member_id, party)
      ) WITHOUT ROWID;
      INSERT INTO member_party_agreement
        SELECT member_id, party, COUNT(*), SUM(vote = CASE WHEN y > n THEN 'SIM' ELSE 'NAO' END)
          FROM (${joined}) WHERE y <> n AND y + n >= 2
         GROUP BY member_id, party;
    `,
      log,
    );

    step(
      db,
      "member_loyalty",
      `
      DROP TABLE IF EXISTS member_loyalty;
      CREATE TABLE member_loyalty AS
        SELECT member_id, COUNT(*) AS shared, SUM(vote = CASE WHEN y > n THEN 'SIM' ELSE 'NAO' END) AS same
          FROM (${joined}) WHERE own = 1 AND y <> n AND y + n >= 2
         GROUP BY member_id;
      CREATE UNIQUE INDEX idx_ml ON member_loyalty(member_id);
    `,
      log,
    );
    // Alinhamento com a orientação do Governo (só a Câmara registra orientações). Só contam orientações claras
    // (Sim/Não); "Liberado", "Obstrução" e "Abstenção" são ignoradas. Votações procedimentais também entram.
    // A orientação do líder do próprio partido NÃO é calculada: a Câmara registra orientação por partido só para
    // alguns (a maioria aparece dentro de blocos/federações com nomes truncados), o que tornaria a comparação injusta.
    const govOri = `
      SELECT session_vote_id AS sv, CASE orientation WHEN 'Sim' THEN 'SIM' ELSE 'NAO' END AS o
        FROM orientation WHERE key = 'Governo' AND kind = 'bloc' AND orientation IN ('Sim', 'Não')`;

    step(
      db,
      "alinhamento_orientacoes",
      `
      DROP TABLE IF EXISTS member_governo;
      CREATE TABLE member_governo AS
        SELECT mv.member_id AS member_id, COUNT(*) AS shared, SUM(mv.vote = g.o) AS same
          FROM member_vote mv JOIN (${govOri}) g ON g.sv = mv.session_vote_id
         WHERE mv.vote IN ('SIM', 'NAO') GROUP BY mv.member_id;
      CREATE UNIQUE INDEX idx_mg ON member_governo(member_id);

      DROP TABLE IF EXISTS party_governo;
      CREATE TABLE party_governo AS
        SELECT mv.party_at_time AS party, COUNT(*) AS shared, SUM(mv.vote = g.o) AS same
          FROM member_vote mv JOIN (${govOri}) g ON g.sv = mv.session_vote_id
         WHERE mv.vote IN ('SIM', 'NAO') AND mv.party_at_time IS NOT NULL
           AND mv.party_at_time NOT IN ('S/Partido', 'Sem Partido')
         GROUP BY mv.party_at_time;
      CREATE UNIQUE INDEX idx_pg ON party_governo(party);
    `,
      log,
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  deriveMapa(db, log);
  db.exec("ANALYZE");
}

/**
 * SQL das barras (perfil de votação) para qualquer agrupamento: usado pelo perfil atual (deriveIv) e pelo histórico por
 * legislatura (deriveHistorico). `from` deve expor `mv` (o voto: vote, ...) e `t` (a marcação efetiva do voto).
 */
export function aggSql(a: { table: string; from: string; keys: { expr: string; name: string }[]; minE: number; minP: number; where?: string }): string {
  const { table, from, keys, minE, minP } = a;
  const sel = keys.map((k, i) => `${k.expr} AS k${i}`).join(", ");
  const grp = keys.map((_, i) => `k${i}`).join(", ");
  const out = keys.map((k, i) => `k${i} AS ${k.name}`).join(", ");
  const idx = keys.map((k) => k.name).join(", ");
  return `
      DROP TABLE IF EXISTS ${table};
      CREATE TABLE ${table} AS
      WITH j AS (
        SELECT ${sel},
               CASE mv.vote WHEN 'SIM' THEN 1.0 ELSE -1.0 END AS d,
               t.economic AS e, t.privilege AS p, t.confidence AS c
          FROM ${from}
         WHERE mv.vote IN ('SIM', 'NAO') AND t.procedural = 0${a.where ? ` AND ${a.where}` : ""}
      ),
      s AS (
        SELECT ${grp},
          SUM(CASE WHEN ABS(e) >= ${ECONOMIC_MIN_MAGNITUDE} AND d * e < 0 THEN ABS(e) * c ELSE 0 END) AS lw,
          SUM(CASE WHEN ABS(e) >= ${ECONOMIC_MIN_MAGNITUDE} AND d * e > 0 THEN ABS(e) * c ELSE 0 END) AS rw,
          SUM(ABS(e) >= ${ECONOMIC_MIN_MAGNITUDE}) AS ne,
          SUM(CASE WHEN ABS(p) >= ${PRIVILEGE_MIN_MAGNITUDE} AND d * p > 0 THEN ABS(p) * c ELSE 0 END) AS pw_for,
          SUM(CASE WHEN ABS(p) >= ${PRIVILEGE_MIN_MAGNITUDE} THEN ABS(p) * c ELSE 0 END) AS pw,
          SUM(ABS(p) >= ${PRIVILEGE_MIN_MAGNITUDE}) AS np,
          -- cobertura: votos substantivos (não procedimentais) e quantos têm direção marcada
          COUNT(*) AS n_subst,
          SUM(ABS(e) >= ${ECONOMIC_MIN_MAGNITUDE} OR ABS(p) >= ${PRIVILEGE_MIN_MAGNITUDE}) AS n_dir,
          -- robustez: as mesmas contas só com marcações de confiança >= 0,5
          SUM(CASE WHEN c >= 0.5 AND ABS(e) >= ${ECONOMIC_MIN_MAGNITUDE} AND d * e < 0 THEN ABS(e) * c ELSE 0 END) AS lw_r,
          SUM(CASE WHEN c >= 0.5 AND ABS(e) >= ${ECONOMIC_MIN_MAGNITUDE} AND d * e > 0 THEN ABS(e) * c ELSE 0 END) AS rw_r,
          SUM(c >= 0.5 AND ABS(e) >= ${ECONOMIC_MIN_MAGNITUDE}) AS ne_r,
          SUM(CASE WHEN c >= 0.5 AND ABS(p) >= ${PRIVILEGE_MIN_MAGNITUDE} AND d * p > 0 THEN ABS(p) * c ELSE 0 END) AS pw_for_r,
          SUM(CASE WHEN c >= 0.5 AND ABS(p) >= ${PRIVILEGE_MIN_MAGNITUDE} THEN ABS(p) * c ELSE 0 END) AS pw_r,
          SUM(c >= 0.5 AND ABS(p) >= ${PRIVILEGE_MIN_MAGNITUDE}) AS np_r
        FROM j GROUP BY ${grp}
      )
      SELECT ${out},
        CASE WHEN ne >= ${minE} AND lw + rw > 0 THEN 100.0 * lw / (lw + rw) END AS left_pct,
        CASE WHEN ne >= ${minE} AND lw + rw > 0 THEN 100.0 * rw / (lw + rw) END AS right_pct,
        CASE WHEN np >= ${minP} AND pw > 0 THEN 100.0 * pw_for / pw END AS privilege_pct,
        ne AS n_economic, np AS n_privilege,
        n_subst, n_dir,
        CASE WHEN ne_r >= ${minE} AND lw_r + rw_r > 0 THEN 100.0 * lw_r / (lw_r + rw_r) END AS left_pct_robust,
        CASE WHEN ne_r >= ${minE} AND lw_r + rw_r > 0 THEN 100.0 * rw_r / (lw_r + rw_r) END AS right_pct_robust,
        CASE WHEN np_r >= ${minP} AND pw_r > 0 THEN 100.0 * pw_for_r / pw_r END AS privilege_pct_robust
      FROM s;
      CREATE UNIQUE INDEX idx_${table} ON ${table}(${idx});`;
}

/**
 * IV bars. A "Sim" counts +value and a "Não" −value of the vote's tag; abstentions, obstruction and
 * absences are ignored. Weight of a vote = |value| × confidence.
 *   left/right = share of weighted economic votes pushing toward state (value<0) / market (value>0)
 *   privilege  = share of weighted privilege votes where the member pushed toward MORE privilege
 */
export function deriveIv(db: DatabaseSync, log?: Log, opts: { minEconomic?: number; minPrivilege?: number } = {}) {
  const minE = opts.minEconomic ?? MIN_ECONOMIC_VOTES;
  const minP = opts.minPrivilege ?? MIN_PRIVILEGE_VOTES;
  db.exec("BEGIN");
  try {
    step(
      db,
      "effective tags",
      `
      DROP TABLE IF EXISTS vote_tag_eff;
      CREATE TABLE vote_tag_eff AS
        SELECT t.sv, t.economic, t.privilege, t.procedural, t.confidence, t.rationale, t.source
          FROM vote_tag t
         WHERE t.source = 'human'
            OR NOT EXISTS (SELECT 1 FROM vote_tag h WHERE h.sv = t.sv AND h.source = 'human');
      CREATE UNIQUE INDEX idx_vte ON vote_tag_eff(sv);

      DROP TABLE IF EXISTS bill_info_eff;
      CREATE TABLE bill_info_eff AS
        SELECT b.bill_id, b.topic, b.summary
          FROM bill_info b
         WHERE b.source = 'human'
            OR NOT EXISTS (SELECT 1 FROM bill_info h WHERE h.bill_id = b.bill_id AND h.source = 'human');
      CREATE UNIQUE INDEX idx_bie ON bill_info_eff(bill_id);
    `,
      log,
    );

    const agg = (keyExpr: string, table: string, keyName: string) =>
      aggSql({
        table,
        from: "member_vote mv JOIN vote_tag_eff t ON t.sv = mv.session_vote_id",
        keys: [{ expr: keyExpr, name: keyName }],
        minE,
        minP,
      });

    step(db, "member_iv", agg("mv.member_id", "member_iv", "member_id"), log);
    step(db, "party_iv", agg("mv.party_at_time", "party_iv", "party"), log);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  deriveBusca(db, log);
  deriveValidacao(db, log);
}

/** Parâmetros do mapa por casa. O Senado tem poucas votações nominais, então o mínimo por senador é menor. */
const OPCOES_MAPA: Record<"C" | "S", OpcoesMapa> = {
  C: { minVotantes: 20, minMinoria: 0.025, minVotosMembro: 100 },
  S: { minVotantes: 20, minMinoria: 0.025, minVotosMembro: 40 },
};

/**
 * Mapa de votos (veja src/lib/mapa.ts): duas dimensões calculadas só pelos votos, uma por casa. O sinal é fixado
 * para que o PL fique do lado positivo da primeira dimensão e o PT do negativo (convenção, não juízo de valor).
 */
export function deriveMapa(db: DatabaseSync, log?: Log) {
  const t = Date.now();
  db.exec(`
    DROP TABLE IF EXISTS member_mapa;
    DROP TABLE IF EXISTS mapa_meta;
    CREATE TABLE member_mapa (member_id TEXT PRIMARY KEY, chamber TEXT NOT NULL, d1 REAL NOT NULL, d2 REAL NOT NULL, n_votes INTEGER NOT NULL);
    CREATE TABLE mapa_meta (chamber TEXT PRIMARY KEY, var1 REAL NOT NULL, var2 REAL NOT NULL, votacoes INTEGER NOT NULL, membros INTEGER NOT NULL);
  `);
  const ins = db.prepare("INSERT INTO member_mapa VALUES (?, ?, ?, ?, ?)");
  const insMeta = db.prepare("INSERT INTO mapa_meta VALUES (?, ?, ?, ?, ?)");
  for (const ch of ["C", "S"] as const) {
    const rows = db
      .prepare("SELECT session_vote_id AS v, member_id AS m, vote FROM member_vote WHERE vote IN ('SIM', 'NAO') AND member_id LIKE ?")
      .all(`${ch}:%`) as { v: string; m: string; vote: string }[];
    const entradas: Entrada[] = rows.map((r) => ({ membro: r.m, votacao: r.v, valor: r.vote === "SIM" ? 1 : -1 }));
    let res = calcularMapa(entradas, OPCOES_MAPA[ch]);
    if (!res.pontos.length) continue;
    const grupo = (party: string) =>
      new Set((db.prepare("SELECT id FROM member WHERE chamber = ? AND party = ?").all(ch, party) as { id: string }[]).map((r) => r.id));
    res = orientar(res, grupo("PL"), grupo("PT"));
    db.exec("BEGIN");
    for (const p of res.pontos) ins.run(p.id, ch, p.d1, p.d2, p.n);
    insMeta.run(ch, res.var1, res.var2, res.votacoesUsadas, res.pontos.length);
    db.exec("COMMIT");
  }
  log?.("mapa", (Date.now() - t) / 1000);
}

/**
 * Teste independente do perfil de votação: correlação de Spearman entre as notas do perfil e as dimensões do mapa
 * (que não usam nenhuma marcação), mais a correlação com o alinhamento ao Governo. Guardado em `validacao`.
 */
export function deriveValidacao(db: DatabaseSync, log?: Log) {
  const existe = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'member_mapa'").get();
  if (!existe) return;
  const t = Date.now();
  db.exec(`
    DROP TABLE IF EXISTS validacao;
    CREATE TABLE validacao (nome TEXT PRIMARY KEY, valor REAL, n INTEGER NOT NULL);
  `);
  const ins = db.prepare("INSERT INTO validacao VALUES (?, ?, ?)");
  type Linha = { d1: number; d2: number; v: number };
  const corr = (nome: string, linhas: Linha[]) => {
    for (const k of ["d1", "d2"] as const) {
      const r = spearman(linhas.map((l) => l[k]), linhas.map((l) => l.v));
      ins.run(`${nome}_${k}`, r, linhas.length);
    }
  };
  for (const ch of ["C", "S"] as const) {
    const meta = db.prepare("SELECT var1, var2, votacoes, membros FROM mapa_meta WHERE chamber = ?").get(ch) as
      | { var1: number; var2: number; votacoes: number; membros: number }
      | undefined;
    if (!meta) continue;
    ins.run(`${ch}_var_d1`, meta.var1, meta.membros);
    ins.run(`${ch}_var_d2`, meta.var2, meta.membros);
    ins.run(`${ch}_votacoes`, meta.votacoes, meta.membros);
    const q = (col: string) =>
      db
        .prepare(`SELECT mm.d1, mm.d2, i.${col} AS v FROM member_mapa mm JOIN member_iv i ON i.member_id = mm.member_id WHERE mm.chamber = ? AND i.${col} IS NOT NULL`)
        .all(ch) as Linha[];
    corr(`${ch}_estado`, q("left_pct"));
    corr(`${ch}_privilegio`, q("privilege_pct"));
    if (ch === "C") {
      const gov = db
        .prepare(
          `SELECT mm.d1, mm.d2, g.same * 1.0 / g.shared AS v FROM member_mapa mm JOIN member_governo g ON g.member_id = mm.member_id
            WHERE mm.chamber = 'C' AND g.shared >= 30`,
        )
        .all() as Linha[];
      corr("C_governo", gov);
    }
  }
  log?.("validacao", (Date.now() - t) / 1000);
}

/**
 * Índices de busca (SQLite FTS5, sem acento e sem diferença de maiúsculas): projetos com votação nominal
 * (identificação, ementa, resumo, palavras-chave) e parlamentares (nome, partido, UF).
 */
export function deriveBusca(db: DatabaseSync, log?: Log) {
  step(
    db,
    "busca",
    `
    DROP TABLE IF EXISTS bill_fts;
    CREATE VIRTUAL TABLE bill_fts USING fts5(
      bill_id UNINDEXED, label, ementa, summary, keywords, tokenize = 'unicode61 remove_diacritics 2'
    );
    INSERT INTO bill_fts (bill_id, label, ementa, summary, keywords)
      SELECT b.id, b.label, COALESCE(b.ementa, ''), COALESCE(i.summary, ''), COALESCE(b.keywords, '')
        FROM bill b LEFT JOIN bill_info_eff i ON i.bill_id = b.id
       WHERE EXISTS (SELECT 1 FROM session_vote sv WHERE sv.bill_id = b.id AND sv.is_nominal = 1);

    DROP TABLE IF EXISTS member_fts;
    CREATE VIRTUAL TABLE member_fts USING fts5(
      member_id UNINDEXED, name, party, uf, tokenize = 'unicode61 remove_diacritics 2'
    );
    INSERT INTO member_fts (member_id, name, party, uf)
      SELECT id, name, COALESCE(party, ''), COALESCE(uf, '') FROM member;

    -- Mesmo índice incluindo ex-parlamentares (só usado quando "legislatura vigente" está desmarcada). É separado
    -- para que a busca padrão mantenha exatamente a mesma classificação de relevância.
    DROP TABLE IF EXISTS member_fts_all;
    CREATE VIRTUAL TABLE member_fts_all USING fts5(
      member_id UNINDEXED, name, party, uf, tokenize = 'unicode61 remove_diacritics 2'
    );
    INSERT INTO member_fts_all (member_id, name, party, uf)
      SELECT id, name, COALESCE(party, ''), COALESCE(uf, '') FROM member_all;
  `,
    log,
  );
}

/**
 * Natureza de cada mandato (pessoa × legislatura em que votou), a partir dos eventos oficiais importados por
 * `npm run history:mandatos` e de quem está em exercício hoje. Sem os eventos, o mandato fica "situação não registrada".
 */
export function deriveMandatos(db: DatabaseSync, log?: Log) {
  const t0 = Date.now();
  const votou = db.prepare("SELECT DISTINCT member_id, legislatura FROM member_vote_all WHERE legislatura IS NOT NULL").all() as {
    member_id: string;
    legislatura: number;
  }[];
  const em = new Map((db.prepare("SELECT id, em_exercicio e FROM member_all").all() as { id: string; e: number }[]).map((r) => [r.id, r.e === 1]));

  type Ev = { legislatura: number | null; data: string | null; situacao: string | null; condicao: string | null; descricao: string | null };
  const evPorMembro = new Map<string, Ev[]>();
  for (const e of db.prepare("SELECT member_id, legislatura, data, situacao, condicao, descricao FROM mandato_evento ORDER BY member_id, seq").all() as (Ev & { member_id: string })[]) {
    const l = evPorMembro.get(e.member_id);
    if (l) l.push(e);
    else evPorMembro.set(e.member_id, [e]);
  }
  type Ms = { member_id: string; participacao: string | null; mandato_inicio: string | null; mandato_fim: string | null; ex_inicio: string | null; ex_fim: string | null; causa: string | null; descricao: string | null; codigo_mandato: string };
  const msPorMembro = new Map<string, Ms[]>();
  for (const r of db.prepare("SELECT * FROM mandato_senado").all() as Ms[]) {
    const l = msPorMembro.get(r.member_id);
    if (l) l.push(r);
    else msPorMembro.set(r.member_id, [r]);
  }

  // Estatísticas de cada mandato: votos, período e partido em que mais votou.
  type Est = { votos: number; primeira: string; ultima: string; porPartido: Map<string, number> };
  const est = new Map<string, Est>();
  for (const r of db
    .prepare(
      `SELECT v.member_id, v.legislatura, v.party_at_time p, COUNT(*) n, MIN(s.date) a, MAX(s.date) b
         FROM member_vote_all v JOIN session_vote_all s ON s.id = v.session_vote_id
        WHERE v.legislatura IS NOT NULL GROUP BY v.member_id, v.legislatura, v.party_at_time`,
    )
    .all() as { member_id: string; legislatura: number; p: string | null; n: number; a: string; b: string }[]) {
    const k = `${r.member_id}|${r.legislatura}`;
    const e = est.get(k) ?? { votos: 0, primeira: r.a, ultima: r.b, porPartido: new Map<string, number>() };
    e.votos += r.n;
    if (r.a < e.primeira) e.primeira = r.a;
    if (r.b > e.ultima) e.ultima = r.b;
    if (r.p) e.porPartido.set(r.p, (e.porPartido.get(r.p) ?? 0) + r.n);
    est.set(k, e);
  }
  const contaVotacoes = db.prepare("SELECT COUNT(*) c FROM session_vote_all WHERE is_nominal = 1 AND chamber = ? AND date BETWEEN ? AND ?");
  const ins = db.prepare(
    `INSERT OR REPLACE INTO mandato (member_id, legislatura, condicao, natureza, motivo, inicio, fim, licencas, partido, partido_sigla, votos, primeira, ultima, total_votacoes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM mandato");
    for (const { member_id: id, legislatura: leg } of votou) {
      const emEx = em.get(id) === true;
      let m;
      if (id.startsWith("C:")) {
        m = classificarMandatoCamara((evPorMembro.get(id) ?? []).filter((e) => e.legislatura === leg), { legislatura: leg, emExercicio: emEx });
      } else {
        const { inicio, fim } = periodoDaLegislatura(leg);
        const rows = (msPorMembro.get(id) ?? []).filter((r) => (r.mandato_inicio ?? "0") <= fim && (r.mandato_fim ?? "9") >= inicio);
        const principal = rows[0];
        const exs: ExercicioSenado[] = rows.map((r) => ({ inicio: r.ex_inicio, fim: r.ex_fim, causa: r.causa, descricao: r.descricao }));
        m = classificarMandatoSenado(exs, { legislatura: leg, emExercicio: emEx, participacao: principal?.participacao ?? null, mandatoAte: principal?.mandato_fim ?? null });
      }
      const e = est.get(`${id}|${leg}`);
      const sigla = e ? [...e.porPartido].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;
      const total = e ? (contaVotacoes.get(id[0], e.primeira, e.ultima) as { c: number }).c : null;
      ins.run(id, leg, m.condicao, m.natureza, m.motivo, m.inicio, m.fim, JSON.stringify(m.licencas), partidoCanonico(sigla) ?? sigla, sigla, e?.votos ?? 0, e?.primeira ?? null, e?.ultima ?? null, total);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  log?.("mandatos", (Date.now() - t0) / 1000);
}

/**
 * Histórico por legislatura (todas as legislaturas importadas, inclusive a atual, o que permite conferir contra as
 * tabelas do site). Partidos entram pela linhagem (PMDB e MDB são o mesmo partido), por isso a posição de um partido numa
 * votação junta as siglas da mesma linhagem.
 *   party_alias, party_position_all, member_party_agreement_leg, member_loyalty_leg, member_iv_leg, party_iv_leg, party_leg
 * Depende de vote_tag_eff (rode deriveIv antes).
 */
export function deriveHistorico(db: DatabaseSync, log?: Log, opts: { minEconomic?: number; minPrivilege?: number; perfilApenas?: boolean } = {}) {
  const minE = opts.minEconomic ?? MIN_ECONOMIC_VOTES;
  const minP = opts.minPrivilege ?? MIN_PRIVILEGE_VOTES;
  db.exec("BEGIN");
  try {
    // Linhagem de cada sigla (e as siglas que não são partido).
    db.exec("DROP TABLE IF EXISTS party_alias; CREATE TABLE party_alias (sigla TEXT PRIMARY KEY, canonica TEXT, sem_partido INTEGER NOT NULL) WITHOUT ROWID;");
    const insAlias = db.prepare("INSERT OR REPLACE INTO party_alias (sigla, canonica, sem_partido) VALUES (?, ?, ?)");
    for (const l of LINHAGENS) for (const sg of l.siglas) insAlias.run(sg, l.canonica, 0);
    for (const sg of SEM_PARTIDO) insAlias.run(sg, null, 1);
    const usadas = (db.prepare("SELECT DISTINCT party_at_time p FROM member_vote_all WHERE party_at_time IS NOT NULL").all() as { p: string }[]).map((r) => r.p);
    const desconhecidas = siglasDesconhecidas(usadas);
    if (desconhecidas.length) console.warn(`Aviso: siglas de partido sem linhagem (entram com o próprio nome): ${desconhecidas.join(", ")}`);
    // Nome do partido numa linha de voto: a linhagem, ou a própria sigla se for desconhecida.
    const P = "COALESCE(a.canonica, mv.party_at_time)";
    const J = "LEFT JOIN party_alias a ON a.sigla = mv.party_at_time";
    const PARTIDO_OK = "mv.party_at_time IS NOT NULL AND COALESCE(a.sem_partido, 0) = 0";

    step(
      db,
      "party_position_all",
      `
      DROP TABLE IF EXISTS party_position_all;
      CREATE TABLE party_position_all (
        sv TEXT NOT NULL, party TEXT NOT NULL, yes INTEGER NOT NULL, no INTEGER NOT NULL, pos TEXT NOT NULL, cohesion REAL NOT NULL,
        PRIMARY KEY (sv, party)
      ) WITHOUT ROWID;
      INSERT INTO party_position_all
        SELECT mv.session_vote_id, ${P}, SUM(mv.vote = 'SIM'), SUM(mv.vote = 'NAO'),
               CASE WHEN SUM(mv.vote = 'SIM') > SUM(mv.vote = 'NAO') THEN 'SIM' ELSE 'NAO' END,
               MAX(SUM(mv.vote = 'SIM'), SUM(mv.vote = 'NAO')) * 1.0 / (SUM(mv.vote = 'SIM') + SUM(mv.vote = 'NAO'))
          FROM member_vote_all mv ${J}
         WHERE mv.vote IN ('SIM', 'NAO') AND ${PARTIDO_OK}
         GROUP BY mv.session_vote_id, ${P}
        HAVING SUM(mv.vote = 'SIM') + SUM(mv.vote = 'NAO') >= 2 AND SUM(mv.vote = 'SIM') <> SUM(mv.vote = 'NAO');
    `,
      log,
    );

    // Pessoa × partido por legislatura, com a mesma regra do site (a posição do próprio partido não conta o próprio voto).
    const joined = `
      SELECT mv.member_id AS member_id, mv.legislatura AS legislatura, pp.party AS party, mv.vote AS vote,
             CASE WHEN ${P} = pp.party THEN pp.yes - (mv.vote = 'SIM') ELSE pp.yes END AS y,
             CASE WHEN ${P} = pp.party THEN pp.no  - (mv.vote = 'NAO') ELSE pp.no  END AS n,
             (${P} = pp.party) AS own
        FROM member_vote_all mv ${J} JOIN party_position_all pp ON pp.sv = mv.session_vote_id
       WHERE mv.vote IN ('SIM', 'NAO')`;
    if (!opts.perfilApenas)
    step(
      db,
      "member_party_agreement_leg",
      `
      DROP TABLE IF EXISTS member_party_agreement_leg;
      CREATE TABLE member_party_agreement_leg (
        member_id TEXT NOT NULL, legislatura INTEGER NOT NULL, party TEXT NOT NULL, shared INTEGER NOT NULL, same INTEGER NOT NULL,
        PRIMARY KEY (member_id, legislatura, party)
      ) WITHOUT ROWID;
      INSERT INTO member_party_agreement_leg
        SELECT member_id, legislatura, party, COUNT(*), SUM(vote = CASE WHEN y > n THEN 'SIM' ELSE 'NAO' END)
          FROM (${joined}) WHERE y <> n AND y + n >= 2
         GROUP BY member_id, legislatura, party;
    `,
      log,
    );
    if (!opts.perfilApenas)
    step(
      db,
      "member_loyalty_leg",
      `
      DROP TABLE IF EXISTS member_loyalty_leg;
      CREATE TABLE member_loyalty_leg AS
        SELECT member_id, legislatura, COUNT(*) AS shared, SUM(vote = CASE WHEN y > n THEN 'SIM' ELSE 'NAO' END) AS same
          FROM (${joined}) WHERE own = 1 AND y <> n AND y + n >= 2
         GROUP BY member_id, legislatura;
      CREATE UNIQUE INDEX idx_mll ON member_loyalty_leg(member_id, legislatura);
    `,
      log,
    );

    const from = `member_vote_all mv ${J} JOIN vote_tag_eff t ON t.sv = mv.session_vote_id`;
    step(
      db,
      "member_iv_leg",
      aggSql({
        table: "member_iv_leg",
        from: "member_vote_all mv JOIN vote_tag_eff t ON t.sv = mv.session_vote_id",
        keys: [{ expr: "mv.member_id", name: "member_id" }, { expr: "mv.legislatura", name: "legislatura" }],
        minE,
        minP,
      }),
      log,
    );
    step(
      db,
      "party_iv_leg",
      aggSql({
        table: "party_iv_leg",
        from,
        keys: [{ expr: "substr(mv.member_id, 1, 1)", name: "chamber" }, { expr: "mv.legislatura", name: "legislatura" }, { expr: P, name: "party" }],
        minE,
        minP,
        where: PARTIDO_OK,
      }),
      log,
    );

    // Alinhamento com a orientação do Governo por legislatura (só a Câmara registra). Mesma regra de member_governo:
    // só orientações claras (Sim/Não) e votos Sim/Não do parlamentar.
    step(
      db,
      "member_governo_leg",
      `
      DROP TABLE IF EXISTS member_governo_leg;
      CREATE TABLE member_governo_leg AS
        SELECT mv.member_id AS member_id, mv.legislatura AS legislatura, COUNT(*) AS shared,
               SUM(mv.vote = CASE g.orientation WHEN 'Sim' THEN 'SIM' ELSE 'NAO' END) AS same
          FROM member_vote_all mv
          JOIN orientation g ON g.session_vote_id = mv.session_vote_id AND g.key = 'Governo' AND g.kind = 'bloc' AND g.orientation IN ('Sim', 'Não')
         WHERE mv.vote IN ('SIM', 'NAO')
         GROUP BY mv.member_id, mv.legislatura;
      CREATE UNIQUE INDEX idx_mgl ON member_governo_leg(member_id, legislatura);
    `,
      log,
    );

    // Votações em que a posição do partido (maioria dos votantes) empurrou para cada lado, por partido e legislatura.
    step(
      db,
      "party_leg",
      `
      DROP TABLE IF EXISTS party_leg;
      CREATE TABLE party_leg AS
      WITH x AS (
        SELECT substr(pp.sv, 1, 1) AS chamber, sv.legislatura AS legislatura, pp.party AS party, pp.sv AS sv,
               CASE pp.pos WHEN 'SIM' THEN 1.0 ELSE -1.0 END AS d, t.economic AS e, t.privilege AS p, t.procedural AS proc
          FROM party_position_all pp
          JOIN session_vote_all sv ON sv.id = pp.sv
          LEFT JOIN vote_tag_eff t ON t.sv = pp.sv
      )
      SELECT chamber, legislatura, party,
        COUNT(*) AS n_votacoes,
        SUM(COALESCE(proc, 0) = 0 AND ABS(COALESCE(e, 0)) >= ${ECONOMIC_MIN_MAGNITUDE} AND d * e < 0) AS n_estado,
        SUM(COALESCE(proc, 0) = 0 AND ABS(COALESCE(e, 0)) >= ${ECONOMIC_MIN_MAGNITUDE} AND d * e > 0) AS n_mercado,
        SUM(COALESCE(proc, 0) = 0 AND ABS(COALESCE(p, 0)) >= ${PRIVILEGE_MIN_MAGNITUDE} AND d * p > 0) AS n_priv_mais,
        SUM(COALESCE(proc, 0) = 0 AND ABS(COALESCE(p, 0)) >= ${PRIVILEGE_MIN_MAGNITUDE} AND d * p < 0) AS n_priv_menos
      FROM x GROUP BY chamber, legislatura, party;
      CREATE UNIQUE INDEX idx_party_leg ON party_leg(chamber, legislatura, party);
    `,
      log,
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Mínimo de votos por pessoa no mapa de uma legislatura. Nas legislaturas antigas há menos votações nominais, então o
 * mínimo da legislatura atual (100 na Câmara, 40 no Senado) seria impossível de atingir: usamos o menor entre esse valor
 * e 20% das votações da legislatura. Para a 57ª isso dá exatamente o valor de hoje.
 */
export function opcoesMapaLegislatura(ch: "C" | "S", votacoes: number): OpcoesMapa {
  const base = OPCOES_MAPA[ch];
  return { ...base, minVotosMembro: Math.max(10, Math.min(base.minVotosMembro, Math.floor(votacoes * 0.2))) };
}

/**
 * Mapa de votos por legislatura (mesma matemática do mapa atual, sem nenhuma marcação) e teste independente do perfil:
 * correlação de Spearman entre as notas do perfil e as dimensões do mapa. Depende de member_iv_leg, party_iv_leg,
 * member_governo_leg e mandato (para fixar o sinal pelo PL e pelo PT da época).
 *   member_mapa_leg, mapa_meta_leg, validacao_leg
 */
export function deriveMapaLegislatura(db: DatabaseSync, log?: Log) {
  const t = Date.now();
  db.exec(`
    DROP TABLE IF EXISTS member_mapa_leg;
    DROP TABLE IF EXISTS mapa_meta_leg;
    DROP TABLE IF EXISTS validacao_leg;
    CREATE TABLE member_mapa_leg (chamber TEXT NOT NULL, legislatura INTEGER NOT NULL, member_id TEXT NOT NULL, d1 REAL NOT NULL, d2 REAL NOT NULL, n_votes INTEGER NOT NULL, PRIMARY KEY (legislatura, member_id));
    CREATE TABLE mapa_meta_leg (chamber TEXT NOT NULL, legislatura INTEGER NOT NULL, var1 REAL NOT NULL, var2 REAL NOT NULL, votacoes INTEGER NOT NULL, membros INTEGER NOT NULL, PRIMARY KEY (chamber, legislatura));
    CREATE TABLE validacao_leg (chamber TEXT NOT NULL, legislatura INTEGER NOT NULL, nome TEXT NOT NULL, valor REAL, n INTEGER NOT NULL, PRIMARY KEY (chamber, legislatura, nome));
  `);
  const insP = db.prepare("INSERT INTO member_mapa_leg VALUES (?, ?, ?, ?, ?, ?)");
  const insM = db.prepare("INSERT INTO mapa_meta_leg VALUES (?, ?, ?, ?, ?, ?)");
  const insV = db.prepare("INSERT INTO validacao_leg VALUES (?, ?, ?, ?, ?)");
  const legs = (db.prepare("SELECT DISTINCT legislatura l FROM session_vote_all WHERE legislatura IS NOT NULL ORDER BY 1").all() as { l: number }[]).map((r) => r.l);
  type Linha = { d1: number; d2: number; v: number };
  db.exec("BEGIN");
  try {
    for (const leg of legs) {
      for (const ch of ["C", "S"] as const) {
        const rows = db
          .prepare("SELECT session_vote_id AS v, member_id AS m, vote FROM member_vote_all WHERE legislatura = ? AND vote IN ('SIM', 'NAO') AND member_id LIKE ?")
          .all(leg, `${ch}:%`) as { v: string; m: string; vote: string }[];
        if (!rows.length) continue;
        const nVot = new Set(rows.map((r) => r.v)).size;
        let res = calcularMapa(rows.map((r) => ({ membro: r.m, votacao: r.v, valor: r.vote === "SIM" ? (1 as const) : (-1 as const) })), opcoesMapaLegislatura(ch, nVot));
        if (!res.pontos.length) continue;
        const grupo = (p: string) =>
          new Set((db.prepare("SELECT member_id id FROM mandato WHERE legislatura = ? AND partido = ? AND member_id LIKE ?").all(leg, p, `${ch}:%`) as { id: string }[]).map((r) => r.id));
        res = orientar(res, grupo("PL"), grupo("PT"));
        for (const p of res.pontos) insP.run(ch, leg, p.id, p.d1, p.d2, p.n);
        insM.run(ch, leg, res.var1, res.var2, res.votacoesUsadas, res.pontos.length);

        const corr = (nome: string, linhas: Linha[]) => {
          for (const k of ["d1", "d2"] as const) insV.run(ch, leg, `${nome}_${k}`, spearman(linhas.map((l) => l[k]), linhas.map((l) => l.v)), linhas.length);
        };
        const q = (col: string) =>
          db
            .prepare(`SELECT mm.d1, mm.d2, i.${col} AS v FROM member_mapa_leg mm JOIN member_iv_leg i ON i.member_id = mm.member_id AND i.legislatura = mm.legislatura
                       WHERE mm.legislatura = ? AND mm.chamber = ? AND i.${col} IS NOT NULL`)
            .all(leg, ch) as Linha[];
        corr("estado", q("left_pct"));
        corr("privilegio", q("privilege_pct"));
        // por partido (linhagem, com pelo menos 5 pessoas no mapa): média da posição no mapa × nota do partido
        const partidos = db
          .prepare(
            `SELECT m.partido AS p, AVG(mm.d1) AS d1, AVG(mm.d2) AS d2, pi.left_pct AS v
               FROM member_mapa_leg mm JOIN mandato m ON m.member_id = mm.member_id AND m.legislatura = mm.legislatura
               JOIN party_iv_leg pi ON pi.chamber = mm.chamber AND pi.legislatura = mm.legislatura AND pi.party = m.partido
              WHERE mm.legislatura = ? AND mm.chamber = ? AND pi.left_pct IS NOT NULL AND m.partido IS NOT NULL
              GROUP BY m.partido HAVING COUNT(*) >= 5`,
          )
          .all(leg, ch) as (Linha & { p: string })[];
        corr("partidos_estado", partidos);
        if (ch === "C") {
          const gov = db
            .prepare(
              `SELECT mm.d1, mm.d2, g.same * 1.0 / g.shared AS v FROM member_mapa_leg mm JOIN member_governo_leg g ON g.member_id = mm.member_id AND g.legislatura = mm.legislatura
                WHERE mm.legislatura = ? AND mm.chamber = 'C' AND g.shared >= 30`,
            )
            .all(leg) as Linha[];
          corr("governo", gov);
        }
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  log?.("mapa_leg", (Date.now() - t) / 1000);
}
