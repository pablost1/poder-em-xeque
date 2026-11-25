/* eslint-disable @typescript-eslint/no-explicit-any -- ajudantes de teste com linhas de formato livre */
import { beforeAll, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { deriveCore, deriveIv } from "../src/lib/derive";
import { buildFixture } from "./fixtures";

let db: DatabaseSync;
const all = (sql: string, ...p: any[]) => (db.prepare(sql).all(...p) as any[]).map((r) => ({ ...r }));
const one = (sql: string, ...p: any[]) => {
  const r = db.prepare(sql).get(...p) as any;
  return r ? { ...r } : undefined;
};

beforeAll(() => {
  db = buildFixture();
  deriveCore(db);
  // Fixture pequena: baixa o mínimo de votos para as barras aparecerem.
  deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 });
});

describe("posição do partido", () => {
  const pos = (sv: string, party: string) => one("SELECT pos, yes, no, cohesion FROM party_position WHERE sv = ? AND party = ?", sv, party);

  it("é a maioria dos votantes Sim/Não", () => {
    expect(pos("C:100-1", "A")).toMatchObject({ pos: "SIM", yes: 2, no: 1 });
    expect(pos("C:100-1", "A")!.cohesion).toBeCloseTo(2 / 3);
    expect(pos("C:100-1", "B")).toMatchObject({ pos: "NAO", yes: 0, no: 3, cohesion: 1 });
  });
  it("empate não gera posição", () => {
    expect(pos("C:100-1", "C")).toBeUndefined(); // 1 Sim, 1 Não
    expect(pos("C:100-4", "A")).toBeUndefined(); // 1 Sim, 1 Não
  });
  it("exige pelo menos dois votantes Sim/Não (abstenção não conta)", () => {
    expect(pos("C:100-3", "C")).toBeUndefined(); // c1 Não, c2 abstenção
  });
  it("não cruza casas nem inventa posição para o Senado com um só votante", () => {
    expect(pos("S:200", "A")).toMatchObject({ pos: "SIM", yes: 2 });
    expect(pos("S:200", "B")).toBeUndefined();
  });
});

describe("concordância entre partidos", () => {
  it("conta votações em que ambos têm posição, por casa", () => {
    // v1 (SIM×NAO), v2 (SIM×NAO), v3 (NAO×NAO), v5 (SIM×SIM); v4 sem posição de A
    expect(one("SELECT shared, same FROM party_agreement WHERE chamber='C' AND a='A' AND b='B'")).toEqual({ shared: 4, same: 2 });
    expect(one("SELECT shared FROM party_agreement WHERE chamber='S' AND a='A' AND b='B'")).toBeUndefined();
  });
  it("guarda cada par uma vez (a < b)", () => {
    const rows = all("SELECT a, b FROM party_agreement");
    expect(rows.every((r) => r.a < r.b)).toBe(true);
    expect(new Set(rows.map((r) => `${r.a}|${r.b}`)).size).toBe(rows.length);
  });
});

describe("parlamentar × partido", () => {
  const ag = (m: string, p: string) => one("SELECT shared, same FROM member_party_agreement WHERE member_id = ? AND party = ?", m, p);

  it("compara o voto com a posição de outro partido", () => {
    // a1 × B: v1 (Sim×Não), v2 (Sim×Não), v3 (Não×Não), v4 (Sim×Sim), v5 (Sim×Sim)
    expect(ag("C:a1", "B")).toEqual({ shared: 5, same: 3 });
    // a1 × C: só v2 e v5 (nas demais C não tem posição)
    expect(ag("C:a1", "C")).toEqual({ shared: 2, same: 2 });
  });
  it("no próprio partido tira o voto do parlamentar da contagem (leave-one-out)", () => {
    // v1: sem o a1, A fica 1×1 (empate) → fora. v4: sobra 1 votante → fora. Valem v2, v3 e v5.
    expect(ag("C:a1", "A")).toEqual({ shared: 3, same: 3 });
    expect(one("SELECT shared, same FROM member_loyalty WHERE member_id = 'C:a1'")).toEqual({ shared: 3, same: 3 });
  });
  it("não conta votações em que o parlamentar se absteve", () => {
    // c2: v1 Não (A=Sim, difere), v2 Sim (igual), v5 Sim (igual); v3 foi abstenção e fica de fora
    expect(ag("C:c2", "A")).toEqual({ shared: 3, same: 2 });
  });
});

describe("perfil de votação (barras)", () => {
  const iv = (m: string) => one("SELECT * FROM member_iv WHERE member_id = ?", m);

  it("pondera por |valor| × confiança e soma 100 entre Estado e Mercado", () => {
    // a1: v1 Sim(+0,6·1,0 → mercado 0,6), v2 Sim(−0,5·0,8 → Estado 0,4), v4 Sim(+1,0·0,5 → mercado 0,5)
    const a1 = iv("C:a1");
    expect(a1.left_pct).toBeCloseTo((100 * 0.4) / 1.5);
    expect(a1.right_pct).toBeCloseTo((100 * 1.1) / 1.5);
    expect(a1.left_pct + a1.right_pct).toBeCloseTo(100);
    expect(a1.n_economic).toBe(3);
  });
  it("um Não inverte a direção do voto", () => {
    // b3: v1 Não (empurra para Estado 0,6), v2 Não (empurra para mercado 0,4)
    const b3 = iv("C:b3");
    expect(b3.left_pct).toBeCloseTo(60);
    expect(b3.right_pct).toBeCloseTo(40);
  });
  it("privilégio: Sim em medida pró-privilégio = 100, Não = 0", () => {
    expect(iv("C:b3").privilege_pct).toBeCloseTo(100); // b3 votou Sim em v3
    expect(iv("C:a1").privilege_pct).toBeCloseTo(0); // a1 votou Não em v3
  });
  it("ignora votação procedimental e abstenção", () => {
    // v5 (procedimental) não entra: a1 continua com 3 votos econômicos, não 4
    expect(iv("C:a1").n_economic).toBe(3);
    // c2 se absteve em v3: sem voto de privilégio
    expect(iv("C:c2")?.privilege_pct ?? null).toBeNull();
  });
  it("sem nota quando há menos votos que o mínimo", () => {
    deriveIv(db, undefined, { minEconomic: 10, minPrivilege: 5 });
    expect(iv("C:a1").left_pct).toBeNull();
    expect(iv("C:a1").privilege_pct).toBeNull();
    deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 }); // restaura
    expect(iv("C:a1").left_pct).not.toBeNull();
  });
  it("quem só vota Sim em medidas de mercado fica com Mercado 100", () => {
    // c1: v1 Sim (+0,6 → mercado), v2 Sim (−0,5 → Estado) — não é puro; criamos um caso limpo
    db.prepare("INSERT INTO member (id, chamber, name, party, uf) VALUES ('C:z', 'C', 'Z', 'C', 'PE')").run();
    db.prepare("INSERT INTO member_vote VALUES ('C:100-1', 'C:z', 'C', 'SIM')").run();
    db.prepare("INSERT INTO member_vote VALUES ('C:100-4', 'C:z', 'C', 'SIM')").run();
    deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 });
    expect(iv("C:z").right_pct).toBeCloseTo(100);
    expect(iv("C:z").left_pct).toBeCloseTo(0);
    db.prepare("DELETE FROM member_vote_all WHERE member_id = 'C:z'").run();
    db.prepare("DELETE FROM member_all WHERE id = 'C:z'").run();
    deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 });
  });
  it("a marcação humana tem prioridade sobre a do modelo", () => {
    db.prepare(
      "INSERT INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver) VALUES ('C:100-1', 'human', -0.6, 0, 0, 1.0, 'revisão', 'human')",
    ).run();
    deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 });
    expect(one("SELECT economic, source FROM vote_tag_eff WHERE sv = 'C:100-1'")).toEqual({ economic: -0.6, source: "human" });
    // a1 em v1 agora empurra para o Estado: Estado = (0,6 + 0,4) / 1,5
    expect(iv("C:a1").left_pct).toBeCloseTo((100 * 1.0) / 1.5);
    db.prepare("DELETE FROM vote_tag WHERE sv = 'C:100-1' AND source = 'human'").run();
    deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 });
    expect(iv("C:a1").left_pct).toBeCloseTo((100 * 0.4) / 1.5);
  });
});
