import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { LEG_ATUAL, sqlLegislatura } from "./legislaturas";

// The database lives outside the bundle: tell Turbopack's file tracing not to treat data/ (which also
// holds the raw API cache) as an input of every route that imports this module.
const DATA_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
export const DB_PATH = process.env.CONGRESSO_DB ?? path.join(DATA_DIR, "congresso.db");

export const SCHEMA = `
-- ATENÇÃO: as tabelas físicas com sufixo _all guardam TODAS as legislaturas. Os nomes member, session_vote e
-- member_vote são VISÕES da legislatura atual (veja viewsSql): o site e as tabelas derivadas só enxergam a atual,
-- e o histórico (src/lib/derive.ts, deriveHistorico) lê as tabelas _all.
CREATE TABLE IF NOT EXISTS member_all (
  id        TEXT PRIMARY KEY,           -- 'C:178992' (Câmara) or 'S:22' (Senado)
  chamber   TEXT NOT NULL,              -- 'C' | 'S'
  name      TEXT NOT NULL,
  party     TEXT,                       -- partido do voto mais recente
  uf        TEXT,
  photo_url TEXT,
  atual       INTEGER NOT NULL DEFAULT 0, -- 1 = votou na legislatura atual (inclui quem já saiu do cargo)
  em_exercicio INTEGER NOT NULL DEFAULT 0, -- 1 = está no cargo hoje (listas oficiais; scripts/sync-exercicio.ts)
  ultimo_voto TEXT                        -- data do voto mais recente (decide qual partido/UF vale)
);

CREATE TABLE IF NOT EXISTS bill (
  id        TEXT PRIMARY KEY,           -- 'C:2655570' or 'S:176328'
  chamber   TEXT NOT NULL,
  label     TEXT NOT NULL,              -- 'PLP 299/2026'
  ementa    TEXT
);

CREATE TABLE IF NOT EXISTS session_vote_all (
  id          TEXT PRIMARY KEY,         -- 'C:2655570-57' or 'S:7117'
  chamber     TEXT NOT NULL,
  date        TEXT NOT NULL,            -- YYYY-MM-DD
  bill_id     TEXT REFERENCES bill(id),
  description TEXT,
  result      TEXT,                     -- 'approved' | 'rejected' | NULL (unknown)
  is_nominal  INTEGER NOT NULL DEFAULT 0,
  legislatura INTEGER                   -- derivada da data (src/lib/legislaturas.ts)
);
CREATE INDEX IF NOT EXISTS idx_sv_date ON session_vote_all(date);
CREATE INDEX IF NOT EXISTS idx_sv_bill ON session_vote_all(bill_id);

CREATE TABLE IF NOT EXISTS member_vote_all (
  session_vote_id TEXT NOT NULL REFERENCES session_vote_all(id),
  member_id       TEXT NOT NULL REFERENCES member_all(id),
  party_at_time   TEXT,
  vote            TEXT NOT NULL,        -- 'SIM' | 'NAO' | 'ABS' | 'OBS' | 'OUTRO'
  legislatura     INTEGER,              -- cópia da legislatura da votação (evita um JOIN em toda consulta)
  PRIMARY KEY (session_vote_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_mv_member ON member_vote_all(member_id);
CREATE INDEX IF NOT EXISTS idx_mv_party ON member_vote_all(party_at_time);

CREATE TABLE IF NOT EXISTS orientation (
  session_vote_id TEXT NOT NULL REFERENCES session_vote_all(id),
  key             TEXT NOT NULL,        -- party acronym or bloc name
  kind            TEXT NOT NULL,        -- 'party' | 'bloc'
  orientation     TEXT NOT NULL,
  PRIMARY KEY (session_vote_id, key)
);

-- Tags describe the EFFECT OF A "SIM" VOTE (a Yes on a destaque can mean "suppress"), per votação.
--   economic:  -1 (Yes pushes toward state / left) ... +1 (Yes pushes toward market / right), 0 = n/a
--   privilege: -1 (Yes curbs politicians' privileges) ... +1 (Yes expands/protects them)
-- source 'human' overrides 'llm'. See docs/rubric.md.
CREATE TABLE IF NOT EXISTS vote_tag (
  sv         TEXT NOT NULL REFERENCES session_vote_all(id),
  source     TEXT NOT NULL,             -- 'llm' | 'human'
  economic   REAL NOT NULL DEFAULT 0,
  privilege  REAL NOT NULL DEFAULT 0,
  procedural INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.5,
  rationale  TEXT,
  rubric_ver TEXT,
  PRIMARY KEY (sv, source)
);

CREATE TABLE IF NOT EXISTS bill_info (
  bill_id TEXT NOT NULL REFERENCES bill(id),
  source  TEXT NOT NULL,                -- 'llm' | 'human'
  topic   TEXT NOT NULL,
  summary TEXT NOT NULL,                -- one plain-language sentence
  PRIMARY KEY (bill_id, source)
);

-- Segunda marcação, feita às cegas (sem ver a primeira), só para medir a consistência. Não alimenta as barras.
CREATE TABLE IF NOT EXISTS vote_tag_blind (
  sv         TEXT PRIMARY KEY REFERENCES session_vote_all(id),
  economic   REAL NOT NULL DEFAULT 0,
  privilege  REAL NOT NULL DEFAULT 0,
  procedural INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.5,
  rationale  TEXT
);

-- Votos em que a marcação atual e a às cegas discordam; alimenta a fila de revisão /revisar?tipo=divergencias.
CREATE TABLE IF NOT EXISTS tag_divergence (
  sv      TEXT PRIMARY KEY REFERENCES session_vote_all(id),
  kind    TEXT NOT NULL,                -- 'sinal-oposto' | 'um-neutro'
  eixo    TEXT NOT NULL,                -- 'economico' | 'privilegio'
  e_a REAL, e_b REAL, p_a REAL, p_b REAL, c_a REAL, c_b REAL,
  why_a TEXT, why_b TEXT,
  impacto REAL NOT NULL                 -- maior diferença absoluta entre as duas marcações
);

-- Resultados da comparação entre marcações (não é recriada pelo derive).
CREATE TABLE IF NOT EXISTS consistencia (
  nome  TEXT PRIMARY KEY,
  valor REAL,
  n     INTEGER NOT NULL
);

-- Eventos do mandato de cada parlamentar, como a fonte oficial os registra (posse, licença, saída e o motivo).
-- A natureza do mandato (em exercício, cumprido, cassado …) é calculada deles por src/lib/mandato.ts.
CREATE TABLE IF NOT EXISTS mandato_evento (
  member_id   TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  legislatura INTEGER,
  data        TEXT,                       -- AAAA-MM-DD
  situacao    TEXT,                       -- Exercício | Licença | SUPLENCIA | CONVOCADO | VACANCIA | FIM_MANDATO …
  condicao    TEXT,                       -- Titular | Suplente
  descricao   TEXT,                       -- texto oficial do motivo
  partido     TEXT,
  uf          TEXT,
  PRIMARY KEY (member_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_me_member ON mandato_evento(member_id);

-- Senado: um mandato dura 8 anos (duas legislaturas) e tem "exercícios" (períodos no cargo, com a causa do afastamento).
CREATE TABLE IF NOT EXISTS mandato_senado (
  member_id      TEXT NOT NULL,
  codigo_mandato TEXT NOT NULL,
  participacao   TEXT,                    -- Titular | 1º Suplente | 2º Suplente
  uf             TEXT,
  mandato_inicio TEXT,
  mandato_fim    TEXT,
  ex_inicio      TEXT,
  ex_fim         TEXT,
  causa          TEXT,                    -- TER, REN, PER, DJ, LSP, LP, LS, AFO, RET …
  descricao      TEXT
);
CREATE INDEX IF NOT EXISTS idx_ms_member ON mandato_senado(member_id);

-- Natureza de cada mandato (pessoa × legislatura), calculada por src/lib/mandato.ts. Não é recriada à mão.
CREATE TABLE IF NOT EXISTS mandato (
  member_id   TEXT NOT NULL,
  legislatura INTEGER NOT NULL,
  condicao    TEXT,
  natureza    TEXT NOT NULL,
  motivo      TEXT,
  inicio      TEXT,
  fim         TEXT,
  licencas    TEXT,                       -- JSON: [{data, motivo}]
  partido     TEXT,                       -- linhagem do partido em que mais votou na legislatura
  partido_sigla TEXT,                     -- sigla usada na época
  votos       INTEGER,                    -- votos nominais (qualquer tipo) na legislatura
  primeira    TEXT,                       -- data do primeiro voto
  ultima      TEXT,                       -- data do último voto
  total_votacoes INTEGER,                 -- votações nominais da casa entre o primeiro e o último voto
  PRIMARY KEY (member_id, legislatura)
);

-- Senado: quem NÃO votou numa votação nominal e o motivo oficial (AP atividade parlamentar, LS licença saúde,
-- MIS missão, NCom não compareceu, P-NRV presente sem registrar voto …). Cada votação tem uma linha por senador.
CREATE TABLE IF NOT EXISTS ausencia_senado (
  session_vote_id TEXT NOT NULL,
  member_id       TEXT NOT NULL,
  codigo          TEXT NOT NULL,
  descricao       TEXT,
  PRIMARY KEY (session_vote_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_as_member ON ausencia_senado(member_id);

-- Câmara: sessões deliberativas do Plenário que aconteceram (têm presença registrada) e quem esteve presente.
CREATE TABLE IF NOT EXISTS sessao_plenario (
  id    INTEGER PRIMARY KEY,
  data  TEXT NOT NULL,                    -- AAAA-MM-DD
  hora  TEXT,
  com_presenca INTEGER NOT NULL DEFAULT 1   -- 0 = sessão realizada, mas a Câmara não publicou a lista de presença
);
CREATE INDEX IF NOT EXISTS idx_sp_data ON sessao_plenario(data);
CREATE TABLE IF NOT EXISTS presenca_sessao (
  member_id TEXT NOT NULL,
  sessao_id INTEGER NOT NULL,
  PRIMARY KEY (member_id, sessao_id)
) WITHOUT ROWID;

-- Câmara: cargos na Mesa Diretora (quem preside as sessões não vota, então isso muda a conta de participação).
CREATE TABLE IF NOT EXISTS mesa_cargo (
  member_id   TEXT NOT NULL,
  legislatura INTEGER NOT NULL,
  cargo       TEXT NOT NULL,              -- Presidente, 1º Vice-Presidente, 1º Secretário …
  inicio      TEXT NOT NULL,
  fim         TEXT                        -- null = ainda no cargo
);
CREATE INDEX IF NOT EXISTS idx_mc_member ON mesa_cargo(member_id);

-- Câmara: comissões e outros órgãos de que o deputado participou (fora a Mesa Diretora, que tem tabela própria).
CREATE TABLE IF NOT EXISTS member_comissao (
  member_id   TEXT NOT NULL,
  legislatura INTEGER NOT NULL,
  sigla       TEXT NOT NULL,
  nome        TEXT,
  cargo       TEXT NOT NULL,
  inicio      TEXT NOT NULL,
  fim         TEXT
);
CREATE INDEX IF NOT EXISTS idx_mcom_member ON member_comissao(member_id, legislatura);

-- Câmara: proposições de que o deputado é autor proponente (não inclui quem só assinou como apoiador).
CREATE TABLE IF NOT EXISTS autoria (
  member_id    TEXT NOT NULL,
  legislatura  INTEGER NOT NULL,
  prop_id      INTEGER NOT NULL,
  tipo         TEXT,
  numero       INTEGER,
  ano          INTEGER,
  ementa       TEXT,
  apresentacao TEXT,
  url          TEXT,
  coautores    INTEGER NOT NULL DEFAULT 0,
  arquivo_ano  INTEGER NOT NULL,           -- ano do arquivo de origem, para reimportar sem duplicar
  situacao       TEXT,                     -- último andamento (descricaoSituacao) no arquivo da Câmara
  situacao_data  TEXT,
  grupo_situacao TEXT,                     -- lei | senado | veto | arquivada | retirada | tramitando | outra
  PRIMARY KEY (member_id, prop_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_aut_leg ON autoria(member_id, legislatura, apresentacao);
CREATE INDEX IF NOT EXISTS idx_aut_aprov ON autoria(legislatura, tipo, member_id, grupo_situacao);

-- Discursos (Câmara e Senado): só data, tipo, resumo e links; a transcrição nunca é guardada.
CREATE TABLE IF NOT EXISTS discurso (
  member_id   TEXT NOT NULL,
  legislatura INTEGER NOT NULL,
  data        TEXT NOT NULL,
  tipo        TEXT NOT NULL,
  fase        TEXT,
  grupo       TEXT NOT NULL,              -- pronunciamento | intervencao | presidencia
  sumario     TEXT,
  url         TEXT,
  video       TEXT
);
CREATE INDEX IF NOT EXISTS idx_disc_mandato ON discurso(member_id, legislatura, data);
-- Quais mandatos já foram importados (distingue "zero discursos" de "ainda não importado").
CREATE TABLE IF NOT EXISTS discurso_mandato (
  member_id   TEXT NOT NULL,
  legislatura INTEGER NOT NULL,
  importado   TEXT NOT NULL,
  PRIMARY KEY (member_id, legislatura)
) WITHOUT ROWID;

-- Valores simples de controle (ex.: data da última atualização).
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Colunas acrescentadas depois da primeira versão do esquema (bancos antigos recebem via ALTER TABLE). */
const EXTRA_COLUMNS: { table: string; column: string; type: string }[] = [
  { table: "bill", column: "keywords", type: "TEXT" },
  { table: "bill", column: "url_inteiro_teor", type: "TEXT" },
  { table: "session_vote_all", column: "legislatura", type: "INTEGER" },
  { table: "member_vote_all", column: "legislatura", type: "INTEGER" },
  { table: "member_all", column: "atual", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "member_all", column: "ultimo_voto", type: "TEXT" },
  { table: "member_all", column: "em_exercicio", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "sessao_plenario", column: "com_presenca", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "autoria", column: "situacao", type: "TEXT" },
  { table: "autoria", column: "situacao_data", type: "TEXT" },
  { table: "autoria", column: "grupo_situacao", type: "TEXT" },
  { table: "mandato", column: "partido", type: "TEXT" },
  { table: "mandato", column: "partido_sigla", type: "TEXT" },
  { table: "mandato", column: "votos", type: "INTEGER" },
  { table: "mandato", column: "primeira", type: "TEXT" },
  { table: "mandato", column: "ultima", type: "TEXT" },
  { table: "mandato", column: "total_votacoes", type: "INTEGER" },
];

function ensureColumns(db: DatabaseSync) {
  for (const { table, column, type } of EXTRA_COLUMNS) {
    const has = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Índices que dependem de colunas novas (criados depois de ensureColumns). */
const INDICES_LEGISLATURA = `
CREATE INDEX IF NOT EXISTS idx_sv_leg ON session_vote_all(legislatura);
CREATE INDEX IF NOT EXISTS idx_mv_leg ON member_vote_all(legislatura);
CREATE INDEX IF NOT EXISTS idx_mv_member_leg ON member_vote_all(member_id, legislatura);
CREATE INDEX IF NOT EXISTS idx_mv_party_leg2 ON member_vote_all(party_at_time, legislatura, vote, member_id);
`;

/**
 * Banco criado antes do histórico: os nomes member, session_vote e member_vote eram tabelas.
 * Renomeia para *_all (o SQLite atualiza as chaves estrangeiras que apontavam para elas).
 */
function migrarTabelasAntigas(db: DatabaseSync) {
  const tipo = (n: string) => (db.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(n) as { type: string } | undefined)?.type;
  const pares: [string, string][] = [
    ["member_vote", "member_vote_all"],
    ["session_vote", "session_vote_all"],
    ["member", "member_all"],
  ];
  if (!pares.some(([antigo]) => tipo(antigo) === "table")) return;
  db.exec("BEGIN");
  try {
    for (const [antigo, novo] of pares) {
      if (tipo(antigo) === "table" && !tipo(novo)) db.exec(`ALTER TABLE ${antigo} RENAME TO ${novo}`);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Preenche legislatura / atual / ultimo_voto onde ainda faltam (idempotente: só trabalha em linhas novas). */
export function preencherLegislaturas(db: DatabaseSync) {
  db.exec(`UPDATE session_vote_all SET legislatura = ${sqlLegislatura("date")} WHERE legislatura IS NULL`);
  db.exec(
    `UPDATE member_vote_all SET legislatura = (SELECT legislatura FROM session_vote_all s WHERE s.id = session_vote_id)
      WHERE legislatura IS NULL`,
  );
  db.exec(
    `UPDATE member_all SET ultimo_voto = (
       SELECT MAX(s.date) FROM member_vote_all v JOIN session_vote_all s ON s.id = v.session_vote_id WHERE v.member_id = member_all.id)
      WHERE ultimo_voto IS NULL`,
  );
  db.exec(
    `UPDATE member_all SET atual = 1
      WHERE atual = 0 AND EXISTS (SELECT 1 FROM member_vote_all v WHERE v.member_id = member_all.id AND v.legislatura = ${LEG_ATUAL})`,
  );
}

/**
 * Visões da legislatura atual, com os nomes que o site sempre usou. Os gatilhos INSTEAD OF INSERT mantêm compatível
 * quem ainda insere por esses nomes (os testes): a linha vai para a tabela _all com a legislatura calculada pela data.
 */
function viewsSql(): string {
  return `
CREATE VIEW member AS
  SELECT id, chamber, name, party, uf, photo_url FROM member_all WHERE em_exercicio = 1;
CREATE VIEW session_vote AS
  SELECT id, chamber, date, bill_id, description, result, is_nominal FROM session_vote_all WHERE legislatura = ${LEG_ATUAL};
CREATE VIEW member_vote AS
  SELECT session_vote_id, member_id, party_at_time, vote FROM member_vote_all WHERE legislatura = ${LEG_ATUAL};
CREATE TRIGGER member_ins INSTEAD OF INSERT ON member BEGIN
  INSERT INTO member_all (id, chamber, name, party, uf, photo_url, atual, em_exercicio)
  VALUES (NEW.id, NEW.chamber, NEW.name, NEW.party, NEW.uf, NEW.photo_url, 1, 1);
END;
CREATE TRIGGER session_vote_ins INSTEAD OF INSERT ON session_vote BEGIN
  INSERT INTO session_vote_all (id, chamber, date, bill_id, description, result, is_nominal, legislatura)
  VALUES (NEW.id, NEW.chamber, NEW.date, NEW.bill_id, NEW.description, NEW.result, NEW.is_nominal, ${sqlLegislatura("NEW.date")});
END;
CREATE TRIGGER member_vote_ins INSTEAD OF INSERT ON member_vote BEGIN
  INSERT INTO member_vote_all (session_vote_id, member_id, party_at_time, vote, legislatura)
  VALUES (NEW.session_vote_id, NEW.member_id, NEW.party_at_time, NEW.vote,
          (SELECT legislatura FROM session_vote_all WHERE id = NEW.session_vote_id));
END;
`;
}

/** (Re)cria as visões se faltarem ou se LEG_ATUAL mudou (por exemplo, ao começar a 58ª legislatura). */
function garantirVisoes(db: DatabaseSync) {
  const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'view' AND name = 'member_vote'").get() as { sql: string } | undefined)?.sql;
  const sqlMember = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'view' AND name = 'member'").get() as { sql: string } | undefined)?.sql;
  if (sql && sql.includes(`legislatura = ${LEG_ATUAL}`) && sqlMember?.includes("em_exercicio = 1")) return;
  db.exec("BEGIN");
  try {
    for (const t of ["member_ins", "session_vote_ins", "member_vote_ins"]) db.exec(`DROP TRIGGER IF EXISTS ${t}`);
    for (const v of ["member", "session_vote", "member_vote"]) db.exec(`DROP VIEW IF EXISTS ${v}`);
    db.exec(viewsSql());
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Esquema completo, migração de bancos antigos e visões. Usado por openDb (escrita) e openMemoryDb. */
function prepararEsquema(db: DatabaseSync) {
  migrarTabelasAntigas(db);
  db.exec(SCHEMA);
  const tinhaExercicio = (db.prepare("PRAGMA table_info(member_all)").all() as { name: string }[]).some((c) => c.name === "em_exercicio");
  ensureColumns(db);
  // Banco anterior à coluna: até a primeira sincronização com as listas oficiais, vale 'votou na legislatura atual'.
  if (!tinhaExercicio) db.exec("UPDATE member_all SET em_exercicio = atual");
  db.exec(INDICES_LEGISLATURA);
  preencherLegislaturas(db);
  garantirVisoes(db);
}

/** Banco em memória com o esquema completo (usado nos testes). */
export function openMemoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  prepararEsquema(db);
  return db;
}

export function openDb(readonly = false): DatabaseSync {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH, { readOnly: readonly });
  if (!readonly) {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    prepararEsquema(db);
  }
  return db;
}

export type VoteCode = "SIM" | "NAO" | "ABS" | "OBS" | "OUTRO";

export function normalizeVote(raw: string | null | undefined): VoteCode {
  const v = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (v === "sim") return "SIM";
  if (v === "nao") return "NAO";
  if (v.startsWith("absten")) return "ABS";
  if (v.startsWith("obstru")) return "OBS";
  return "OUTRO";
}
