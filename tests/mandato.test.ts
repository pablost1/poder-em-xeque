import { describe, expect, it } from "vitest";
import {
  NATUREZAS_DESFECHO,
  NATUREZA_INFO,
  agruparPorLegislatura,
  classificarMandatoCamara,
  classificarMandatoSenado,
  type EventoMandato,
  type Natureza,
} from "../src/lib/mandato";

// Textos oficiais exatamente como a API de dados abertos da Câmara os devolve (/deputados/{id}/historico).
const POSSE_TITULAR = "Entrada - Posse de Eleito Titular - Posse na Sessão Preparatória";
const POSSE_SUPLENTE = "Entrada - Posse de Suplente - Posse como Suplente";
const REASSUNCAO = "Entrada - Reassunção";
const TERMINO = "Saída - Afastamento definitivo - Término da Legislatura";
const ev = (data: string, situacao: string | null, descricao: string, condicao: string | null = "Titular"): EventoMandato => ({ data, situacao, condicao, descricao });
const nat = (e: EventoMandato[], legislatura: number, emExercicio = false) => classificarMandatoCamara(e, { legislatura, emExercicio });

describe("classificarMandatoCamara: como terminou o mandato", () => {
  it("cumprido: posse e término da legislatura", () => {
    const m = nat([ev("2011-02-01", "Exercício", POSSE_TITULAR), ev("2015-01-31", "FIM_MANDATO", TERMINO)], 54);
    expect(m).toMatchObject({ natureza: "cumprido", condicao: "Titular", inicio: "2011-02-01", fim: "2015-01-31", motivo: "Término da Legislatura" });
  });

  it("cassado só quando o registro diz Perda de Mandato por Resolução; linhas de ruído depois não desfazem (Cunha, 2016)", () => {
    const m = nat(
      [
        ev("2015-02-01", "Exercício", POSSE_TITULAR),
        ev("2016-05-05", "SUSPENSO", "Saída - Afastamento com prazo determinado - Suspensão"),
        ev("2016-09-13", "VACANCIA", "Saída - Afastamento definitivo - Perda de Mandato por Resolução"),
        ev("2018-05-21", "VACANCIA", "Alteração de partido"),
      ],
      55,
    );
    expect(m).toMatchObject({ natureza: "cassado", fim: "2016-09-13", motivo: "Perda de Mandato por Resolução" });
    expect(m.licencas.map((l) => l.motivo)).toEqual(["Suspensão"]);
  });

  it("ato da Mesa NÃO é cassação (Dallagnol, 2023) e uma pessoa fora do cargo na legislatura atual não vira 'em exercício'", () => {
    const m = nat(
      [ev("2023-02-01", "Exercício", POSSE_TITULAR), ev("2023-06-06", "VACANCIA", "Saída - Afastamento definitivo - Perda de Mandato por Ato da Mesa")],
      57,
      false,
    );
    expect(m.natureza).toBe("perda_ato_mesa");
    expect(m.natureza).not.toBe("cassado");
    expect(NATUREZA_INFO.perda_ato_mesa.explicacao).toMatch(/Não é a mesma coisa que cassação/);
  });

  it("recontagem de votos não é cassação; se a pessoa volta depois, a saída deixa de valer", () => {
    const sai = ev("2022-05-01", "VACANCIA", "DIVERSO - Decisão da Mesa - Perda de Mandato por Recontagem de Votos");
    expect(nat([ev("2019-02-01", "Exercício", POSSE_TITULAR), sai], 56).natureza).toBe("recontagem");
    expect(nat([ev("2019-02-01", "Exercício", POSSE_TITULAR), sai, ev("2022-06-01", "Exercício", REASSUNCAO)], 56).natureza).toBe("indefinido");
  });

  it("renúncia, falecimento e aposentadoria", () => {
    const base = ev("2011-02-01", "Exercício", POSSE_TITULAR);
    expect(nat([base, ev("2012-03-01", "VACANCIA", "Saída - Afastamento definitivo - Renúncia")], 54).natureza).toBe("renunciou");
    expect(nat([base, ev("2012-03-01", "VACANCIA", "Saída - Afastamento definitivo - Falecimento")], 54).natureza).toBe("faleceu");
    expect(nat([base, ev("2012-03-01", "VACANCIA", "Saída - Afastamento definitivo - Aposentadoria")], 54).natureza).toBe("aposentou");
  });

  it("em exercício só na legislatura atual e só se a lista oficial confirmar", () => {
    const e = [ev("2023-02-01", "Exercício", POSSE_TITULAR)];
    expect(nat(e, 57, true).natureza).toBe("em_exercicio");
    expect(nat(e, 57, false).natureza).toBe("indefinido");
    expect(nat(e, 56, true).natureza).toBe("indefinido"); // legislatura passada sem saída registrada
  });

  it("licenças contam, mas não mudam o fim: ministro de Estado e depois término = cumprido com 1 licença (Lira, 54ª)", () => {
    const m = nat(
      [
        ev("2011-02-01", "Exercício", POSSE_TITULAR),
        ev("2013-12-11", "Licença", "Saída - Afastamento com prazo determinado - Licença para Tratar de Interesse Particular"),
        ev("2014-04-12", "Exercício", REASSUNCAO),
        ev("2015-01-31", "FIM_MANDATO", TERMINO),
      ],
      54,
    );
    expect(m.natureza).toBe("cumprido");
    expect(m.licencas).toEqual([{ data: "2013-12-11", motivo: "Licença para Tratar de Interesse Particular" }]);
  });

  it("terminou licenciado, sem saída registrada: 'licenciado' com o motivo oficial", () => {
    const m = nat([ev("2011-02-01", "Exercício", POSSE_TITULAR), ev("2012-01-10", "Licença", "Saída - Afastamento sem prazo determinado - Ministro de Estado")], 54);
    expect(m).toMatchObject({ natureza: "licenciado", motivo: "Ministro de Estado" });
  });

  it("suplente: condição Suplente; suplência encerrada quando o titular volta, e cumprido se chegou ao fim", () => {
    const s = [ev("2019-05-01", "Exercício", POSSE_SUPLENTE, "Suplente"), ev("2019-09-01", "SUPLENCIA", "Saída - Afastamento sem prazo determinado - Afastamento de Suplente (automático)", "Suplente")];
    expect(nat(s, 56)).toMatchObject({ natureza: "suplencia_encerrada", condicao: "Suplente" });
    expect(nat([...s, ev("2023-01-31", "FIM_MANDATO", TERMINO, "Suplente")], 56)).toMatchObject({ natureza: "cumprido", condicao: "Suplente" });
  });

  it("convocado que recusou: não assumiu", () => {
    const m = nat(
      [ev("2019-02-01", "CONVOCADO", "DIVERSO - Convocação Eleito ou Suplente", "Suplente"), ev("2019-03-01", "SUPLENCIA", "DIVERSO - Negativas de Recusa de Convocação - Impossibilidade de Assumir o Mandato", "Suplente")],
      56,
    );
    expect(m.natureza).toBe("nao_assumiu");
  });

  it("motivo de saída desconhecido vira 'indefinido' em vez de inventar categoria; sem eventos também", () => {
    const m = nat([ev("2011-02-01", "Exercício", POSSE_TITULAR), ev("2012-03-01", "VACANCIA", "Saída - Afastamento definitivo - Motivo Novo Qualquer")], 54);
    expect(m.natureza).toBe("indefinido");
    expect(nat([], 54).natureza).toBe("indefinido");
  });

  it("toda natureza tem rótulo, explicação e tom; só 'cassado' usa a palavra cassado", () => {
    for (const [k, v] of Object.entries(NATUREZA_INFO)) {
      expect(v.rotulo.length).toBeGreaterThan(3);
      expect(v.explicacao.length).toBeGreaterThan(10);
      expect(["ok", "neutro", "aviso", "grave"]).toContain(v.tom);
      if (k !== "cassado") expect(v.rotulo.toLowerCase()).not.toContain("cassad");
    }
    const n: Natureza = "cassado";
    expect(NATUREZA_INFO[n].rotulo).toBe("Cassado");
  });

  it("agrupa eventos por legislatura e ignora os sem legislatura", () => {
    const g = agruparPorLegislatura([{ legislatura: 54, x: 1 }, { legislatura: 55, x: 2 }, { legislatura: null, x: 3 }, { legislatura: 54, x: 4 }]);
    expect([...g.keys()]).toEqual([54, 55]);
    expect(g.get(54)).toHaveLength(2);
  });
});

describe("classificarMandatoSenado: mandato de 8 anos em duas legislaturas", () => {
  const renan = [{ inicio: "2011-02-01", fim: "2019-01-31", causa: "TER", descricao: "Término do mandato" }];
  it("a primeira legislatura de um mandato de 8 anos segue 'em curso'; a segunda é 'cumprido'", () => {
    expect(classificarMandatoSenado(renan, { legislatura: 54, emExercicio: false, participacao: "Titular", mandatoAte: "2019-01-31" }).natureza).toBe("em_curso");
    const l55 = classificarMandatoSenado(renan, { legislatura: 55, emExercicio: false, participacao: "Titular", mandatoAte: "2019-01-31" });
    expect(l55).toMatchObject({ natureza: "cumprido", condicao: "Titular", fim: "2019-01-31" });
  });
  it("renúncia e perda de mandato com o texto oficial; suplente identificado", () => {
    const ren = [{ inicio: "2015-02-01", fim: "2016-04-10", causa: "REN", descricao: "Renúncia" }];
    expect(classificarMandatoSenado(ren, { legislatura: 55, emExercicio: false, participacao: "1º Suplente", mandatoAte: "2023-01-31" })).toMatchObject({ natureza: "renunciou", condicao: "Suplente", motivo: "Renúncia" });
    const per = [{ inicio: "2011-02-01", fim: "2012-07-11", causa: "PER", descricao: "Perda de mandato" }];
    expect(classificarMandatoSenado(per, { legislatura: 54, emExercicio: false, participacao: "Titular", mandatoAte: "2019-01-31" }).natureza).toBe("perda_mandato");
  });
  it("licença de saúde entra na lista de licenças; retorno do titular encerra a suplência sem virar renúncia", () => {
    const ex = [
      { inicio: "2019-02-01", fim: "2019-05-01", causa: "LSP", descricao: "Licença Saúde-Particular" },
      { inicio: "2019-05-02", fim: "2023-01-31", causa: "TER", descricao: "Término do mandato" },
    ];
    const m = classificarMandatoSenado(ex, { legislatura: 56, emExercicio: false, participacao: "Titular", mandatoAte: "2023-01-31" });
    expect(m.natureza).toBe("cumprido");
    expect(m.licencas).toEqual([{ data: "2019-05-01", motivo: "Licença Saúde-Particular" }]);
    const ret = [{ inicio: "2019-02-01", fim: "2019-06-01", causa: "RET", descricao: "Retorno do titular" }];
    expect(classificarMandatoSenado(ret, { legislatura: 56, emExercicio: false, participacao: "1º Suplente", mandatoAte: "2027-01-31" }).natureza).toBe("suplencia_encerrada");
    // o titular (não suplente) sem saída registrada e com mandato que segue continua "em curso"
    expect(classificarMandatoSenado([{ inicio: "2019-02-01", fim: null, causa: null, descricao: null }], { legislatura: 56, emExercicio: false, participacao: "Titular", mandatoAte: "2027-01-31" }).natureza).toBe("em_curso");
  });
  it("causas do Senado: falecimento, cassação de diploma pela Justiça Eleitoral (decisão judicial, não cassação) e retorno do titular", () => {
    const op = { legislatura: 53, emExercicio: false, participacao: "Titular", mandatoAte: "2015-01-31" };
    expect(classificarMandatoSenado([{ inicio: "2007-02-01", fim: "2009-11-04", causa: "CAS", descricao: "Cassação de registro/diploma pela Justiça Eleitoral" }], op)).toMatchObject({ natureza: "decisao_judicial", motivo: "Cassação de registro/diploma pela Justiça Eleitoral" });
    expect(classificarMandatoSenado([{ inicio: "2007-02-01", fim: "2008-02-01", causa: "FAL", descricao: "Falecimento" }], op).natureza).toBe("faleceu");
    const sup = { ...op, participacao: "2º Suplente" };
    const m = classificarMandatoSenado([{ inicio: "2009-09-09", fim: "2010-01-02", causa: "RET", descricao: "Retorno do titular" }], sup);
    expect(m).toMatchObject({ natureza: "suplencia_encerrada", condicao: "Suplente", fim: "2010-01-02" });
    // licença com convocação de suplente conta como licença
    const lcs = classificarMandatoSenado([{ inicio: "2007-02-01", fim: "2008-01-01", causa: "LCS", descricao: "Licença com convocação de suplente (sup 120 dias)" }, { inicio: "2008-01-02", fim: "2011-01-31", causa: "TER", descricao: "Término do mandato" }], op);
    expect(lcs.licencas).toHaveLength(1);
  });
  it("em exercício na legislatura atual só com a lista oficial", () => {
    const ex = [{ inicio: "2023-02-01", fim: null, causa: null, descricao: null }];
    expect(classificarMandatoSenado(ex, { legislatura: 57, emExercicio: true, participacao: "Titular", mandatoAte: "2031-01-31" }).natureza).toBe("em_exercicio");
  });
});

describe("em exercício não é um desfecho", () => {
  it("fica fora das opções de 'como terminou', mas as demais naturezas continuam lá", () => {
    expect(NATUREZAS_DESFECHO).not.toContain("em_exercicio");
    for (const n of ["cumprido", "cassado", "perda_ato_mesa", "renunciou", "faleceu", "suplencia_encerrada", "em_curso", "indefinido"] as const) {
      expect(NATUREZAS_DESFECHO).toContain(n);
    }
    expect(NATUREZAS_DESFECHO.length).toBe(Object.keys(NATUREZA_INFO).length - 1);
  });
  it("a etiqueta de quem está no cargo diz 'Legislatura atual' e explica que é a situação de hoje", () => {
    expect(NATUREZA_INFO.em_exercicio.rotulo).toBe("Legislatura atual");
    expect(NATUREZA_INFO.em_exercicio.explicacao).toMatch(/não um desfecho/);
  });
});
