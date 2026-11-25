import { describe, expect, it } from "vitest";
import { LINHAGENS, linhagemDe, partidoCanonico, semPartido, siglasDesconhecidas } from "../src/lib/partidos";

/** As 54 siglas que existiam nos votos de 2003 a 2026 quando a tabela foi montada. */
const SIGLAS_DOS_DADOS = [
  "PT", "PP", "PL", "PSD", "PSDB", "MDB", "PSB", "PMDB", "REPUBLICANOS", "PDT", "PSL", "UNIÃO", "DEM", "PTB", "PR", "PODE",
  "PCdoB", "PSC", "PSOL", "PROS", "SOLIDARIEDADE", "PV", "PRB", "NOVO", "AVANTE", "CIDADANIA", "PPS", "PFL", "PATRIOTA", "SD",
  "REDE", "PHS", "PTN", "PMN", "PRD", "PTdoB", "PEN", "PRP", "S.PART.", "PTC", "SDD", "S/Partido", "PMB", "PATRI", "PRTB",
  "PSDC", "PRONA", "PAN", "PPB", "PPL", "PMR", "MISSÃO", "DC", "Sem registro",
];

describe("linhagens partidárias", () => {
  it("toda sigla que aparece nos dados tem linhagem ou é 'sem partido' (nada some em silêncio)", () => {
    expect(siglasDesconhecidas(SIGLAS_DOS_DADOS)).toEqual([]);
    expect(SIGLAS_DOS_DADOS).toHaveLength(54);
  });
  it("renomeações caem na mesma linhagem", () => {
    expect(partidoCanonico("PMDB")).toBe("MDB");
    expect(partidoCanonico("PFL")).toBe("UNIÃO");
    expect(partidoCanonico("DEM")).toBe("UNIÃO");
    expect(partidoCanonico("PR")).toBe("PL");
    expect(partidoCanonico("PRB")).toBe("REPUBLICANOS");
    expect(partidoCanonico("PPS")).toBe("CIDADANIA");
    expect(partidoCanonico("PTN")).toBe("PODE");
    expect(partidoCanonico("PTdoB")).toBe("AVANTE");
    expect(partidoCanonico("SDD")).toBe("SOLIDARIEDADE");
    expect(partidoCanonico("PSDC")).toBe("DC");
  });
  it("fusões entre partidos distintos não apagam a história: PSL e PTB têm linhagem própria", () => {
    expect(partidoCanonico("PSL")).toBe("PSL");
    expect(partidoCanonico("PSL")).not.toBe(partidoCanonico("UNIÃO"));
    expect(partidoCanonico("PTB")).toBe("PTB");
    expect(partidoCanonico("PRD")).toBe("PRD");
  });
  it("ignora maiúsculas e espaços; 'sem partido' e vazio não têm linhagem", () => {
    expect(partidoCanonico(" pt ")).toBe("PT");
    expect(partidoCanonico("S/Partido")).toBeNull();
    expect(semPartido("S.PART.")).toBe(true);
    expect(semPartido(null)).toBe(true);
    expect(semPartido("PT")).toBe(false);
    expect(linhagemDe(undefined)).toBeNull();
  });
  it("uma sigla desconhecida é denunciada", () => {
    expect(siglasDesconhecidas(["PT", "XYZ", "S/Partido", null, "ABC"])).toEqual(["ABC", "XYZ"]);
  });
  it("nenhuma sigla aparece em duas linhagens e os nomes canônicos são únicos", () => {
    const vistas = new Map<string, string>();
    for (const l of LINHAGENS) {
      expect(l.siglas).toContain(l.canonica);
      for (const s of l.siglas) {
        expect(vistas.has(s.toUpperCase()), `${s} repetida`).toBe(false);
        vistas.set(s.toUpperCase(), l.canonica);
      }
    }
    expect(new Set(LINHAGENS.map((l) => l.canonica)).size).toBe(LINHAGENS.length);
  });
});
