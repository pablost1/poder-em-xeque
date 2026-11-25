import type { DatabaseSync } from "node:sqlite";
import { periodoDaLegislatura } from "./legislaturas";
import {
  categoriaSenado,
  ehApertada,
  emExercicioNaData,
  maiorSequenciaDeAusencias,
  mesDaData,
  periodosDeExercicio,
  tipoDeProposicao,
  type Periodo,
} from "./presenca";

/*
 * Participação e presença por pessoa e legislatura. Tabelas (recriadas a cada rodada):
 *   votacao_margem, exercicio_periodo, fora_exercicio, participacao_mandato, participacao_mes, participacao_tipo,
 *   participacao_marcas, participacao_ausencia
 *
 * Denominador (Câmara): votações nominais da casa nos períodos em que a pessoa estava em exercício (eventos oficiais de
 * posse, licença e saída), UNIDAS às votações em que ela registrou voto, para que votou ≤ total sempre. Sem eventos, usa
 * o intervalo entre o primeiro e o último voto (janela = 'estimada').
 * Denominador (Senado): a API devolve uma linha por senador em cada votação nominal (voto ou motivo da ausência), então
 * o denominador é exato: as votações em que o senador tem linha.
 * Quem presidiu a sessão ("Artigo 17" na Câmara, Presidente no Senado) e as votações "dispositivo não citado" saem da conta.
 */

type Log = (name: string, seconds: number) => void;
type Votacao = { id: string; chamber: "C" | "S"; legislatura: number; date: string; label: string | null };
type Contagem = { n: number; v: number };

const VOTOU = new Set(["SIM", "NAO", "ABS", "OBS"]);

export function derivePresenca(db: DatabaseSync, log?: Log) {
  const t0 = Date.now();
  db.exec(`
    DROP TABLE IF EXISTS votacao_margem;
    DROP TABLE IF EXISTS exercicio_periodo;
    DROP TABLE IF EXISTS fora_exercicio;
    DROP TABLE IF EXISTS participacao_mandato;
    DROP TABLE IF EXISTS participacao_mes;
    DROP TABLE IF EXISTS participacao_tipo;
    DROP TABLE IF EXISTS participacao_marcas;
    DROP TABLE IF EXISTS participacao_ausencia;
    CREATE TABLE votacao_margem (sv TEXT PRIMARY KEY, chamber TEXT NOT NULL, legislatura INTEGER NOT NULL, sim INTEGER NOT NULL, nao INTEGER NOT NULL, margem REAL NOT NULL, apertada INTEGER NOT NULL) WITHOUT ROWID;
    CREATE TABLE exercicio_periodo (member_id TEXT NOT NULL, legislatura INTEGER NOT NULL, inicio TEXT NOT NULL, fim TEXT, motivo_fim TEXT);
    CREATE TABLE fora_exercicio (member_id TEXT NOT NULL, legislatura INTEGER NOT NULL, inicio TEXT NOT NULL, fim TEXT, motivo TEXT NOT NULL);
    CREATE TABLE participacao_mandato (
      member_id TEXT NOT NULL, legislatura INTEGER NOT NULL, chamber TEXT NOT NULL, janela TEXT NOT NULL,
      votacoes INTEGER NOT NULL, votou INTEGER NOT NULL, sim INTEGER NOT NULL, nao INTEGER NOT NULL, abstencao INTEGER NOT NULL,
      obstrucao INTEGER NOT NULL, presidiu INTEGER NOT NULL, ausente INTEGER NOT NULL,
      justificadas INTEGER NOT NULL, nao_compareceu INTEGER NOT NULL, presente_sem_voto INTEGER NOT NULL, outras INTEGER NOT NULL,
      sessoes INTEGER NOT NULL, sessoes_presente INTEGER NOT NULL,
      maior_seq INTEGER NOT NULL, seq_de TEXT, seq_ate TEXT, primeira TEXT, ultima TEXT, cargo_mesa TEXT,
      PRIMARY KEY (member_id, legislatura)
    );
    CREATE TABLE participacao_mes (member_id TEXT NOT NULL, legislatura INTEGER NOT NULL, mes TEXT NOT NULL, votacoes INTEGER NOT NULL, votou INTEGER NOT NULL, PRIMARY KEY (member_id, legislatura, mes));
    CREATE TABLE participacao_tipo (member_id TEXT NOT NULL, legislatura INTEGER NOT NULL, tipo TEXT NOT NULL, votacoes INTEGER NOT NULL, votou INTEGER NOT NULL, PRIMARY KEY (member_id, legislatura, tipo));
    CREATE TABLE participacao_marcas (member_id TEXT NOT NULL, legislatura INTEGER NOT NULL, apertadas INTEGER NOT NULL, apertadas_votou INTEGER NOT NULL, importantes INTEGER NOT NULL, importantes_votou INTEGER NOT NULL, PRIMARY KEY (member_id, legislatura));
    CREATE TABLE participacao_ausencia (member_id TEXT NOT NULL, legislatura INTEGER NOT NULL, sv TEXT NOT NULL, codigo TEXT, descricao TEXT, PRIMARY KEY (member_id, sv));
    CREATE INDEX idx_pa_leg ON participacao_ausencia(member_id, legislatura);
    CREATE INDEX idx_pm_leg ON participacao_mandato(legislatura);
  `);

  // 1. votações nominais e a margem de cada uma
  const votacoes = db
    .prepare(
      `SELECT s.id, s.chamber, s.legislatura, s.date, b.label
         FROM session_vote_all s LEFT JOIN bill b ON b.id = s.bill_id
        WHERE s.is_nominal = 1 AND s.legislatura IS NOT NULL ORDER BY s.date, s.id`,
    )
    .all() as Votacao[];
  const infoV = new Map(votacoes.map((v) => [v.id, v]));
  const apertada = new Set<string>();
  const insMargem = db.prepare("INSERT INTO votacao_margem VALUES (?, ?, ?, ?, ?, ?, ?)");
  db.exec("BEGIN");
  for (const m of db
    .prepare("SELECT session_vote_id AS sv, SUM(vote = 'SIM') AS sim, SUM(vote = 'NAO') AS nao FROM member_vote_all GROUP BY session_vote_id")
    .all() as { sv: string; sim: number; nao: number }[]) {
    const v = infoV.get(m.sv);
    if (!v) continue;
    const ap = ehApertada(m.sim, m.nao);
    if (ap) apertada.add(m.sv);
    insMargem.run(m.sv, v.chamber, v.legislatura, m.sim, m.nao, m.sim + m.nao > 0 ? Math.abs(m.sim - m.nao) / (m.sim + m.nao) : 1, ap ? 1 : 0);
  }
  db.exec("COMMIT");
  const importante = new Set(
    (db.prepare("SELECT sv FROM vote_tag_eff WHERE procedural = 0 AND (ABS(economic) >= 0.2 OR ABS(privilege) >= 0.3)").all() as { sv: string }[]).map((r) => r.sv),
  );

  // 2. eventos de mandato (Câmara) e licenças dos exercícios (Senado)
  type Ev = { legislatura: number | null; data: string | null; situacao: string | null; descricao: string | null };
  const evPor = new Map<string, Ev[]>();
  for (const e of db.prepare("SELECT member_id, legislatura, data, situacao, descricao FROM mandato_evento ORDER BY member_id, seq").all() as (Ev & { member_id: string })[]) {
    const k = `${e.member_id}|${e.legislatura}`;
    (evPor.get(k) ?? evPor.set(k, []).get(k)!).push(e);
  }
  const LICENCAS_SENADO = new Set(["LS", "LP", "LCS", "AFO", "LG", "LAP", "LA"]);
  const foraSenado = new Map<string, { inicio: string; fim: string | null; motivo: string }[]>();
  for (const r of db.prepare("SELECT member_id, ex_inicio, ex_fim, causa, descricao FROM mandato_senado WHERE ex_inicio IS NOT NULL").all() as {
    member_id: string; ex_inicio: string; ex_fim: string | null; causa: string | null; descricao: string | null;
  }[]) {
    if (!r.causa || !LICENCAS_SENADO.has(r.causa.trim())) continue;
    (foraSenado.get(r.member_id) ?? foraSenado.set(r.member_id, []).get(r.member_id)!).push({ inicio: r.ex_inicio, fim: r.ex_fim, motivo: r.descricao ?? r.causa });
  }

  // 3. sessões deliberativas do Plenário e presença (Câmara)
  const sessoes = db.prepare("SELECT id, data FROM sessao_plenario WHERE com_presenca = 1 ORDER BY data").all() as { id: number; data: string }[];
  const presentePor = new Map<string, Set<number>>();
  for (const p of db.prepare("SELECT member_id, sessao_id FROM presenca_sessao").all() as { member_id: string; sessao_id: number }[]) {
    (presentePor.get(p.member_id) ?? presentePor.set(p.member_id, new Set()).get(p.member_id)!).add(p.sessao_id);
  }

  // 3b. Mesa Diretora: o Presidente preside todas as sessões do período (não vota); os outros cargos presidem de vez em quando
  type Mesa = { member_id: string; legislatura: number; cargo: string; inicio: string; fim: string | null };
  const mesaPor = new Map<string, Mesa[]>();
  for (const m of db.prepare("SELECT member_id, legislatura, cargo, inicio, fim FROM mesa_cargo").all() as Mesa[]) {
    const k = `${m.member_id}|${m.legislatura}`;
    (mesaPor.get(k) ?? mesaPor.set(k, []).get(k)!).push(m);
  }

  // 4. motivos de ausência (Senado)
  const ausSenado = new Map<string, { codigo: string; descricao: string | null }>();
  const senadoresPorLeg = new Map<number, Set<string>>();
  for (const a of db.prepare("SELECT session_vote_id AS sv, member_id AS m, codigo, descricao FROM ausencia_senado").all() as {
    sv: string; m: string; codigo: string; descricao: string | null;
  }[]) {
    ausSenado.set(`${a.m}|${a.sv}`, { codigo: a.codigo, descricao: a.descricao });
    const v = infoV.get(a.sv);
    if (v) (senadoresPorLeg.get(v.legislatura) ?? senadoresPorLeg.set(v.legislatura, new Set()).get(v.legislatura)!).add(a.m);
  }

  const insP = db.prepare("INSERT INTO exercicio_periodo VALUES (?, ?, ?, ?, ?)");
  const insF = db.prepare("INSERT INTO fora_exercicio VALUES (?, ?, ?, ?, ?)");
  const insMandato = db.prepare("INSERT INTO participacao_mandato VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insMes = db.prepare("INSERT INTO participacao_mes VALUES (?, ?, ?, ?, ?)");
  const insTipo = db.prepare("INSERT INTO participacao_tipo VALUES (?, ?, ?, ?, ?)");
  const insMarcas = db.prepare("INSERT INTO participacao_marcas VALUES (?, ?, ?, ?, ?, ?)");
  const insAus = db.prepare("INSERT INTO participacao_ausencia VALUES (?, ?, ?, ?, ?)");
  const bump = (m: Map<string, Contagem>, k: string, votou: boolean) => {
    const c = m.get(k) ?? { n: 0, v: 0 };
    c.n++;
    if (votou) c.v++;
    m.set(k, c);
  };

  db.exec("BEGIN");
  try {
    for (const leg of [...new Set(votacoes.map((v) => v.legislatura))].sort((a, b) => a - b)) {
      const votsC = votacoes.filter((v) => v.legislatura === leg && v.chamber === "C");
      const votsS = votacoes.filter((v) => v.legislatura === leg && v.chamber === "S");
      const { inicio: iniLeg, fim: fimLeg } = periodoDaLegislatura(leg);
      const sessLeg = sessoes.filter((s) => s.data >= iniLeg && s.data <= fimLeg);

      const porPessoa = new Map<string, Map<string, string>>();
      for (const r of db.prepare("SELECT member_id AS m, session_vote_id AS sv, vote FROM member_vote_all WHERE legislatura = ?").all(leg) as { m: string; sv: string; vote: string }[]) {
        (porPessoa.get(r.m) ?? porPessoa.set(r.m, new Map()).get(r.m)!).set(r.sv, r.vote);
      }
      for (const m of senadoresPorLeg.get(leg) ?? []) if (!porPessoa.has(m)) porPessoa.set(m, new Map());

      for (const [membro, votos] of porPessoa) {
        const ehC = membro.startsWith("C:");
        const vots = ehC ? votsC : votsS;
        if (!vots.length) continue;

        // janela em que a pessoa estava em exercício (só Câmara; no Senado o denominador vem das linhas da API)
        let periodos: Periodo[] = [];
        let estimada: { de: string; ate: string } | null = null;
        if (ehC) {
          const r = periodosDeExercicio(evPor.get(`${membro}|${leg}`) ?? []);
          periodos = r.periodos;
          for (const p of r.periodos) insP.run(membro, leg, p.inicio, p.fim, p.motivoFim);
          for (const f of r.fora) insF.run(membro, leg, f.inicio, f.fim, f.motivo);
          if (!periodos.length) {
            const datas = [...votos.keys()].map((id) => infoV.get(id)?.date).filter((d): d is string => !!d).sort();
            if (datas.length) estimada = { de: datas[0], ate: datas[datas.length - 1] };
          }
        } else {
          for (const f of foraSenado.get(membro) ?? []) insF.run(membro, leg, f.inicio, f.fim, f.motivo);
        }
        const mesa = ehC ? (mesaPor.get(`${membro}|${leg}`) ?? []) : [];
        const presidente = mesa.filter((m) => m.cargo === "Presidente");
        const presidindo = (data: string) => presidente.some((m) => data >= m.inicio && (m.fim === null || data < m.fim));
        const cargoMesa = mesa.length ? [...new Set(mesa.map((m) => m.cargo))].join("; ") : null;
        const naJanela = (data: string) => (estimada ? data >= estimada.de && data <= estimada.ate : emExercicioNaData(data, periodos));

        let votou = 0, sim = 0, nao = 0, abs = 0, obs = 0, presidiu = 0, ausente = 0, just = 0, ncom = 0, psv = 0, outras = 0, total = 0;
        const sequencia: boolean[] = [];
        const datasSeq: string[] = [];
        const meses = new Map<string, Contagem>();
        const tipos = new Map<string, Contagem>();
        let ap = 0, apV = 0, im = 0, imV = 0;
        let primeira: string | null = null, ultima: string | null = null;

        for (const v of vots) {
          const voto = votos.get(v.id);
          const aus = ehC ? undefined : ausSenado.get(`${membro}|${v.id}`);
          // Câmara: dentro da janela ou com voto registrado. Senado: tem linha (voto ou ausência) na votação.
          const conta = ehC ? voto !== undefined || naJanela(v.date) || presidindo(v.date) : voto !== undefined || aus !== undefined;
          if (!conta) continue;
          const cat = aus ? categoriaSenado(aus.codigo) : null;
          const presidiuPeriodo = ehC && voto === undefined && presidindo(v.date);
          if (voto === "OUTRO" || presidiuPeriodo || cat === "presidente" || cat === "nao_se_aplica") {
            presidiu++;
            continue;
          }
          total++;
          primeira ??= v.date;
          ultima = v.date;
          const registrou = voto !== undefined && VOTOU.has(voto);
          if (voto === "SIM") sim++;
          else if (voto === "NAO") nao++;
          else if (voto === "ABS") abs++;
          else if (voto === "OBS") obs++;
          if (registrou) votou++;
          else {
            ausente++;
            if (cat === "justificada") just++;
            else if (cat === "nao_compareceu") ncom++;
            else if (cat === "presente_sem_voto" || cat === "presente_obstrucao") psv++;
            else if (!ehC) outras++;
            insAus.run(membro, leg, v.id, aus?.codigo ?? null, aus?.descricao ?? null);
          }
          sequencia.push(registrou);
          datasSeq.push(v.date);
          bump(meses, mesDaData(v.date), registrou);
          bump(tipos, tipoDeProposicao(v.label), registrou);
          if (apertada.has(v.id)) { ap++; if (registrou) apV++; }
          if (importante.has(v.id)) { im++; if (registrou) imV++; }
        }
        if (total === 0) continue;
        const seq = maiorSequenciaDeAusencias(sequencia);

        // presença nas sessões deliberativas do Plenário (só Câmara, onde há arquivo de presença)
        let sess = 0, sessPres = 0;
        if (ehC && sessLeg.length) {
          const pres = presentePor.get(membro) ?? new Set<number>();
          for (const s of sessLeg) {
            const presente = pres.has(s.id);
            if (presente || naJanela(s.data)) {
              sess++;
              if (presente) sessPres++;
            }
          }
        }
        insMandato.run(
          membro, leg, ehC ? "C" : "S", estimada ? "estimada" : "eventos", total, votou, sim, nao, abs, obs, presidiu, ausente, just, ncom, psv, outras,
          sess, sessPres, seq?.tamanho ?? 0, seq ? datasSeq[seq.de] : null, seq ? datasSeq[seq.ate] : null, primeira, ultima, cargoMesa,
        );
        for (const [mes, x] of meses) insMes.run(membro, leg, mes, x.n, x.v);
        for (const [tp, x] of tipos) insTipo.run(membro, leg, tp, x.n, x.v);
        insMarcas.run(membro, leg, ap, apV, im, imV);
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  log?.("presenca", (Date.now() - t0) / 1000);
}
