import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../src/lib/db";
import { LEG_ATUAL, legislaturaDaData, lerLegislatura, periodoDaLegislatura, rotuloLegislatura, sqlLegislatura } from "../src/lib/legislaturas";
import { writeVotacao, type ParsedVotacao } from "../scripts/lib/parsed";

describe("legislaturaDaData", () => {
  it("a legislatura começa em 1º de fevereiro e janeiro ainda é da anterior", () => {
    expect(legislaturaDaData("2023-02-01")).toBe(57);
    expect(legislaturaDaData("2023-01-31")).toBe(56);
    expect(legislaturaDaData("2023-02-07")).toBe(57);
    expect(legislaturaDaData("2003-02-01")).toBe(52);
    expect(legislaturaDaData("2003-01-31")).toBe(51);
    expect(legislaturaDaData("2019-02-01")).toBe(56);
    expect(legislaturaDaData("2027-01-31")).toBe(57);
    expect(legislaturaDaData("2027-02-01")).toBe(58);
    expect(legislaturaDaData("2026-11-23")).toBe(LEG_ATUAL);
  });
  it("o período e o rótulo são coerentes com a data", () => {
    expect(periodoDaLegislatura(57)).toEqual({ inicio: "2023-02-01", fim: "2027-01-31" });
    expect(periodoDaLegislatura(52)).toEqual({ inicio: "2003-02-01", fim: "2007-01-31" });
    expect(rotuloLegislatura(56)).toBe("56ª legislatura (2019–2023)");
    expect(rotuloLegislatura(56, true)).toBe("56ª (2019–2023)");
    for (let n = 52; n <= 58; n++) {
      const { inicio, fim } = periodoDaLegislatura(n);
      expect(legislaturaDaData(inicio)).toBe(n);
      expect(legislaturaDaData(fim)).toBe(n);
    }
  });
  it("a expressão SQL dá o mesmo resultado que a função, em todas as datas de fronteira e ao longo de 25 anos", () => {
    const db = openMemoryDb();
    const datas: string[] = [];
    for (let ano = 1999; ano <= 2028; ano++) for (const md of ["01-01", "01-31", "02-01", "02-28", "06-15", "12-31"]) datas.push(`${ano}-${md}`);
    const sel = db.prepare(`SELECT ${sqlLegislatura("?")} AS n`);
    for (const d of datas) expect({ d, n: (sel.get(d) as { n: number }).n }).toEqual({ d, n: legislaturaDaData(d) });
  });
});

function votacao(id: string, date: string, party: string, uf = "PE"): ParsedVotacao {
  return {
    chamber: "C",
    svId: id,
    date,
    description: "Votação em turno único.",
    result: "approved",
    nominal: true,
    bill: { id: `C:${id}`, label: "PL 1/2000", ementa: "Ementa" },
    members: [{ id: "C:1", name: "Fulano", party, uf, photo: null }],
    votes: [{ memberId: "C:1", party, vote: "SIM" }],
    orientations: [],
  };
}

describe("histórico por baixo das visões da legislatura atual", () => {
  it("votos de legislaturas antigas existem nas tabelas _all, mas não aparecem nas visões", () => {
    const db = openMemoryDb();
    writeVotacao(db, votacao("100-1", "2011-03-01", "PFL"));
    writeVotacao(db, votacao("200-1", "2024-03-01", "PL"));
    const n = (t: string) => (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
    expect(n("session_vote_all")).toBe(2);
    expect(n("session_vote")).toBe(1);
    expect(n("member_vote_all")).toBe(2);
    expect(n("member_vote")).toBe(1);
    expect((db.prepare("SELECT legislatura FROM session_vote_all WHERE id = 'C:100-1' OR id = '100-1'").get() as { legislatura: number }).legislatura).toBe(54);
  });

  it("quem só votou em legislaturas antigas é ex-parlamentar: fica fora da visão member", () => {
    const db = openMemoryDb();
    writeVotacao(db, votacao("100-1", "2011-03-01", "PFL"));
    expect((db.prepare("SELECT COUNT(*) c FROM member").get() as { c: number }).c).toBe(0);
    expect((db.prepare("SELECT COUNT(*) c FROM member_all").get() as { c: number }).c).toBe(1);
    writeVotacao(db, votacao("200-1", "2024-03-01", "PL"));
    expect((db.prepare("SELECT COUNT(*) c FROM member").get() as { c: number }).c).toBe(1);
  });

  it("importar uma votação antiga depois da atual não troca o partido nem a UF atuais", () => {
    const db = openMemoryDb();
    writeVotacao(db, votacao("200-1", "2024-03-01", "PL", "SP"));
    writeVotacao(db, votacao("100-1", "2011-03-01", "PFL", "PE")); // chega depois, mas é mais antiga
    const m = db.prepare("SELECT party, uf, atual, ultimo_voto FROM member_all WHERE id = 'C:1'").get() as Record<string, unknown>;
    expect(m).toMatchObject({ party: "PL", uf: "SP", atual: 1, ultimo_voto: "2024-03-01" });
    // o partido da época fica no próprio voto
    const antigo = db.prepare("SELECT party_at_time FROM member_vote_all WHERE session_vote_id = '100-1'").get() as { party_at_time: string };
    expect(antigo.party_at_time).toBe("PFL");
  });

  it("importar na ordem cronológica dá o mesmo resultado (último voto vence)", () => {
    const db = openMemoryDb();
    writeVotacao(db, votacao("100-1", "2011-03-01", "PFL", "PE"));
    writeVotacao(db, votacao("200-1", "2024-03-01", "PL", "SP"));
    expect(db.prepare("SELECT party, uf FROM member_all WHERE id = 'C:1'").get()).toMatchObject({ party: "PL", uf: "SP" });
  });

  it("reimportar a mesma votação não duplica nada", () => {
    const db = openMemoryDb();
    writeVotacao(db, votacao("100-1", "2011-03-01", "PFL"));
    writeVotacao(db, votacao("100-1", "2011-03-01", "PFL"));
    expect((db.prepare("SELECT COUNT(*) c FROM member_vote_all").get() as { c: number }).c).toBe(1);
  });
});

describe("lerLegislatura (?leg= em /mandatos)", () => {
  it("sem valor vale a legislatura atual; 'todas' desliga o filtro; valores inválidos voltam para a atual", () => {
    expect(lerLegislatura(undefined)).toBe(LEG_ATUAL);
    expect(lerLegislatura("")).toBe(LEG_ATUAL);
    expect(lerLegislatura("todas")).toBeUndefined();
    expect(lerLegislatura("56")).toBe(56);
    expect(lerLegislatura("52")).toBe(52);
    expect(lerLegislatura("51")).toBe(LEG_ATUAL);
    expect(lerLegislatura("99")).toBe(LEG_ATUAL);
    expect(lerLegislatura("abc")).toBe(LEG_ATUAL);
    expect(lerLegislatura(["55", "56"])).toBe(55);
  });
});
