import { describe, expect, it } from "vitest";
import { alternarPartido, corDoPartidoHistoria, lerPartidos, partidosPadrao, pontoDaCelula } from "../src/lib/historia";
import type { HistoriaCelula } from "../src/lib/queries";

const cel = (over: Partial<HistoriaCelula>): HistoriaCelula => ({
  legislatura: 56, party: "PT", n_votacoes: 100, n_estado: 0, n_mercado: 0, n_priv_mais: 0, n_priv_menos: 0,
  left_pct: null, right_pct: null, privilege_pct: null, ...over,
});

describe("pontoDaCelula: valor, base e lacunas", () => {
  it("eixo Estado usa left_pct e conta votações para o Estado e para o mercado", () => {
    const p = pontoDaCelula(cel({ n_estado: 8, n_mercado: 4, left_pct: 71.5, right_pct: 28.5 }), "estado");
    expect(p.valor).toBe(71.5);
    expect(p.base).toBe(12);
    expect(p.contagens).toEqual([{ rotulo: "para o Estado", n: 8 }, { rotulo: "para o mercado", n: 4 }]);
  });
  it("eixo Mercado usa right_pct, e Estado + Mercado somam 100", () => {
    const c = cel({ n_estado: 6, n_mercado: 6, left_pct: 40, right_pct: 60 });
    expect(pontoDaCelula(c, "mercado").valor).toBe(60);
    expect(pontoDaCelula(c, "estado").valor! + pontoDaCelula(c, "mercado").valor!).toBe(100);
  });
  it("abaixo de 10 votações com direção (economia) vira lacuna; exatamente 10 aparece", () => {
    expect(pontoDaCelula(cel({ n_estado: 5, n_mercado: 4, left_pct: 50 }), "estado").valor).toBeNull();
    expect(pontoDaCelula(cel({ n_estado: 5, n_mercado: 5, left_pct: 50 }), "estado").valor).toBe(50);
    expect(pontoDaCelula(cel({ n_estado: 5, n_mercado: 4, left_pct: 50 }), "estado").base).toBe(9); // a base continua visível
  });
  it("privilégios: mínimo de 5 votações, contando as que ampliariam e as que reduziriam", () => {
    expect(pontoDaCelula(cel({ n_priv_mais: 3, n_priv_menos: 1, privilege_pct: 80 }), "privilegios").valor).toBeNull();
    const p = pontoDaCelula(cel({ n_priv_mais: 3, n_priv_menos: 2, privilege_pct: 62 }), "privilegios");
    expect(p.valor).toBe(62);
    expect(p.contagens).toEqual([{ rotulo: "ampliaria privilégios", n: 3 }, { rotulo: "reduziria privilégios", n: 2 }]);
  });
  it("sem percentual calculado continua lacuna mesmo com base suficiente", () => {
    expect(pontoDaCelula(cel({ n_estado: 20, n_mercado: 20, left_pct: null }), "estado").valor).toBeNull();
  });
});

describe("partidos padrão, URL e cores", () => {
  const cs = [
    cel({ legislatura: 55, party: "PT", n_estado: 10, n_mercado: 10, left_pct: 50, n_votacoes: 500 }),
    cel({ legislatura: 56, party: "PT", n_estado: 10, n_mercado: 10, left_pct: 60, n_votacoes: 300 }),
    cel({ legislatura: 56, party: "PL", n_estado: 10, n_mercado: 10, left_pct: 40, n_votacoes: 400 }),
    cel({ legislatura: 56, party: "XYZ", n_estado: 1, n_mercado: 1, left_pct: 40, n_votacoes: 900 }), // poucos dados: não entra
    cel({ legislatura: 56, party: "PSD", n_estado: 10, n_mercado: 10, left_pct: 45, n_votacoes: 400 }),
  ];
  it("escolhe, na legislatura mais recente com dados, os partidos com mais votações (desempate por nome), sem os de poucos dados", () => {
    expect(partidosPadrao(cs, "estado", 2)).toEqual(["PL", "PSD"]);
    expect(partidosPadrao(cs, "estado")).toEqual(["PL", "PSD", "PT"]);
    expect(partidosPadrao([], "estado")).toEqual([]);
  });
  it("lê ?partido= ignorando o que não existe e repetições; alterna ligando e desligando", () => {
    const ex = new Set(["PT", "PL"]);
    expect(lerPartidos("PT, PL,PT,ZZZ", ex)).toEqual(["PT", "PL"]);
    expect(lerPartidos(undefined, ex)).toEqual([]);
    expect(lerPartidos(["PT", "PL"], ex)).toEqual(["PT", "PL"]);
    expect(alternarPartido(["PT"], "PL")).toEqual(["PT", "PL"]);
    expect(alternarPartido(["PT", "PL"], "PT")).toEqual(["PL"]);
  });
  it("a cor de um partido é estável e diferente entre partidos vizinhos", () => {
    const todos = ["PL", "PSD", "PT"];
    expect(corDoPartidoHistoria("PT", todos)).toBe(corDoPartidoHistoria("PT", todos));
    expect(new Set(todos.map((p) => corDoPartidoHistoria(p, todos))).size).toBe(3);
  });
});

import { intervaloWilson, LARGURA_INCERTA } from "../src/lib/historia";

describe("intervaloWilson (valores calculados à mão)", () => {
  it("50% com 100 votações: de 40,4% a 59,6%", () => {
    const i = intervaloWilson(50, 100)!;
    expect(i.min).toBeCloseTo(40.38, 1);
    expect(i.max).toBeCloseTo(59.62, 1);
  });
  it("80% com 10 votações: faixa larga, de 49,0% a 94,3%", () => {
    const i = intervaloWilson(80, 10)!;
    expect(i.min).toBeCloseTo(49.0, 0);
    expect(i.max).toBeCloseTo(94.3, 0);
    expect(i.max - i.min).toBeGreaterThan(LARGURA_INCERTA);
  });
  it("mais base, faixa mais estreita; extremos ficam dentro de 0–100; entradas inválidas dão null", () => {
    expect(intervaloWilson(78, 287)!.max - intervaloWilson(78, 287)!.min).toBeLessThan(intervaloWilson(78, 12)!.max - intervaloWilson(78, 12)!.min);
    const zero = intervaloWilson(0, 20)!;
    expect(zero.min).toBe(0);
    expect(zero.max).toBeGreaterThan(0);
    const cem = intervaloWilson(100, 20)!;
    expect(cem.max).toBe(100);
    expect(intervaloWilson(50, 0)).toBeNull();
    expect(intervaloWilson(-1, 10)).toBeNull();
    expect(intervaloWilson(101, 10)).toBeNull();
  });
  it("pontoDaCelula traz o intervalo só quando há valor e base suficiente", () => {
    const c = cel({ n_estado: 8, n_mercado: 4, left_pct: 71.5, right_pct: 28.5 });
    const p = pontoDaCelula(c, "estado");
    expect(p.intervalo).not.toBeNull();
    expect(p.intervalo!.min).toBeLessThan(71.5);
    expect(p.intervalo!.max).toBeGreaterThan(71.5);
    expect(pontoDaCelula(cel({ n_estado: 3, n_mercado: 3, left_pct: 50 }), "estado").intervalo).toBeNull();
  });
});
