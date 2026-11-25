import { beforeAll, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { deriveCore } from "../src/lib/derive";
import { memberAlinhamento, partyGoverno, useDb } from "../src/lib/queries";
import { buildFixture } from "./fixtures";

let db: DatabaseSync;
beforeAll(() => {
  db = buildFixture();
  deriveCore(db);
  useDb(db);
});

/*
 * Orientações do fixture: Governo v1 Sim, v2 Não, v3 Liberado (ignorada), v4 Sim.
 */
describe("alinhamento com o Governo", () => {
  it("conta só votações com orientação clara e em que o parlamentar votou Sim/Não", () => {
    // a1: v1 Sim=Sim ✓, v2 Sim≠Não ✗, v3 liberado (fora), v4 Sim=Sim ✓
    expect(memberAlinhamento("C:a1").governo).toEqual({ shared: 3, same: 2 });
    // b1: v1 Não≠Sim ✗, v2 Não=Não ✓, v4 Sim=Sim ✓
    expect(memberAlinhamento("C:b1").governo).toEqual({ shared: 3, same: 2 });
  });
  it("o partido soma os votos dos seus parlamentares", () => {
    // a1 (3,2) + a2 (3,1) + a3 (2,0)
    expect(partyGoverno("A")).toEqual({ shared: 8, same: 3 });
  });
  it("Senado não tem orientação: sem dados, não zero", () => {
    expect(memberAlinhamento("S:s1")).toEqual({ governo: null });
  });
});
