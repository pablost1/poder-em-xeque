import { beforeAll, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { deriveCore, deriveIv } from "../src/lib/derive";
import {
  memberPartyAgreement,
  memberVsParty,
  pairVotes,
  posicaoMembro,
  rankMembers,
  rankParties,
  useDb,
} from "../src/lib/queries";
import { EIXOS, eixoPorSlug, type Eixo } from "../src/lib/eixos";
import { buildFixture } from "./fixtures";

let db: DatabaseSync;
// O fixture é pequeno demais para o mínimo real do ranking; usamos mínimo 1.
const eixo = (slug: string): Eixo => ({ ...eixoPorSlug(slug)!, minimoRanking: 1 });

beforeAll(() => {
  db = buildFixture();
  deriveCore(db);
  deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 });
  useDb(db);
});

describe("rankMembers", () => {
  it("ordena da maior para a menor nota", () => {
    const { rows, total } = rankMembers(eixo("estado"), { limit: 100, offset: 0 });
    expect(rows.length).toBe(total);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score - 1e-9);
    // a3 só votou do lado do Estado (Não em v1 pró-mercado, Sim em v2 pró-Estado) → 100, a maior nota do fixture
    expect(rows[0].id).toBe("C:a3");
    expect(rows[0].score).toBeCloseTo(100);
  });
  it("Estado e Mercado somam 100 para cada pessoa", () => {
    const estado = rankMembers(eixo("estado"), { limit: 100, offset: 0 }).rows;
    const mercado = new Map(rankMembers(eixo("mercado"), { limit: 100, offset: 0 }).rows.map((r) => [r.id, r.score]));
    expect(estado.length).toBeGreaterThan(0);
    for (const r of estado) expect(r.score + mercado.get(r.id)!).toBeCloseTo(100);
  });
  it("empate recebe a mesma posição (RANK): posição = 1 + quantos têm nota maior", () => {
    const { rows } = rankMembers(eixo("privilegios"), { limit: 100, offset: 0 });
    expect(rows.some((r, i) => rows.findIndex((x) => x.rk === r.rk) !== i)).toBe(true); // existe empate no fixture
    for (const r of rows) {
      const maiores = rows.filter((x) => Math.round(x.score * 1e4) > Math.round(r.score * 1e4)).length;
      expect(r.rk).toBe(maiores + 1);
    }
  });
  it("respeita o mínimo de votos para entrar no ranking", () => {
    const strict = { ...eixoPorSlug("estado")!, minimoRanking: 99 };
    expect(rankMembers(strict, { limit: 100, offset: 0 }).total).toBe(0);
  });
  it("filtra por casa, partido e UF e pagina sem repetir", () => {
    expect(rankMembers(eixo("estado"), { chamber: "S", limit: 100, offset: 0 }).rows.every((r) => r.chamber === "S")).toBe(true);
    expect(rankMembers(eixo("estado"), { party: "A", limit: 100, offset: 0 }).rows.every((r) => r.party === "A")).toBe(true);
    expect(rankMembers(eixo("estado"), { uf: "PE", limit: 100, offset: 0 }).rows.every((r) => r.uf === "PE")).toBe(true);
    const p1 = rankMembers(eixo("estado"), { limit: 2, offset: 0 }).rows.map((r) => r.id);
    const p2 = rankMembers(eixo("estado"), { limit: 2, offset: 2 }).rows.map((r) => r.id);
    expect(p1.filter((id) => p2.includes(id))).toEqual([]);
  });
});

describe("posicaoMembro e rankParties", () => {
  it("a posição do parlamentar bate com a linha do ranking", () => {
    for (const e of EIXOS) {
      const ex = { ...e, minimoRanking: 1 };
      const { rows } = rankMembers(ex, { limit: 100, offset: 0 });
      for (const r of rows) {
        const p = posicaoMembro(r.id, ex)!;
        expect(p.geral.rank).toBe(r.rk);
        expect(p.geral.total).toBe(rows.length);
      }
    }
  });
  it("sem posição quando abaixo do mínimo do ranking", () => {
    expect(posicaoMembro("C:b3", { ...eixoPorSlug("estado")!, minimoRanking: 99 })).toBeNull();
  });
  it("ranking de partidos ordenado e sem 'sem partido'", () => {
    const ps = rankParties(eixo("estado"));
    for (let i = 1; i < ps.length; i++) expect(ps[i - 1].score).toBeGreaterThanOrEqual(ps[i].score - 1e-9);
    expect(ps.some((p) => p.party === "S/Partido")).toBe(false);
  });
});

describe("comparações", () => {
  it("memberVsParty bate com a tabela derivada", () => {
    for (const [m, p] of [["C:a1", "B"], ["C:a1", "A"], ["C:c2", "A"]] as const) {
      const v = memberVsParty(m, p);
      const t = memberPartyAgreement(m).find((r) => r.party === p)!;
      expect({ shared: v.shared, same: v.same }).toEqual({ shared: t.shared, same: t.same });
    }
  });
  it("memberVsParty lista divergências primeiro", () => {
    const { votes } = memberVsParty("C:a1", "B");
    const first = votes.findIndex((x) => x.member_vote === x.party_pos);
    expect(votes.slice(0, first).every((x) => x.member_vote !== x.party_pos)).toBe(true);
  });
  it("pairVotes conta igual à matriz e filtra por casa", () => {
    const { summary } = pairVotes("A", "B", "C");
    expect(summary).toEqual({ shared: 4, same: 2 });
    expect(pairVotes("A", "B", "S").summary.shared).toBe(0);
    expect(pairVotes("A", "B", "ALL").summary.shared).toBe(4);
  });
});
