import { describe, expect, it } from "vitest";
import {
  categoriaSenado,
  ehApertada,
  emExercicioNaData,
  maiorSequenciaDeAusencias,
  margemDaVotacao,
  mesDaData,
  periodosDeExercicio,
  taxa,
  tipoDeProposicao,
  type EventoPeriodo,
} from "../src/lib/presenca";

// Textos oficiais como a API da Câmara devolve (/deputados/{id}/historico).
const POSSE = "Entrada - Posse de Eleito Titular - Posse na Sessão Preparatória";
const POSSE_SUPLENTE = "Entrada - Posse de Suplente - Posse como Suplente";
const REASSUNCAO = "Entrada - Reassunção";
const ev = (data: string, situacao: string | null, descricao: string): EventoPeriodo => ({ data, situacao, descricao });

describe("periodosDeExercicio", () => {
  it("Dallagnol (real): posse em 2023-02-01 e perda de mandato em 2023-06-06 = um período fechado", () => {
    const r = periodosDeExercicio([
      ev("2023-02-01", "Exercício", POSSE),
      ev("2023-06-06", "VACANCIA", "Saída - Afastamento definitivo - Perda de Mandato por Ato da Mesa"),
    ]);
    expect(r.periodos).toEqual([{ inicio: "2023-02-01", fim: "2023-06-06", motivoFim: "Perda de Mandato por Ato da Mesa" }]);
    expect(r.fora).toEqual([]);
  });

  it("titular com uma licença: dois períodos e um 'fora' com o motivo oficial, que fecha na reassunção", () => {
    const r = periodosDeExercicio([
      ev("2023-02-01", "Exercício", POSSE),
      ev("2024-01-10", "Licença", "Saída - Afastamento sem prazo determinado - Ministro de Estado"),
      ev("2024-09-02", "Exercício", REASSUNCAO),
    ]);
    expect(r.periodos).toEqual([
      { inicio: "2023-02-01", fim: "2024-01-10", motivoFim: "Ministro de Estado" },
      { inicio: "2024-09-02", fim: null, motivoFim: null },
    ]);
    expect(r.fora).toEqual([{ inicio: "2024-01-10", fim: "2024-09-02", motivo: "Ministro de Estado" }]);
  });

  it("licença ainda aberta: 'fora' sem fim, nenhum período aberto", () => {
    const r = periodosDeExercicio([
      ev("2023-02-01", "Exercício", POSSE),
      ev("2025-03-01", "Licença", "Saída - Afastamento com prazo determinado - Licença para Tratamento de Saúde"),
    ]);
    expect(r.periodos).toEqual([{ inicio: "2023-02-01", fim: "2025-03-01", motivoFim: "Licença para Tratamento de Saúde" }]);
    expect(r.fora).toEqual([{ inicio: "2025-03-01", fim: null, motivo: "Licença para Tratamento de Saúde" }]);
  });

  it("suplente: período da posse até o fim da suplência, e o fim da suplência não vira 'licença'", () => {
    const r = periodosDeExercicio([
      ev("2023-05-10", "Exercício", POSSE_SUPLENTE),
      ev("2023-09-01", "SUPLENCIA", "Saída - Afastamento sem prazo determinado - Afastamento de Suplente (automático)"),
    ]);
    expect(r.periodos).toEqual([{ inicio: "2023-05-10", fim: "2023-09-01", motivoFim: "Afastamento de Suplente (automático)" }]);
    expect(r.fora).toEqual([]);
  });

  it("eventos que só mudam nome ou partido, ou que não têm data, não mexem nos períodos; ordem de entrada não importa", () => {
    const r = periodosDeExercicio([
      ev("2024-01-01", "Exercício", "Alteração de partido"),
      { data: null, situacao: "Exercício", descricao: POSSE },
      ev("2023-02-01", "Exercício", POSSE),
    ]);
    expect(r.periodos).toEqual([{ inicio: "2023-02-01", fim: null, motivoFim: null }]);
  });

  it("emExercicioNaData: início inclusive, fim exclusive", () => {
    const p = [{ inicio: "2023-02-01", fim: "2023-06-06", motivoFim: null }, { inicio: "2024-01-01", fim: null, motivoFim: null }];
    expect(emExercicioNaData("2023-02-01", p)).toBe(true);
    expect(emExercicioNaData("2023-06-05", p)).toBe(true);
    expect(emExercicioNaData("2023-06-06", p)).toBe(false);
    expect(emExercicioNaData("2023-12-31", p)).toBe(false);
    expect(emExercicioNaData("2030-01-01", p)).toBe(true);
  });
});

describe("categoriaSenado (siglas reais da API do Senado)", () => {
  it("cada sigla cai na categoria certa", () => {
    expect(categoriaSenado("Sim")).toBe("votou");
    expect(categoriaSenado("Não")).toBe("votou");
    expect(categoriaSenado("Abstenção")).toBe("votou");
    expect(categoriaSenado("P-NRV")).toBe("presente_sem_voto");
    for (const s of ["AP", "LS", "LP", "MIS", "LG", "LAP", "LA", "REP"]) expect(categoriaSenado(s)).toBe("justificada");
    expect(categoriaSenado("P-OD")).toBe("presente_obstrucao");
    expect(categoriaSenado("MERC")).toBe("outro");
    expect(categoriaSenado("Sim - Presidente Art.48 inciso XXIII")).toBe("presidente");
    expect(categoriaSenado("NCom")).toBe("nao_compareceu");
    expect(categoriaSenado("NA")).toBe("nao_se_aplica");
    expect(categoriaSenado("Presidente (art. 51 RISF)")).toBe("presidente");
    expect(categoriaSenado("XYZ")).toBe("outro");
  });
});

describe("margem, mês, tipo e sequência", () => {
  it("margem: |Sim−Não| ÷ (Sim+Não); apertada abaixo de 10%", () => {
    expect(margemDaVotacao(250, 150)).toBeCloseTo(0.25, 10);
    expect(margemDaVotacao(0, 0)).toBe(1);
    expect(ehApertada(210, 190)).toBe(true); // 20/400 = 5%
    expect(ehApertada(215, 185)).toBe(true); // 30/400 = 7,5%
    expect(ehApertada(220, 180)).toBe(false); // 40/400 = 10% exato: não é menor que 10%
    expect(ehApertada(225, 175)).toBe(false); // 50/400 = 12,5%
    expect(ehApertada(0, 0)).toBe(false);
  });
  it("mês e tipo de proposição", () => {
    expect(mesDaData("2024-03-26")).toBe("2024-03");
    expect(tipoDeProposicao("PEC 45/2019")).toBe("PEC");
    expect(tipoDeProposicao("mpv 1031/2021")).toBe("MPV");
    expect(tipoDeProposicao("PLP 108/2024")).toBe("PLP");
    expect(tipoDeProposicao(null)).toBe("Sem projeto");
    expect(tipoDeProposicao("")).toBe("Sem projeto");
  });
  it("maior sequência de ausências: tamanho, início e fim", () => {
    expect(maiorSequenciaDeAusencias([true, true, true])).toBeNull();
    expect(maiorSequenciaDeAusencias([])).toBeNull();
    expect(maiorSequenciaDeAusencias([true, false, false, true, false, false, false, true])).toEqual({ tamanho: 3, de: 4, ate: 6 });
    expect(maiorSequenciaDeAusencias([false, false, true])).toEqual({ tamanho: 2, de: 0, ate: 1 });
    expect(maiorSequenciaDeAusencias([true, false])).toEqual({ tamanho: 1, de: 1, ate: 1 });
  });
  it("taxa", () => {
    expect(taxa(1, 4)).toBe(0.25);
    expect(taxa(0, 0)).toBeNull();
  });
});
