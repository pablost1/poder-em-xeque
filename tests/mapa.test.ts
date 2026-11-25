import { describe, expect, it } from "vitest";
import { calcularMapa, orientar, spearman, type Entrada } from "../src/lib/mapa";

/** Dois blocos que sempre votam opostos entre si, mais um membro "de centro" que mistura. */
function sintetico(): Entrada[] {
  const out: Entrada[] = [];
  const A = ["a1", "a2", "a3", "a4", "a5"];
  const B = ["b1", "b2", "b3", "b4", "b5"];
  for (let v = 0; v < 30; v++) {
    const lado = v % 2 === 0 ? 1 : -1; // A vota `lado`, B vota o oposto
    for (const m of A) out.push({ membro: m, votacao: `v${v}`, valor: lado as 1 | -1 });
    for (const m of B) out.push({ membro: m, votacao: `v${v}`, valor: (-lado) as 1 | -1 });
    out.push({ membro: "meio", votacao: `v${v}`, valor: (v % 4 < 2 ? 1 : -1) as 1 | -1 });
  }
  return out;
}
const OPC = { minVotantes: 5, minMinoria: 0.025, minVotosMembro: 10 };

describe("calcularMapa", () => {
  const r = calcularMapa(sintetico(), OPC);
  const por = new Map(r.pontos.map((p) => [p.id, p]));

  it("separa os dois blocos opostos na primeira dimensão", () => {
    const sinal = (id: string) => Math.sign(por.get(id)!.d1);
    expect(new Set(["a1", "a2", "a3", "a4", "a5"].map(sinal)).size).toBe(1);
    expect(new Set(["b1", "b2", "b3", "b4", "b5"].map(sinal)).size).toBe(1);
    expect(sinal("a1")).toBe(-sinal("b1"));
  });
  it("a primeira dimensão explica quase toda a variação neste caso", () => {
    expect(r.var1).toBeGreaterThan(0.8);
    expect(r.var1 + r.var2).toBeLessThanOrEqual(1 + 1e-9);
  });
  it("é determinístico", () => {
    const r2 = calcularMapa(sintetico(), OPC);
    expect(r2.pontos).toEqual(r.pontos);
  });
  it("coordenadas ficam entre −1 e 1", () => {
    for (const p of r.pontos) {
      expect(Math.abs(p.d1)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(p.d2)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it("descarta votações unânimes e parlamentares com poucos votos", () => {
    const extra: Entrada[] = [...sintetico()];
    for (const m of ["a1", "a2", "a3", "b1", "b2", "b3", "meio"]) extra.push({ membro: m, votacao: "unanime", valor: 1 });
    extra.push({ membro: "raro", votacao: "v0", valor: 1 }); // só 1 voto
    const r3 = calcularMapa(extra, OPC);
    expect(r3.votacoesUsadas).toBe(30); // a unânime (minoria 0%) não entra
    expect(r3.pontos.some((p) => p.id === "raro")).toBe(false);
  });
  it("com dados de menos devolve vazio sem quebrar", () => {
    expect(calcularMapa([{ membro: "x", votacao: "v", valor: 1 }], OPC).pontos).toEqual([]);
  });
});

describe("orientar", () => {
  it("põe o grupo positivo do lado positivo, não importa o sinal de partida", () => {
    const r = calcularMapa(sintetico(), OPC);
    const A = new Set(["a1", "a2", "a3", "a4", "a5"]);
    const B = new Set(["b1", "b2", "b3", "b4", "b5"]);
    const o1 = orientar(r, A, B);
    const o2 = orientar(r, B, A);
    expect(o1.pontos.find((p) => p.id === "a1")!.d1).toBeGreaterThan(0);
    expect(o2.pontos.find((p) => p.id === "b1")!.d1).toBeGreaterThan(0);
    // inverter os grupos inverte exatamente o sinal
    expect(o1.pontos.find((p) => p.id === "a1")!.d1).toBeCloseTo(-o2.pontos.find((p) => p.id === "a1")!.d1);
  });
});

describe("spearman", () => {
  it("1, −1 e 0 nos casos conhecidos", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 2, 3, 4, 5], [2, 4, 1, 5, 3])!).toBeCloseTo(0.3); // 1 − 6·14 / (5·24)
  });
  it("trata empates com posto médio", () => {
    expect(spearman([1, 1, 2, 3], [1, 2, 3, 4])!).toBeCloseTo(0.9487, 3);
  });
  it("devolve null quando não dá para calcular", () => {
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});
