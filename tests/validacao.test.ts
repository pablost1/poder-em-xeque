import { describe, expect, it } from "vitest";
import { fmtRho, leituraValidacao } from "../src/lib/validacao";

describe("leituraValidacao: o sinal esperado é negativo (PL positivo, PT negativo no mapa)", () => {
  it("faixas nos limites exatos", () => {
    expect(leituraValidacao(-0.86)?.nivel).toBe("forte");
    expect(leituraValidacao(-0.6)?.nivel).toBe("forte");
    expect(leituraValidacao(-0.59)?.nivel).toBe("moderada");
    expect(leituraValidacao(-0.3)?.nivel).toBe("moderada");
    expect(leituraValidacao(-0.29)?.nivel).toBe("fraca");
    expect(leituraValidacao(0)?.nivel).toBe("fraca");
  });
  it("correlação de sinal contrário é 'fraca' e a explicação diz que vai no sentido contrário", () => {
    const l = leituraValidacao(0.29)!;
    expect(l.nivel).toBe("fraca");
    expect(leituraValidacao(0.5)!.explicacao).toMatch(/sentido contrário/);
    expect(leituraValidacao(0.1)!.explicacao).toMatch(/quase não se relaciona/);
    expect(l.explicacao).toMatch(/cautela/);
  });
  it("sem número não há leitura", () => {
    expect(leituraValidacao(null)).toBeNull();
    expect(leituraValidacao(undefined)).toBeNull();
    expect(leituraValidacao(Number.NaN)).toBeNull();
  });
  it("formata em pt-BR com o sinal de menos tipográfico", () => {
    expect(fmtRho(-0.8613)).toBe("−0,86");
    expect(fmtRho(0.27)).toBe("0,27");
    expect(fmtRho(null)).toBe("–");
  });
});
