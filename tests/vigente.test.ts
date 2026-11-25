import { beforeAll, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openMemoryDb } from "../src/lib/db";
import { deriveIv } from "../src/lib/derive";
import { buscarParlamentares, buscarParlamentaresTodos, getMember, getMemberHistorico, legislaturasDoMembro, listMembers, listMembersTodos, useDb } from "../src/lib/queries";
import { lerVigente } from "../src/components/legislatura-vigente";
import { writeVotacao, type ParsedVotacao } from "../scripts/lib/parsed";

function v(id: string, date: string, quem: { id: string; nome: string; partido: string }[]): ParsedVotacao {
  return {
    chamber: "C", svId: id, date, description: "Votação em turno único.", result: "approved", nominal: true,
    bill: { id: `C:${id}`, label: "PL 1/2000", ementa: "x" },
    members: quem.map((m) => ({ id: m.id, name: m.nome, party: m.partido, uf: "PE", photo: null })),
    votes: quem.map((m) => ({ memberId: m.id, party: m.partido, vote: "SIM" as const })),
    orientations: [],
  };
}

let db: DatabaseSync;
beforeAll(() => {
  db = openMemoryDb();
  // Maria votou em 2011 (54ª) e em 2024 (57ª); João só em 2011 (ex-parlamentar); Ana só em 2024.
  writeVotacao(db, v("1-1", "2011-05-01", [{ id: "C:maria", nome: "Maria Silva", partido: "PFL" }, { id: "C:joao", nome: "João Álvaro", partido: "PMDB" }]));
  writeVotacao(db, v("2-1", "2013-05-01", [{ id: "C:joao", nome: "João Álvaro", partido: "MDB" }]));
  writeVotacao(db, v("3-1", "2024-05-01", [{ id: "C:maria", nome: "Maria Silva", partido: "UNIÃO" }, { id: "C:ana", nome: "Ana Souza", partido: "PT" }]));
  deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 }); // também monta os índices de busca
  useDb(db);
});

describe("legislatura vigente (padrão) x todas", () => {
  it("a lista padrão só tem quem está em exercício; ex-parlamentares ficam de fora", () => {
    expect(listMembers({}).map((m) => m.id).sort()).toEqual(["C:ana", "C:maria"]);
    expect(getMember("C:joao")).toBeUndefined();
  });
  it("sem a opção vigente a lista inclui ex-parlamentares, marcados como não atuais", () => {
    const todos = listMembersTodos({});
    expect(todos.map((m) => m.id).sort()).toEqual(["C:ana", "C:joao", "C:maria"]);
    const joao = todos.find((m) => m.id === "C:joao")!;
    expect(joao.atual).toBe(0);
    expect(joao.ultima_leg).toBe(54);
    expect(joao.votes).toBe(2);
    expect(todos.find((m) => m.id === "C:maria")!.atual).toBe(1);
    // os votos de Maria contam todas as legislaturas na lista completa
    expect(todos.find((m) => m.id === "C:maria")!.votes).toBe(2);
    expect(listMembers({}).find((m) => m.id === "C:maria")!.votes).toBe(1); // na lista padrão, só a atual
  });
  it("busca por nome ignora acento e respeita a opção", () => {
    expect(buscarParlamentares("joao").map((m) => m.id)).toEqual([]);
    expect(buscarParlamentaresTodos("joao").map((m) => m.id)).toEqual(["C:joao"]);
    expect(buscarParlamentares("maria").map((m) => m.id)).toEqual(["C:maria"]);
    expect(buscarParlamentaresTodos("maria").map((m) => m.id)).toEqual(["C:maria"]);
  });
  it("filtros de casa e partido valem nas duas listas", () => {
    expect(listMembersTodos({ chamber: "S" })).toEqual([]);
    expect(listMembersTodos({ party: "MDB" }).map((m) => m.id)).toEqual(["C:joao"]); // partido do voto mais recente
  });
  it("a página de ex-parlamentar encontra a pessoa e as legislaturas em que votou", () => {
    expect(getMemberHistorico("C:joao")?.name).toBe("João Álvaro");
    expect(getMemberHistorico("C:nao-existe")).toBeUndefined();
    const l = legislaturasDoMembro("C:joao");
    expect(l.map((x) => [x.legislatura, x.votos, x.partido])).toEqual([[54, 2, "PMDB"]]);
    const m = legislaturasDoMembro("C:maria");
    expect(m.map((x) => [x.legislatura, x.partido])).toEqual([[57, "UNIÃO"], [54, "PFL"]]);
    expect(m[1].primeira).toBe("2011-05-01");
  });
});

describe("lerVigente", () => {
  it("é ligado por padrão e só desliga com 0; com a caixa marcada o formulário envia 0 e 1", () => {
    expect(lerVigente(undefined)).toBe(true);
    expect(lerVigente("1")).toBe(true);
    expect(lerVigente("0")).toBe(false);
    expect(lerVigente(["0", "1"])).toBe(true);
    expect(lerVigente(["0"])).toBe(false);
  });
});
