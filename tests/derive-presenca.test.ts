import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../src/lib/db";
import { deriveIv } from "../src/lib/derive";
import { derivePresenca } from "../src/lib/derive-presenca";
import { writeVotacao, type ParsedVotacao } from "../scripts/lib/parsed";

type V = "SIM" | "NAO" | "ABS" | "OUTRO";
function vot(chamber: "C" | "S", id: string, date: string, label: string, votos: [string, V][]): ParsedVotacao {
  return {
    chamber, svId: `${chamber}:${id}`, date, description: "Votação em turno único.", result: "approved", nominal: true,
    bill: { id: `${chamber}:b${id}`, label, ementa: "x" },
    members: votos.map(([m]) => ({ id: m, name: m, party: "PT", uf: "PE", photo: null })),
    votes: votos.map(([m, v]) => ({ memberId: m, party: "PT", vote: v })),
    orientations: [],
  };
}

/**
 * Câmara, 57ª legislatura, 5 votações nominais (data, tipo):
 *   v1 2024-03-01 PEC · v2 2024-03-10 PL · v3 2024-06-01 PL · v4 2024-06-10 MPV · v5 2024-09-01 PL
 * Placar: v1 Sim 3 · v2 Sim 2 Não 1 · v3 Sim 1 · v4 Sim 2 · v5 Sim 3 Não 3 (empate: apertada)
 */
function montar() {
  const db = openMemoryDb();
  writeVotacao(db, vot("C", "1", "2024-03-01", "PEC 1/2024", [["C:a", "SIM"], ["C:b", "SIM"], ["C:d", "SIM"]]));
  writeVotacao(db, vot("C", "2", "2024-03-10", "PL 2/2024", [["C:a", "NAO"], ["C:c", "SIM"], ["C:d", "OUTRO"], ["C:e", "SIM"]]));
  writeVotacao(db, vot("C", "3", "2024-06-01", "PL 3/2024", [["C:b", "ABS"], ["C:d", "SIM"]]));
  writeVotacao(db, vot("C", "4", "2024-06-10", "MPV 4/2024", [["C:d", "SIM"], ["C:e", "SIM"]]));
  writeVotacao(db, vot("C", "5", "2024-09-01", "PL 5/2024", [["C:a", "SIM"], ["C:p", "SIM"], ["C:d", "SIM"], ["C:b", "NAO"], ["C:f", "NAO"], ["C:g", "NAO"]]));
  const evento = db.prepare("INSERT INTO mandato_evento (member_id, seq, legislatura, data, situacao, condicao, descricao) VALUES (?, ?, 57, ?, ?, 'Titular', ?)");
  const POSSE = "Entrada - Posse de Eleito Titular - Posse na Sessão Preparatória";
  // a: titular com licença de 2024-05-01 a 2024-08-01 (v3 e v4 caem na licença)
  evento.run("C:a", 0, "2024-01-01", "Exercício", POSSE);
  evento.run("C:a", 1, "2024-05-01", "Licença", "Saída - Afastamento sem prazo determinado - Ministro de Estado");
  evento.run("C:a", 2, "2024-08-01", "Exercício", "Entrada - Reassunção");
  // b, d, f, g, p: em exercício o ano todo
  for (const m of ["C:b", "C:d", "C:f", "C:g", "C:p"]) evento.run(m, 0, "2024-01-01", "Exercício", POSSE);
  // c: suplente de 2024-03-05 a 2024-06-05 (v2 e v3 dentro; v4 fora)
  evento.run("C:c", 0, "2024-03-05", "Exercício", "Entrada - Posse de Suplente - Posse como Suplente");
  evento.run("C:c", 1, "2024-06-05", "SUPLENCIA", "Saída - Afastamento sem prazo determinado - Afastamento de Suplente (automático)");
  // e: sem nenhum evento → janela estimada entre o primeiro e o último voto (v2 a v4)
  // p: Presidente da Câmara até 2024-07-01 (v1 a v4 presidiu); depois deputado comum
  db.prepare("INSERT INTO mesa_cargo (member_id, legislatura, cargo, inicio, fim) VALUES ('C:p', 57, 'Presidente', '2024-01-01', '2024-07-01')").run();
  // sessões deliberativas do Plenário e presença
  const sessao = db.prepare("INSERT INTO sessao_plenario (id, data, hora) VALUES (?, ?, '10:00')");
  for (const [id, d] of [[1, "2024-03-01"], [2, "2024-03-10"], [3, "2024-06-01"], [4, "2024-09-01"]] as const) sessao.run(id, d);
  const pres = db.prepare("INSERT INTO presenca_sessao VALUES (?, ?)");
  for (const s of [1, 2, 4]) { pres.run("C:a", s); pres.run("C:b", s); }
  // marcações: v1 importante (e = 0,5) e v4 importante (p = 0,8); as demais neutras
  db.exec(`INSERT INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver) VALUES
    ('C:1','llm',0.5,0,0,0.8,'t','r1'), ('C:4','llm',0,0.8,0,0.8,'t','r1')`);

  // Senado: 4 votações; o senador x votou na S1, esteve em atividade parlamentar na S2, ficou presente sem votar na S3 e presidiu a S4
  writeVotacao(db, vot("S", "1", "2024-04-01", "PEC 10/2024", [["S:x", "SIM"]]));
  for (const n of ["2", "3", "4"]) writeVotacao(db, vot("S", n, `2024-04-0${Number(n)}`, `PL ${n}/2024`, [["S:y", "SIM"]]));
  const aus = db.prepare("INSERT INTO ausencia_senado VALUES (?, 'S:x', ?, ?)");
  aus.run("S:2", "AP", "Atividade parlamentar");
  aus.run("S:3", "P-NRV", "Presente – Não registrou voto");
  aus.run("S:4", "Presidente (art. 51 RISF)", null);
  deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 });
  derivePresenca(db);
  return db;
}
const um = (db: ReturnType<typeof openMemoryDb>, sql: string) => db.prepare(sql).get() as Record<string, number | string | null>;
const todos = (db: ReturnType<typeof openMemoryDb>, sql: string) => db.prepare(sql).all().map((r) => ({ ...r }));

describe("derivePresenca (Câmara)", () => {
  const db = montar();
  const part = (m: string) => um(db, `SELECT * FROM participacao_mandato WHERE member_id='${m}' AND legislatura=57`);

  it("titular com licença: as votações da licença não contam contra (v3 e v4 ficam fora do denominador)", () => {
    expect(part("C:a")).toMatchObject({ votacoes: 3, votou: 3, sim: 2, nao: 1, ausente: 0, janela: "eventos", sessoes: 3, sessoes_presente: 3 });
    expect(todos(db, "SELECT inicio, fim, motivo FROM fora_exercicio WHERE member_id='C:a'")).toEqual([{ inicio: "2024-05-01", fim: "2024-08-01", motivo: "Ministro de Estado" }]);
    expect(todos(db, "SELECT inicio, fim FROM exercicio_periodo WHERE member_id='C:a' ORDER BY inicio")).toEqual([{ inicio: "2024-01-01", fim: "2024-05-01" }, { inicio: "2024-08-01", fim: null }]);
  });

  it("quem faltou: 5 votações, votou em 3 (Sim, Abstenção e Não), ausente em 2; maior sequência 1", () => {
    expect(part("C:b")).toMatchObject({ votacoes: 5, votou: 3, sim: 1, nao: 1, abstencao: 1, ausente: 2, maior_seq: 1, sessoes: 4, sessoes_presente: 3 });
    expect(todos(db, "SELECT sv FROM participacao_ausencia WHERE member_id='C:b' ORDER BY sv")).toEqual([{ sv: "C:2" }, { sv: "C:4" }]);
  });

  it("por mês e por tipo de proposição, calculados à mão (b)", () => {
    expect(todos(db, "SELECT mes, votacoes, votou FROM participacao_mes WHERE member_id='C:b' ORDER BY mes")).toEqual([
      { mes: "2024-03", votacoes: 2, votou: 1 },
      { mes: "2024-06", votacoes: 2, votou: 1 },
      { mes: "2024-09", votacoes: 1, votou: 1 },
    ]);
    expect(todos(db, "SELECT tipo, votacoes, votou FROM participacao_tipo WHERE member_id='C:b' ORDER BY tipo")).toEqual([
      { tipo: "MPV", votacoes: 1, votou: 0 },
      { tipo: "PEC", votacoes: 1, votou: 1 },
      { tipo: "PL", votacoes: 3, votou: 2 },
    ]);
  });

  it("votações apertadas (v5 empatou 3 a 3) e importantes (v1 e v4)", () => {
    expect(um(db, "SELECT apertada, margem FROM votacao_margem WHERE sv='C:5'")).toEqual({ apertada: 1, margem: 0 });
    expect(um(db, "SELECT apertada FROM votacao_margem WHERE sv='C:2'")).toEqual({ apertada: 0 }); // 2 a 1: margem 33%
    expect(um(db, "SELECT apertadas, apertadas_votou, importantes, importantes_votou FROM participacao_marcas WHERE member_id='C:b'")).toEqual({
      apertadas: 1, apertadas_votou: 1, importantes: 2, importantes_votou: 1,
    });
  });

  it("suplente: só conta o período do exercício (v2 e v3); v1 e v4 ficam de fora", () => {
    expect(part("C:c")).toMatchObject({ votacoes: 2, votou: 1, ausente: 1 });
  });

  it("Presidente da Câmara: as votações em que presidiu saem da conta (v1 a v4); só v5 conta", () => {
    expect(part("C:p")).toMatchObject({ votacoes: 1, votou: 1, presidiu: 4, cargo_mesa: "Presidente" });
  });

  it("quem presidiu uma sessão ('Artigo 17' = OUTRO) não é falta nem voto: sai do denominador e é contado como 'presidiu'", () => {
    expect(part("C:d")).toMatchObject({ votacoes: 4, votou: 4, presidiu: 1, ausente: 0 });
  });

  it("sem eventos: janela estimada entre o primeiro e o último voto (v2 a v4: 3 votações, votou em 2)", () => {
    expect(part("C:e")).toMatchObject({ janela: "estimada", votacoes: 3, votou: 2, ausente: 1 });
  });

  it("invariantes: votou = sim+não+abstenção+obstrução, ausente = votações − votou, linhas de ausência = ausente", () => {
    for (const r of todos(db, "SELECT member_id m, votou, sim, nao, abstencao, obstrucao, ausente, votacoes FROM participacao_mandato")) {
      expect(r.votou).toBe((r.sim as number) + (r.nao as number) + (r.abstencao as number) + (r.obstrucao as number));
      expect(r.ausente).toBe((r.votacoes as number) - (r.votou as number));
      expect((um(db, `SELECT COUNT(*) n FROM participacao_ausencia WHERE member_id='${r.m}'`) as { n: number }).n).toBe(r.ausente);
    }
  });
});

describe("derivePresenca (Senado): o denominador é exato, com o motivo oficial de cada ausência", () => {
  const db = montar();
  it("senador x: votou 1, ausente 2 (uma atividade parlamentar e uma presença sem voto); a votação que presidiu sai da conta", () => {
    expect(um(db, "SELECT votacoes, votou, ausente, presidiu, justificadas, presente_sem_voto, nao_compareceu, sessoes FROM participacao_mandato WHERE member_id='S:x'")).toEqual({
      votacoes: 3, votou: 1, ausente: 2, presidiu: 1, justificadas: 1, presente_sem_voto: 1, nao_compareceu: 0, sessoes: 0,
    });
    expect(todos(db, "SELECT sv, codigo, descricao FROM participacao_ausencia WHERE member_id='S:x' ORDER BY sv")).toEqual([
      { sv: "S:2", codigo: "AP", descricao: "Atividade parlamentar" },
      { sv: "S:3", codigo: "P-NRV", descricao: "Presente – Não registrou voto" },
    ]);
  });
});
