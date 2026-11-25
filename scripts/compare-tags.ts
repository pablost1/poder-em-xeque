/**
 * Compara a marcação atual com a marcação às cegas e guarda os resultados.
 *   npm run tags:compare
 *
 * Grava em `consistencia` (métricas, mostradas na metodologia) e em `tag_divergence` (votos em que as duas
 * discordam de verdade, para a fila /revisar?tipo=divergencias). Não altera nenhuma marcação.
 */
import { openDb } from "../src/lib/db";
import { MIN_ECONOMIC_VOTES, MIN_PRIVILEGE_VOTES } from "../src/lib/derive";
import {
  compararMarcacoes,
  correlacaoDeNotas,
  pontuarMembros,
  type Marca,
  type VotoMembro,
} from "../src/lib/consistencia";

const db = openDb();
const q = <T>(sql: string, ...p: (string | number)[]) => db.prepare(sql).all(...p) as T[];

type Linha = { sv: string; e: number; p: number; proc: number; c: number; why: string | null };
const blind = q<Linha>(`SELECT sv, economic AS e, privilege AS p, procedural AS proc, confidence AS c, rationale AS why FROM vote_tag_blind`);
if (!blind.length) {
  console.error("Nenhuma marcação às cegas carregada. Rode: npm run tags:import:blind");
  process.exit(1);
}
const ids = new Set(blind.map((b) => b.sv));
const atual = q<Linha>(`SELECT sv, economic AS e, privilege AS p, procedural AS proc, confidence AS c, rationale AS why FROM vote_tag_eff`).filter((a) => ids.has(a.sv));
const r1 = q<Linha>(`SELECT sv, economic AS e, privilege AS p, procedural AS proc, confidence AS c, rationale AS why FROM vote_tag_r1`).filter((a) => ids.has(a.sv));

const marca = (l: Linha): Marca => ({ sv: l.sv, e: l.e, p: l.p, proc: !!l.proc, c: l.c });
const B = blind.map(marca);

// --keep-metrics: só refaz a lista de divergências e preserva as métricas já gravadas (medidas ANTES da revisão humana,
// que é quando fazem sentido: depois de adotarmos pontos da segunda marcação a concordância deixa de ser independente).
const KEEP = process.argv.includes("--keep-metrics");
if (!KEEP) db.exec("DELETE FROM consistencia");
const put = KEEP
  ? { run: () => undefined }
  : db.prepare("INSERT OR REPLACE INTO consistencia (nome, valor, n) VALUES (?, ?, ?)");
const fmt = (x: number | null) => (x === null ? "–" : x.toFixed(2));

for (const [rotulo, fonte] of [["atual", atual], ["r1", r1]] as const) {
  const r = compararMarcacoes(fonte.map(marca), B);
  put.run(`${rotulo}_n`, r.n, r.n);
  put.run(`${rotulo}_eco_acordo`, r.eco.acordo, r.n);
  put.run(`${rotulo}_eco_kappa`, r.eco.kappa, r.n);
  put.run(`${rotulo}_eco_sinal_oposto`, r.eco.sinalOposto, r.eco.ambosComDirecao);
  put.run(`${rotulo}_eco_erro`, r.eco.erroMedio, r.n);
  put.run(`${rotulo}_priv_acordo`, r.priv.acordo, r.n);
  put.run(`${rotulo}_priv_kappa`, r.priv.kappa, r.n);
  put.run(`${rotulo}_priv_sinal_oposto`, r.priv.sinalOposto, r.priv.ambosComDirecao);
  put.run(`${rotulo}_proc_diverge`, r.procDiverge, r.n);
  console.log(
    `[${rotulo}] n=${r.n} | economia: acordo ${(r.eco.acordo * 100).toFixed(0)}%, kappa ${fmt(r.eco.kappa)}, sinal oposto em ${r.eco.sinalOposto} de ${r.eco.ambosComDirecao} com direção nas duas, erro médio ${r.eco.erroMedio.toFixed(2)}` +
      ` | privilégios: acordo ${(r.priv.acordo * 100).toFixed(0)}%, kappa ${fmt(r.priv.kappa)}, sinal oposto ${r.priv.sinalOposto}/${r.priv.ambosComDirecao}` +
      ` | procedimental diverge: ${r.procDiverge}`,
  );
}

// Notas dos parlamentares sob cada marcação (mesma fórmula do perfil), só nos votos que as duas consideram substantivos.
const procA = new Set(atual.filter((a) => a.proc).map((a) => a.sv));
const procB = new Set(blind.filter((b) => b.proc).map((b) => b.sv));
const usar = (sv: string) => ids.has(sv) && !procA.has(sv) && !procB.has(sv);
const tagA = new Map(atual.map((a) => [a.sv, a]));
const tagB = new Map(blind.map((b) => [b.sv, b]));
const votos = q<{ sv: string; membro: string; vote: string; chamber: string }>(
  `SELECT mv.session_vote_id AS sv, mv.member_id AS membro, mv.vote, substr(mv.member_id, 1, 1) AS chamber
     FROM member_vote mv WHERE mv.vote IN ('SIM', 'NAO')`,
).filter((v) => usar(v.sv));
for (const ch of ["C", "S"]) {
  const sel = votos.filter((v) => v.chamber === ch);
  const lista = (tags: Map<string, Linha>): VotoMembro[] =>
    sel.map((v) => ({ membro: v.membro, vote: v.vote as "SIM" | "NAO", e: tags.get(v.sv)!.e, p: tags.get(v.sv)!.p, c: tags.get(v.sv)!.c }));
  const sa = pontuarMembros(lista(tagA), MIN_ECONOMIC_VOTES, MIN_PRIVILEGE_VOTES);
  const sb = pontuarMembros(lista(tagB), MIN_ECONOMIC_VOTES, MIN_PRIVILEGE_VOTES);
  const est = correlacaoDeNotas(sa, sb, "estado");
  const pri = correlacaoDeNotas(sa, sb, "privilegio");
  put.run(`notas_${ch}_estado`, est.rho, est.n);
  put.run(`notas_${ch}_privilegio`, pri.rho, pri.n);
  console.log(`[notas ${ch === "C" ? "Câmara" : "Senado"}] correlação de Spearman entre as duas marcações: Estado ${fmt(est.rho)} (n=${est.n}), Privilégios ${fmt(pri.rho)} (n=${pri.n})`);
}

// Divergências para revisão humana.
db.exec("DELETE FROM tag_divergence");
const insD = db.prepare(
  `INSERT INTO tag_divergence (sv, kind, eixo, e_a, e_b, p_a, p_b, c_a, c_b, why_a, why_b, impacto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
let nd = 0;
db.exec("BEGIN");
for (const a of atual) {
  const b = tagB.get(a.sv);
  if (!b || (a.proc && b.proc)) continue;
  const eco = a.e * b.e < 0 && Math.abs(a.e) >= 0.2 && Math.abs(b.e) >= 0.2
    ? "sinal-oposto"
    : (Math.abs(a.e) >= 0.5 && Math.abs(b.e) < 0.2) || (Math.abs(b.e) >= 0.5 && Math.abs(a.e) < 0.2)
      ? "um-neutro"
      : null;
  const pri = a.p * b.p < 0 && Math.abs(a.p) >= 0.3 && Math.abs(b.p) >= 0.3
    ? "sinal-oposto"
    : (Math.abs(a.p) >= 0.5 && Math.abs(b.p) < 0.3) || (Math.abs(b.p) >= 0.5 && Math.abs(a.p) < 0.3)
      ? "um-neutro"
      : null;
  const proc = a.proc !== b.proc && (Math.abs(a.e) >= 0.5 || Math.abs(a.p) >= 0.5 || Math.abs(b.e) >= 0.5 || Math.abs(b.p) >= 0.5);
  if (!eco && !pri && !proc) continue;
  const kind = eco ?? pri ?? "um-neutro";
  const eixo = eco ? "economico" : pri ? "privilegio" : "economico";
  insD.run(a.sv, kind, eixo, a.e, b.e, a.p, b.p, a.c, b.c, a.why, b.why, Math.max(Math.abs(a.e - b.e), Math.abs(a.p - b.p)));
  nd++;
}
db.exec("COMMIT");
console.log(`${nd} votos em divergência gravados em tag_divergence.`);
