import { describe, expect, it } from "vitest";
import { fmtData, fmtNum, fmtPct, plural } from "../src/lib/format";
import { proposicaoOficial, urlProposicao } from "../src/lib/links";
import { EIXOS, colunaDoEixo, eixoPorSlug } from "../src/lib/eixos";
import { normalizeVote } from "../src/lib/db";

describe("format", () => {
  it("formata datas ISO sem mexer em fuso", () => {
    expect(fmtData("2026-11-23")).toBe("23/11/2026");
    expect(fmtData("2026-11-23T23:59:00")).toBe("23/11/2026");
    expect(fmtData(null)).toBe("–");
  });
  it("formata números e percentuais em pt-BR", () => {
    expect(fmtNum(1234567)).toBe("1.234.567");
    expect(fmtNum(null)).toBe("–");
    expect(fmtPct(0.987)).toBe("99%");
    expect(fmtPct(0.987, 1)).toBe("98,7%");
  });
  it("concorda singular e plural", () => {
    expect(plural(1, "voto")).toBe("1 voto");
    expect(plural(2, "voto")).toBe("2 votos");
    expect(plural(1, "parlamentar", "parlamentares")).toBe("1 parlamentar");
    expect(plural(3, "parlamentar", "parlamentares")).toBe("3 parlamentares");
  });
});

describe("links oficiais", () => {
  it("monta a URL da Câmara e do Senado a partir do id", () => {
    expect(urlProposicao("C:2196833")).toBe("https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2196833");
    expect(urlProposicao("S:158930")).toBe("https://www25.senado.leg.br/web/atividade/materias/-/materia/158930");
    expect(proposicaoOficial("S:1")?.nome).toBe("Senado Federal");
  });
  it("devolve null para ids inválidos", () => {
    expect(urlProposicao(null)).toBeNull();
    expect(urlProposicao("X:1")).toBeNull();
    expect(urlProposicao("C:abc")).toBeNull();
    expect(urlProposicao("C:12; DROP")).toBeNull();
  });
});

describe("eixos", () => {
  it("tem três eixos com slug único e coluna correspondente", () => {
    expect(EIXOS.map((e) => e.slug)).toEqual(["estado", "mercado", "privilegios"]);
    expect(colunaDoEixo(eixoPorSlug("estado")!)).toBe("left_pct");
    expect(colunaDoEixo(eixoPorSlug("mercado")!)).toBe("right_pct");
    expect(colunaDoEixo(eixoPorSlug("privilegios")!)).toBe("privilege_pct");
    expect(eixoPorSlug("nada")).toBeUndefined();
  });
});

describe("normalizeVote", () => {
  it("normaliza rótulos da Câmara e do Senado", () => {
    expect(normalizeVote("Sim")).toBe("SIM");
    expect(normalizeVote("Não")).toBe("NAO");
    expect(normalizeVote("Abstenção")).toBe("ABS");
    expect(normalizeVote("Obstrução")).toBe("OBS");
    expect(normalizeVote("Artigo 17")).toBe("OUTRO");
  });
  it("trata como não-voto os rótulos de ausência do Senado", () => {
    for (const l of ["P-NRV", "AP", "LS", "NCom", "MIS", "LP", "NA", "LAP", "Presidente (art. 51 RISF)", "Votou"]) {
      expect(["SIM", "NAO", "ABS", "OBS"]).not.toContain(normalizeVote(l));
    }
  });
});
