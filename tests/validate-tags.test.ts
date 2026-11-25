import { describe, expect, it } from "vitest";
import { aplicarTraducao, validarTags } from "../scripts/lib/validate-tags";

const sv = new Set(["C:1-1", "C:1-2"]);
const bills = new Set(["C:1"]);
const ok = { bills: [{ bill: "C:1", topic: "taxes", summary: "Muda um tributo." }], votes: [{ sv: "C:1-1", e: -0.5, p: 0, proc: false, c: 0.7, why: "x" }] };

describe("validarTags", () => {
  it("aceita um arquivo válido (incluindo os limites)", () => {
    expect(validarTags(ok, sv, bills)).toEqual([]);
    expect(validarTags({ votes: [{ sv: "C:1-1", e: 1, p: -1, proc: true, c: 0 }] }, sv, bills)).toEqual([]);
  });
  it("rejeita valores fora da faixa", () => {
    for (const bad of [{ e: 1.1 }, { e: -1.1 }, { p: 2 }, { c: 1.5 }, { c: -0.1 }]) {
      expect(validarTags({ votes: [{ ...ok.votes[0], ...bad }] }, sv, bills).length).toBe(1);
    }
  });
  it("rejeita NaN e tipo errado em proc", () => {
    expect(validarTags({ votes: [{ ...ok.votes[0], e: NaN }] }, sv, bills)).toHaveLength(1);
    expect(validarTags({ votes: [{ ...ok.votes[0], proc: "sim" as unknown as boolean }] }, sv, bills)).toHaveLength(1);
  });
  it("rejeita ids e temas desconhecidos e resumo vazio", () => {
    expect(validarTags({ votes: [{ ...ok.votes[0], sv: "C:9-9" }] }, sv, bills)).toHaveLength(1);
    expect(validarTags({ bills: [{ bill: "C:9", topic: "taxes", summary: "Resumo ok." }] }, sv, bills)).toHaveLength(1);
    expect(validarTags({ bills: [{ bill: "C:1", topic: "inventado", summary: "Resumo ok." }] }, sv, bills)).toHaveLength(1);
    expect(validarTags({ bills: [{ bill: "C:1", topic: "taxes", summary: "" }] }, sv, bills)).toHaveLength(1);
  });
  it("junta todos os problemas de um arquivo", () => {
    const r = validarTags({ votes: [{ sv: "C:9-9", e: 5, p: 5, proc: false, c: 5 }] }, sv, bills);
    expect(r.length).toBe(4);
  });
});

describe("aplicarTraducao", () => {
  it("troca resumo e justificativa pelos textos em português e mantém os números", () => {
    const r = aplicarTraducao(ok, { bills: { "C:1": "Muda um imposto." }, votes: { "C:1-1": "Sim reduz imposto." } });
    expect(r.bills![0].summary).toBe("Muda um imposto.");
    expect(r.votes![0].why).toBe("Sim reduz imposto.");
    expect(r.votes![0]).toMatchObject({ e: -0.5, p: 0, c: 0.7, proc: false });
  });
  it("sem tradução, mantém o texto original", () => {
    expect(aplicarTraducao(ok, {})).toEqual(ok);
    expect(aplicarTraducao(ok, { bills: { "C:9": "outro" } }).bills![0].summary).toBe(ok.bills[0].summary);
  });
});
