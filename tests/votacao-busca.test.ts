import { beforeAll, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { deriveBusca, deriveCore, deriveIv } from "../src/lib/derive";
import {
  buscarParlamentares,
  buscarProjetos,
  ftsQuery,
  getProjeto,
  getVotacao,
  memberVsMember,
  useDb,
  votacaoOrientacoes,
  votacaoPorPartido,
  votacaoVotos,
  votacoesDoProjeto,
} from "../src/lib/queries";
import { votacaoIdDoSlug, votacaoSlug } from "../src/components/votacao-link";
import { buildFixture } from "./fixtures";

let db: DatabaseSync;
beforeAll(() => {
  db = buildFixture();
  // dados para a busca: resumo e tema de um projeto, e um parlamentar com acento
  db.prepare("INSERT INTO bill_info (bill_id, source, topic, summary) VALUES ('C:B1001', 'llm', 'taxes', 'Reforma tributária simplificada')").run();
  db.prepare("UPDATE bill SET keywords = 'imposto, consumo' WHERE id = 'C:B1001'").run();
  db.prepare("INSERT INTO member (id, chamber, name, party, uf) VALUES ('C:jose', 'C', 'José Álvaro', 'A', 'PE')").run();
  deriveCore(db);
  deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 }); // também monta os índices de busca
  useDb(db);
});

describe("ids de votação nas URLs", () => {
  it("ida e volta sem perder os hífens do resto do id", () => {
    expect(votacaoSlug("C:2655570-57")).toBe("C-2655570-57");
    expect(votacaoIdDoSlug("C-2655570-57")).toBe("C:2655570-57");
    expect(votacaoIdDoSlug(votacaoSlug("S:7117"))).toBe("S:7117");
  });
});

describe("página de votação", () => {
  it("traz a votação com projeto, tema e marcação", () => {
    const v = getVotacao("C:100-1")!;
    expect(v).toMatchObject({ chamber: "C", bill_id: "C:B1001", bill_label: "PL 1/2025", topic: "taxes", economic: 0.6, procedural: 0 });
    expect(getVotacao("C:nao-existe")).toBeUndefined();
  });
  it("agrupa os votos por partido, com posição e orientação do partido", () => {
    const rows = votacaoPorPartido("C:100-1");
    expect(rows.map((r) => r.party)).toEqual(["A", "B", "C"]); // total 3, 3, 2
    expect(rows[0]).toMatchObject({ sim: 2, nao: 1, abs: 0, total: 3, pos: "SIM", orientacao: "Sim" });
    expect(rows[1]).toMatchObject({ sim: 0, nao: 3, pos: "NAO", orientacao: "Não" });
    expect(rows[2]).toMatchObject({ sim: 1, nao: 1, pos: null, orientacao: null }); // empate: sem posição
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(8);
  });
  it("orientações de bancada (Governo etc.) separadas das de partido", () => {
    expect(votacaoOrientacoes("C:100-1")).toEqual([{ key: "Governo", orientation: "Sim" }]);
    expect(votacaoOrientacoes("S:200")).toEqual([]);
  });
  it("lista os votos individuais com filtro e total", () => {
    const { rows, total } = votacaoVotos("C:100-1", { vote: "SIM", limit: 10, offset: 0 });
    expect(total).toBe(3);
    expect(rows.map((r) => r.name)).toEqual(["A1", "A2", "C1"]);
    expect(votacaoVotos("C:100-1", { party: "B", limit: 10, offset: 0 }).total).toBe(3);
    expect(votacaoVotos("C:100-1", { limit: 3, offset: 3 }).rows).toHaveLength(3); // paginação
  });
});

describe("página de projeto", () => {
  it("traz o projeto e suas votações nominais com placar", () => {
    expect(getProjeto("C:B1001")).toMatchObject({ label: "PL 1/2025", summary: "Reforma tributária simplificada", topic: "taxes" });
    const v = votacoesDoProjeto("C:B1001");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ id: "C:100-1", sim: 3, nao: 5 });
  });
});

describe("busca", () => {
  it("ftsQuery vira prefixos entre aspas e neutraliza operadores", () => {
    expect(ftsQuery("reforma tributária")).toBe('"reforma"* "tributária"*');
    expect(ftsQuery("   ")).toBeNull();
    expect(ftsQuery('a" OR "b')).toBe('"a"* "OR"* "b"*');
    expect(ftsQuery("PEC 45/2019")).toBe('"PEC"* "45"* "2019"*');
  });
  it("acha projeto por palavra sem se importar com acento ou maiúsculas, também por prefixo e palavra-chave", () => {
    expect(buscarProjetos("TRIBUTARIA", { limit: 10 }).map((p) => p.bill_id)).toContain("C:B1001");
    expect(buscarProjetos("tribut", { limit: 10 }).map((p) => p.bill_id)).toContain("C:B1001");
    expect(buscarProjetos("imposto", { limit: 10 }).map((p) => p.bill_id)).toEqual(["C:B1001"]); // palavra-chave
    expect(buscarProjetos("palavra-que-nao-existe", { limit: 10 })).toEqual([]);
  });
  it("filtra por casa e por tema, e traz contagem de votações", () => {
    const todos = buscarProjetos("projeto", { limit: 50 });
    expect(todos.length).toBeGreaterThan(1);
    expect(buscarProjetos("projeto", { casa: "S", limit: 50 }).every((p) => p.bill_id.startsWith("S:"))).toBe(true);
    expect(buscarProjetos("projeto", { topic: "taxes", limit: 50 }).map((p) => p.bill_id)).toEqual(["C:B1001"]);
    expect(todos.find((p) => p.bill_id === "C:B1001")).toMatchObject({ votacoes: 1 });
  });
  it("acha parlamentar sem acento e por prefixo do nome", () => {
    expect(buscarParlamentares("jose", 10).map((m) => m.name)).toEqual(["José Álvaro"]);
    expect(buscarParlamentares("ÁLVARO", 10).map((m) => m.id)).toEqual(["C:jose"]);
    expect(buscarParlamentares("jo", 10).map((m) => m.id)).toContain("C:jose");
  });
  it("reconstruir o índice é idempotente", () => {
    deriveBusca(db);
    deriveBusca(db);
    expect(buscarProjetos("tributaria", { limit: 10 })).toHaveLength(1);
  });
});

describe("parlamentar × parlamentar", () => {
  it("conta votações em comum (Sim/Não nos dois) e divergências primeiro", () => {
    // a1 × b1: v1 (S×N), v2 (S×N), v3 (N×N), v4 (S×S), v5 (S×S)
    const r = memberVsMember("C:a1", "C:b1");
    expect({ shared: r.shared, same: r.same }).toEqual({ shared: 5, same: 3 });
    expect(r.votes.slice(0, 2).every((v) => v.vote_a !== v.vote_b)).toBe(true);
    expect(r.votes.slice(2).every((v) => v.vote_a === v.vote_b)).toBe(true);
  });
  it("é simétrico", () => {
    const x = memberVsMember("C:a1", "C:b1"), y = memberVsMember("C:b1", "C:a1");
    expect({ shared: x.shared, same: x.same }).toEqual({ shared: y.shared, same: y.same });
  });
  it("ignora votações em que um dos dois se absteve ou não votou", () => {
    // c2 absteve-se em v3 e a3 não votou em v4: sobram v1, v2 e v5, e nelas votaram igual
    const r = memberVsMember("C:a3", "C:c2");
    expect({ shared: r.shared, same: r.same }).toEqual({ shared: 3, same: 3 });
  });
  it("casas diferentes não têm votações em comum", () => {
    expect(memberVsMember("C:a1", "S:s1").shared).toBe(0);
  });
});

describe("listMembers com busca por nome", () => {
  it("ignora acento e maiúsculas", async () => {
    const { listMembers } = await import("../src/lib/queries");
    expect(listMembers({ q: "jose alvaro" }).map((m) => m.id)).toEqual(["C:jose"]);
    expect(listMembers({ q: "ÁLVARO" }).map((m) => m.id)).toEqual(["C:jose"]);
    expect(listMembers({ q: "zzz" })).toEqual([]);
  });
});
