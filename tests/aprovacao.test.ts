import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../src/lib/db";
import { aprovacaoDoMandato, comparacaoAprovacao, useDb as ligarBanco } from "../src/lib/queries";
import { grupoDaSituacao } from "../scripts/lib/parse-atividade";

describe("grupoDaSituacao", () => {
  it("agrupa os andamentos reais da Câmara", () => {
    expect(grupoDaSituacao("Transformado em Norma Jurídica")).toBe("lei");
    expect(grupoDaSituacao("Aguardando Apreciação pelo Senado Federal")).toBe("senado");
    expect(grupoDaSituacao("Enviada ao Senado Federal")).toBe("senado");
    expect(grupoDaSituacao("Vetado totalmente")).toBe("veto");
    expect(grupoDaSituacao("Arquivada")).toBe("arquivada");
    expect(grupoDaSituacao("Perdeu a Eficácia")).toBe("arquivada");
    expect(grupoDaSituacao("Retirado pelo(a) Autor(a)")).toBe("retirada");
    expect(grupoDaSituacao("Devolvida ao(à) Autor(a)")).toBe("retirada");
    expect(grupoDaSituacao("Tramitando em Conjunto")).toBe("tramitando");
    expect(grupoDaSituacao("Aguardando Designação de Relator(a)")).toBe("tramitando");
    expect(grupoDaSituacao("Pronta para Pauta")).toBe("tramitando");
    expect(grupoDaSituacao("")).toBe("outra");
    expect(grupoDaSituacao("<Não Definido>")).toBe("outra");
    expect(grupoDaSituacao(null)).toBe("outra");
    expect(grupoDaSituacao("Transformado em nova proposição")).toBe("outra");
  });
  it("ignora acento e caixa", () => {
    expect(grupoDaSituacao("TRANSFORMADO EM NORMA JURIDICA")).toBe("lei");
    expect(grupoDaSituacao("aguardando apreciacao pelo senado federal")).toBe("senado");
  });
});

function ins(db: ReturnType<typeof openMemoryDb>, id: string, leg: number, prop: number, tipo: string, grupo: string | null) {
  db.prepare(
    "INSERT INTO autoria (member_id, legislatura, prop_id, tipo, numero, ano, ementa, apresentacao, url, coautores, arquivo_ano, situacao, situacao_data, grupo_situacao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, leg, prop, tipo, prop, 2023, "x", "2023-05-01", null, 0, 2023, null, null, grupo);
}

/**
 * C:1 na 57ª: 10 projetos = 5 PL (2 leis, 1 arquivado, 2 tramitando) + 3 PEC (1 aguardando o Senado, 2 arquivadas)
 *             + 2 PDL (1 lei, 1 retirado) → 3 leis de 10 = 30%.
 * Mais um requerimento (não é projeto) e um projeto de outra legislatura, que não entram.
 */
function montar() {
  const db = openMemoryDb();
  ligarBanco(db);
  let n = 1;
  for (const g of ["lei", "lei", "arquivada", "tramitando", "tramitando"]) ins(db, "C:1", 57, n++, "PL", g);
  for (const g of ["senado", "arquivada", "arquivada"]) ins(db, "C:1", 57, n++, "PEC", g);
  for (const g of ["lei", "retirada"]) ins(db, "C:1", 57, n++, "PDL", g);
  ins(db, "C:1", 57, n++, "REQ", "lei"); // requerimento: fora
  ins(db, "C:1", 56, n++, "PL", "lei"); // outra legislatura: fora
  return db;
}

describe("aprovacaoDoMandato", () => {
  it("taxa de projetos que viraram lei, por situação e por tipo", () => {
    montar();
    const a = aprovacaoDoMandato("C:1", 57);
    expect(a.coletado).toBe(true);
    expect(a.propostos).toBe(10);
    expect(a.leis).toBe(3);
    expect(a.taxa).toBeCloseTo(0.3, 10);
    expect(a.porSituacao).toEqual([
      { grupo: "lei", n: 3, pct: 0.3 },
      { grupo: "senado", n: 1, pct: 0.1 },
      { grupo: "tramitando", n: 2, pct: 0.2 },
      { grupo: "arquivada", n: 3, pct: 0.3 },
      { grupo: "retirada", n: 1, pct: 0.1 },
    ]);
    expect(a.porTipo).toEqual([
      { tipo: "PL", n: 5, pct: 0.5, leis: 2, taxaLei: 0.4 },
      { tipo: "PEC", n: 3, pct: 0.3, leis: 0, taxaLei: 0 },
      { tipo: "PDL", n: 2, pct: 0.2, leis: 1, taxaLei: 0.5 },
    ]);
  });
  it("mandato sem projetos: coletado, zero e sem taxa", () => {
    montar();
    expect(aprovacaoDoMandato("C:9", 57)).toMatchObject({ coletado: true, propostos: 0, taxa: null });
  });
  it("situação ainda não importada não vira 0% de aprovação", () => {
    const db = openMemoryDb();
    ligarBanco(db);
    ins(db, "C:5", 57, 1, "PL", null);
    expect(aprovacaoDoMandato("C:5", 57).coletado).toBe(false);
  });
});

describe("comparacaoAprovacao", () => {
  it("considera só quem tem pelo menos 10 projetos", () => {
    const db = montar(); // C:1: 3 de 10 = 30%
    let n = 100;
    for (let i = 0; i < 10; i++) ins(db, "C:2", 57, n++, "PL", i < 1 ? "lei" : "arquivada"); // 10%
    for (let i = 0; i < 9; i++) ins(db, "C:3", 57, n++, "PL", "lei"); // 9 projetos: fora
    const c = comparacaoAprovacao(57)!;
    expect(c.n).toBe(2);
    expect(c.media).toBeCloseTo(0.2, 10);
    expect(c.mediana).toBeCloseTo(0.2, 10);
  });
});
