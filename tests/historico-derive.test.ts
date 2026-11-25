import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../src/lib/db";
import { deriveHistorico, deriveIv, deriveMandatos } from "../src/lib/derive";
import { writeVotacao, type ParsedVotacao } from "../scripts/lib/parsed";

type V = "SIM" | "NAO" | "ABS";
/** Uma votação nominal da Câmara; `quem` = [id, partido, voto]. */
function vot(id: string, date: string, quem: [string, string, V][]): ParsedVotacao {
  return {
    chamber: "C", svId: `C:${id}`, date, description: "Votação em turno único.", result: "approved", nominal: true,
    bill: { id: `C:${id}`, label: `PL ${id}`, ementa: "x" },
    members: quem.map(([m, p]) => ({ id: m, name: `Pessoa ${m}`, party: p, uf: "PE", photo: null })),
    votes: quem.map(([m, p, v]) => ({ memberId: m, party: p, vote: v })),
    orientations: [],
  };
}

/**
 * 54ª legislatura (2011-2015), partidos com nomes antigos: PMDB e MDB são o mesmo partido (MDB).
 *   v1: MDB: a(SIM) b(SIM) c(NAO)  → posição SIM        PT: d(NAO) e(NAO)       → posição NAO
 *   v2: MDB: a(NAO) b(SIM) c(SIM)  → posição SIM        PT: d(SIM) e(NAO) f(NAO) → posição NAO
 */
function montar() {
  const db = openMemoryDb();
  writeVotacao(db, vot("10-1", "2012-03-01", [["C:a", "PMDB", "SIM"], ["C:b", "MDB", "SIM"], ["C:c", "PMDB", "NAO"], ["C:d", "PT", "NAO"], ["C:e", "PT", "NAO"]]));
  writeVotacao(db, vot("11-1", "2012-04-01", [["C:a", "PMDB", "NAO"], ["C:b", "PMDB", "SIM"], ["C:c", "MDB", "SIM"], ["C:d", "PT", "SIM"], ["C:e", "PT", "NAO"], ["C:f", "PT", "NAO"]]));
  // Governo orientou Sim na primeira e Não na segunda
  db.exec("INSERT INTO orientation VALUES ('C:10-1','Governo','bloc','Sim'), ('C:11-1','Governo','bloc','Não')");
  // marcações: v1 empurra para o mercado (e=+0,6, c=0,5); v2 para o Estado (e=-0,6, c=0,5)
  db.exec(`INSERT INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver) VALUES
    ('C:10-1','llm',0.6,0,0,0.5,'t','r1'), ('C:11-1','llm',-0.6,0,0,0.5,'t','r1')`);
  deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 });
  deriveHistorico(db, undefined, { minEconomic: 1, minPrivilege: 1 });
  return db;
}
const um = (db: ReturnType<typeof openMemoryDb>, sql: string) => db.prepare(sql).get() as Record<string, number | string | null>;

describe("deriveHistorico (por legislatura, partidos pela linhagem)", () => {
  const db = montar();

  it("a posição do partido junta as siglas da mesma linhagem (PMDB + MDB = MDB)", () => {
    const pos = db.prepare("SELECT sv, party, yes, no, pos FROM party_position_all ORDER BY sv, party").all().map((r) => ({ ...r }));
    expect(pos).toEqual([
      { sv: "C:10-1", party: "MDB", yes: 2, no: 1, pos: "SIM" },
      { sv: "C:10-1", party: "PT", yes: 0, no: 2, pos: "NAO" },
      { sv: "C:11-1", party: "MDB", yes: 2, no: 1, pos: "SIM" },
      { sv: "C:11-1", party: "PT", yes: 1, no: 2, pos: "NAO" },
    ]);
  });

  it("alinhamento com o próprio partido: o voto do próprio parlamentar sai da conta (leave-one-out)", () => {
    // a no v1 (SIM): outros do MDB = b SIM, c NAO → empate → não conta. a no v2 (NAO): b SIM, c SIM → posição SIM → discorda.
    expect(um(db, "SELECT shared, same FROM member_loyalty_leg WHERE member_id='C:a' AND legislatura=54")).toEqual({ shared: 1, same: 0 });
    // b no v1 (SIM): a SIM, c NAO → empate. b no v2 (SIM): a NAO, c SIM → empate → nenhuma votação com posição
    expect(db.prepare("SELECT * FROM member_loyalty_leg WHERE member_id='C:b'").get()).toBeUndefined();
    // c no v1 (NAO): a SIM, b SIM → SIM → discorda; c no v2 (SIM): a NAO, b SIM → empate → fora
    expect(um(db, "SELECT shared, same FROM member_loyalty_leg WHERE member_id='C:c'")).toEqual({ shared: 1, same: 0 });
  });

  it("concordância com outro partido usa a posição inteira dele", () => {
    // a (MDB) × PT: v1 a=SIM, PT=NAO (contra); v2 a=NAO, PT=NAO (igual) → 2 em comum, 1 igual
    expect(um(db, "SELECT shared, same FROM member_party_agreement_leg WHERE member_id='C:a' AND party='PT' AND legislatura=54")).toEqual({ shared: 2, same: 1 });
  });

  it("alinhamento com o Governo: só orientações Sim/Não e votos Sim/Não", () => {
    // a: v1 SIM (Gov Sim) igual; v2 NAO (Gov Não) igual → 2 de 2.  c: v1 NAO (Gov Sim) contra; v2 SIM (Gov Não) contra → 0 de 2
    expect(um(db, "SELECT shared, same FROM member_governo_leg WHERE member_id='C:a' AND legislatura=54")).toEqual({ shared: 2, same: 2 });
    expect(um(db, "SELECT shared, same FROM member_governo_leg WHERE member_id='C:c' AND legislatura=54")).toEqual({ shared: 2, same: 0 });
  });

  it("perfil por legislatura: peso = |valor| × confiança, Sim conta +valor e Não −valor", () => {
    // a: v1 SIM, e=+0,6 → mercado (peso 0,3); v2 NAO, e=−0,6 → d*e = +0,6 → mercado (peso 0,3) → Mercado 100
    const a = um(db, "SELECT left_pct l, right_pct r, n_economic n FROM member_iv_leg WHERE member_id='C:a' AND legislatura=54");
    expect(a).toEqual({ l: 0, r: 100, n: 2 });
    // c: v1 NAO, e=+0,6 → Estado; v2 SIM, e=−0,6 → Estado → Estado 100
    expect(um(db, "SELECT left_pct l, right_pct r FROM member_iv_leg WHERE member_id='C:c' AND legislatura=54")).toEqual({ l: 100, r: 0 });
  });

  it("por partido e legislatura: votações em que a posição empurrou para cada lado", () => {
    // MDB: v1 pos SIM e=+0,6 → mercado; v2 pos SIM e=−0,6 → Estado.  PT: v1 pos NAO → Estado; v2 pos NAO e=−0,6 → mercado
    expect(um(db, "SELECT n_votacoes, n_estado, n_mercado FROM party_leg WHERE party='MDB' AND legislatura=54 AND chamber='C'")).toEqual({ n_votacoes: 2, n_estado: 1, n_mercado: 1 });
    expect(um(db, "SELECT n_votacoes, n_estado, n_mercado FROM party_leg WHERE party='PT' AND legislatura=54 AND chamber='C'")).toEqual({ n_votacoes: 2, n_estado: 1, n_mercado: 1 });
  });

  it("tabelas por legislatura de legislaturas diferentes não se misturam", () => {
    const db2 = montar();
    writeVotacao(db2, vot("20-1", "2024-05-01", [["C:a", "MDB", "SIM"], ["C:d", "PT", "NAO"]]));
    db2.exec("INSERT INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver) VALUES ('C:20-1','llm',0.6,0,0,0.5,'t','r1')");
    deriveIv(db2, undefined, { minEconomic: 1, minPrivilege: 1 });
    deriveHistorico(db2, undefined, { minEconomic: 1, minPrivilege: 1 });
    expect(um(db2, "SELECT n_economic n FROM member_iv_leg WHERE member_id='C:a' AND legislatura=54")).toEqual({ n: 2 });
    expect(um(db2, "SELECT n_economic n FROM member_iv_leg WHERE member_id='C:a' AND legislatura=57")).toEqual({ n: 1 });
  });
});

describe("deriveMandatos (estatísticas do mandato)", () => {
  it("guarda votos, período, partido principal e total de votações da casa no período", () => {
    const db = montar();
    deriveMandatos(db);
    const m = um(db, "SELECT legislatura l, votos, primeira, ultima, partido, partido_sigla ps, total_votacoes tv, natureza FROM mandato WHERE member_id='C:a'");
    expect(m).toMatchObject({ l: 54, votos: 2, primeira: "2012-03-01", ultima: "2012-04-01", partido: "MDB", ps: "PMDB", tv: 2 });
    expect(m.natureza).toBe("indefinido"); // sem eventos importados, não inventamos um desfecho
  });
});
