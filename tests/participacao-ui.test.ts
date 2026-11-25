import { describe, expect, it } from "vitest";
import { faltouMaisNasImportantes, resumoDistribuicao } from "../src/lib/presenca";

describe("faltouMaisNasImportantes", () => {
  it("avisa com 15 pontos de diferença e 20 votações", () => {
    expect(faltouMaisNasImportantes(0.9, 0.75, 20)).toBe(true);
  });
  it("não avisa com 14 pontos de diferença", () => {
    expect(faltouMaisNasImportantes(0.9, 0.76, 40)).toBe(false);
  });
  it("não avisa com menos de 20 votações importantes", () => {
    expect(faltouMaisNasImportantes(0.9, 0.2, 19)).toBe(false);
  });
  it("não avisa sem dados", () => {
    expect(faltouMaisNasImportantes(null, 0.5, 30)).toBe(false);
    expect(faltouMaisNasImportantes(0.9, null, 30)).toBe(false);
  });
});

describe("resumoDistribuicao", () => {
  it("calcula média, mediana, mínimo e máximo", () => {
    const r = resumoDistribuicao([0.5, 1, 0.9, 0.7])!;
    expect(r.n).toBe(4);
    expect(r.media).toBeCloseTo(0.775, 10);
    expect(r.mediana).toBeCloseTo(0.8, 10);
    expect(r.min).toBe(0.5);
    expect(r.max).toBe(1);
  });
  it("mediana de quantidade ímpar é o valor do meio", () => {
    expect(resumoDistribuicao([0.2, 0.9, 0.4])!.mediana).toBe(0.4);
  });
  it("lista vazia devolve null", () => {
    expect(resumoDistribuicao([])).toBeNull();
  });
});

import { openMemoryDb } from "../src/lib/db";
import { taxasDeParticipacao, useDb as ligarBanco } from "../src/lib/queries";

describe("taxasDeParticipacao", () => {
  it("devolve votou ÷ votações, sem a Mesa e sem quem não tem dado", () => {
    const db = openMemoryDb();
    ligarBanco(db);
    db.exec("CREATE TABLE participacao_mandato (member_id TEXT, legislatura INTEGER, votacoes INTEGER, votou INTEGER, cargo_mesa TEXT)");
    const ins = db.prepare("INSERT INTO participacao_mandato VALUES (?, ?, ?, ?, ?)");
    ins.run("C:1", 57, 10, 9, null);
    ins.run("C:2", 57, 10, 5, "Presidente");
    ins.run("C:3", 56, 10, 10, null);
    const m = taxasDeParticipacao(["C:1", "C:2", "C:3", "C:9"], 57);
    expect(m.get("C:1")).toBeCloseTo(0.9, 10);
    expect(m.has("C:2")).toBe(false); // Mesa Diretora
    expect(m.has("C:3")).toBe(false); // outra legislatura
    expect(m.has("C:9")).toBe(false); // sem dado
    expect(taxasDeParticipacao([], 57).size).toBe(0);
  });
});
