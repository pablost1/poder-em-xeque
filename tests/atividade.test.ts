import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../src/lib/db";
import { atividadeDoMandato, autoriaDoMandato, comissoesDoMandato, useDb as ligarBanco } from "../src/lib/queries";
import { autoresPorProposicao, ehComissao, ehProponente, idDoDeputadoAutor, rotuloProposicao } from "../scripts/lib/parse-atividade";
import { ingestComissoes } from "../scripts/ingest-atividade";

const dep = (id: number) => `https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`;

describe("parse-atividade", () => {
  it("reconhece só deputados como autores", () => {
    expect(idDoDeputadoAutor(dep(74041))).toBe("C:74041");
    expect(idDoDeputadoAutor("https://dadosabertos.camara.leg.br/api/v2/orgaos/78")).toBeNull();
    expect(idDoDeputadoAutor(null)).toBeNull();
  });
  it("proponente = 1 conta; apoiador não", () => {
    expect(ehProponente({ idProposicao: 1, uriAutor: dep(1), proponente: "1" })).toBe(true);
    expect(ehProponente({ idProposicao: 1, uriAutor: dep(1), proponente: 0 })).toBe(false);
  });
  it("agrupa autores deputados proponentes por proposição, sem repetir", () => {
    const m = autoresPorProposicao([
      { idProposicao: 10, uriAutor: dep(1), proponente: "1" },
      { idProposicao: 10, uriAutor: dep(2), proponente: "1" },
      { idProposicao: 10, uriAutor: dep(1), proponente: "1" },
      { idProposicao: 10, uriAutor: dep(3), proponente: "0" },
      { idProposicao: 11, uriAutor: "https://dadosabertos.camara.leg.br/api/v2/orgaos/78", proponente: "1" },
    ]);
    expect(m.get(10)).toEqual(["C:1", "C:2"]);
    expect(m.has(11)).toBe(false);
  });
  it("rótulo e filtro de comissão", () => {
    expect(rotuloProposicao({ siglaTipo: "PL", numero: 4148, ano: 2023 })).toBe("PL 4148/2023");
    const o = { siglaOrgao: "MESA", nomeOrgao: "Mesa", cargo: "Presidente", dataInicio: "2023-02-01", dataFim: null, uriDeputado: dep(1) };
    expect(ehComissao(o)).toBe(false);
    expect(ehComissao({ ...o, siglaOrgao: "CCJC" })).toBe(true);
  });
});

function base() {
  const db = openMemoryDb();
  ligarBanco(db);
  const ins = db.prepare("INSERT INTO autoria (member_id, legislatura, prop_id, tipo, numero, ano, ementa, apresentacao, url, coautores, arquivo_ano) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  ins.run("C:1", 57, 1, "PL", 10, 2023, "a", "2023-03-01", null, 0, 2023);
  ins.run("C:1", 57, 2, "PL", 11, 2023, "b", "2023-05-01", null, 2, 2023);
  ins.run("C:1", 57, 3, "PEC", 5, 2024, "c", "2024-01-10", null, 0, 2024);
  ins.run("C:1", 57, 5, "REQ", 99, 2024, "requerimento", "2024-02-10", null, 0, 2024);
  ins.run("C:1", 56, 4, "PL", 1, 2020, "d", "2020-01-10", null, 0, 2020);
  const com = db.prepare("INSERT INTO member_comissao (member_id, legislatura, sigla, nome, cargo, inicio, fim) VALUES (?,?,?,?,?,?,?)");
  com.run("C:1", 57, "CCJC", "Constituição e Justiça", "Titular", "2023-03-01", "2023-12-31");
  com.run("C:1", 57, "CCJC", "Constituição e Justiça", "Presidente", "2024-03-01", null);
  com.run("C:1", 57, "CFT", "Finanças", "Suplente", "2023-03-01", "2024-01-01");
  return db;
}

describe("consultas de atividade", () => {
  it("conta projetos por tipo só da legislatura pedida", () => {
    base();
    const a = atividadeDoMandato("C:1", 57);
    expect(a.projetos).toBe(3);
    expect(a.outras).toBe(1); // o requerimento não conta como projeto
    expect(a.porTipo).toEqual([{ tipo: "PL", n: 2 }, { tipo: "PEC", n: 1 }]);
    expect(atividadeDoMandato("C:1", 56).projetos).toBe(1);
    expect(atividadeDoMandato("C:9", 57).projetos).toBe(0);
  });
  it("lista a autoria da mais recente para a mais antiga, com paginação", () => {
    base();
    expect(autoriaDoMandato("C:1", 57, 10, 0).map((r) => r.prop_id)).toEqual([3, 2, 1]);
    expect(autoriaDoMandato("C:1", 57, 1, 1).map((r) => r.prop_id)).toEqual([2]);
  });
  it("junta os cargos de uma mesma comissão e põe presidência primeiro", () => {
    base();
    const c = comissoesDoMandato("C:1", 57);
    expect(c.map((x) => x.sigla)).toEqual(["CCJC", "CFT"]);
    expect(c[0].cargos).toEqual(["Titular", "Presidente"]);
    expect(c[0].inicio).toBe("2023-03-01");
    expect(c[0].fim).toBeNull(); // um dos cargos ainda está aberto
    expect(c[1].fim).toBe("2024-01-01");
    expect(atividadeDoMandato("C:1", 57).comissoes).toBe(2);
    expect(atividadeDoMandato("C:1", 57).presidiu).toBe(1);
  });
});

describe("ingestComissoes", () => {
  it("é função exportada (importação real é testada nos dados)", () => {
    expect(typeof ingestComissoes).toBe("function");
  });
});
