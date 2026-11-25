import { describe, expect, it } from "vitest";
import {
  catEconomica,
  catPrivilegio,
  compararMarcacoes,
  correlacaoDeNotas,
  kappa,
  pontuarMembros,
  type Marca,
  type VotoMembro,
} from "../src/lib/consistencia";

const m = (sv: string, e: number, p = 0, proc = false, c = 0.5): Marca => ({ sv, e, p, proc, c });

describe("categorias", () => {
  it("usam os mesmos limiares das barras (0,2 econômico e 0,3 privilégio)", () => {
    expect(catEconomica(-0.2)).toBe("ESTADO");
    expect(catEconomica(-0.19)).toBe("NEUTRO");
    expect(catEconomica(0.2)).toBe("MERCADO");
    expect(catPrivilegio(0.3)).toBe("PRO");
    expect(catPrivilegio(0.29)).toBe("NEUTRO");
    expect(catPrivilegio(-0.5)).toBe("CONTRA");
  });
});

describe("kappa de Cohen", () => {
  it("1 na concordância total e perto de 0 quando é só acaso", () => {
    expect(kappa([["a", "a"], ["b", "b"], ["a", "a"], ["b", "b"]])).toBeCloseTo(1);
    // mesma distribuição, mas sem relação alguma entre as duas: kappa = 0
    expect(kappa([["a", "a"], ["a", "b"], ["b", "a"], ["b", "b"]])).toBeCloseTo(0);
  });
  it("negativo quando discordam mais que o acaso, e null sem dados ou sem variação", () => {
    expect(kappa([["a", "b"], ["b", "a"], ["a", "b"], ["b", "a"]])!).toBeLessThan(0);
    expect(kappa([])).toBeNull();
    expect(kappa([["a", "a"], ["a", "a"]])).toBeNull();
  });
  it("exemplo calculado à mão", () => {
    // 10 pares; iguais: 4 (x,x) + 3 (y,y) = 7 → po = 0,7. A: x=5, y=5. B: x=6, y=4 → pe = 0,5·0,6 + 0,5·0,4 = 0,5.
    const pares: [string, string][] = [
      ["x", "x"], ["x", "x"], ["x", "x"], ["x", "x"], ["x", "y"],
      ["y", "y"], ["y", "y"], ["y", "y"], ["y", "x"], ["y", "x"],
    ];
    // κ = (0,7 − 0,5) / (1 − 0,5) = 0,4
    expect(kappa(pares)).toBeCloseTo(0.4);
  });
});

describe("compararMarcacoes", () => {
  const a = [m("v1", 0.5), m("v2", -0.5), m("v3", 0), m("v4", 0.6), m("v5", 0, 0, true)];
  const b = [m("v1", 0.4), m("v2", 0.5), m("v3", 0), m("v4", 0), m("v5", 0, 0, true)];

  it("ignora votos procedimentais nas duas e conta divergência de procedimental", () => {
    const r = compararMarcacoes(a, b);
    expect(r.n).toBe(4); // v5 sai
    expect(r.procDiverge).toBe(0);
    const c = compararMarcacoes([m("v1", 0.5, 0, true)], [m("v1", 0.5, 0, false)]);
    expect(c.procDiverge).toBe(1);
    expect(c.n).toBe(0);
  });
  it("acordo, sinal oposto e erro médio da parte econômica", () => {
    const r = compararMarcacoes(a, b);
    // categorias: v1 M/M ✓, v2 E/M ✗, v3 N/N ✓, v4 M/N ✗ → 2 de 4
    expect(r.eco.acordo).toBeCloseTo(0.5);
    expect(r.eco.ambosComDirecao).toBe(2); // v1 e v2
    expect(r.eco.sinalOposto).toBe(1); // v2
    expect(r.eco.erroMedio).toBeCloseTo((0.1 + 1.0 + 0 + 0.6) / 4);
  });
  it("só compara votos presentes nas duas", () => {
    expect(compararMarcacoes([m("x", 1)], [m("y", 1)]).n).toBe(0);
  });
});

describe("pontuarMembros", () => {
  const votos: VotoMembro[] = [
    { membro: "a", vote: "SIM", e: 0.6, p: 0, c: 1 }, // mercado 0,6
    { membro: "a", vote: "SIM", e: -0.5, p: 0, c: 0.8 }, // Estado 0,4
    { membro: "a", vote: "NAO", e: 0, p: 1, c: 1 }, // contra privilégio, peso 1
    { membro: "b", vote: "NAO", e: 0.6, p: 0, c: 1 }, // Estado 0,6
    { membro: "b", vote: "SIM", e: 0, p: 1, c: 1 }, // a favor do privilégio
  ];
  it("aplica a fórmula do perfil: peso = |valor|·confiança, Não inverte", () => {
    const s = pontuarMembros(votos, 1, 1);
    expect(s.get("a")!.estado).toBeCloseTo((100 * 0.4) / 1.0);
    expect(s.get("a")!.privilegio).toBeCloseTo(0);
    expect(s.get("b")!.estado).toBeCloseTo(100);
    expect(s.get("b")!.privilegio).toBeCloseTo(100);
  });
  it("devolve null abaixo do mínimo de votos", () => {
    const s = pontuarMembros(votos, 5, 5);
    expect(s.get("a")).toEqual({ estado: null, privilegio: null });
  });
  it("correlação só entre quem tem nota nos dois", () => {
    const x = pontuarMembros(votos, 1, 1);
    const y = new Map(x);
    y.set("c", { estado: 10, privilegio: 10 });
    expect(correlacaoDeNotas(x, y, "estado").n).toBe(2);
  });
});
