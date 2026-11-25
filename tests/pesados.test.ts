import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../src/lib/db";
import { deriveIv } from "../src/lib/derive";
import { useDb, votosPesados } from "../src/lib/queries";
import { writeVotacao, type ParsedVotacao } from "../scripts/lib/parsed";

type V = "SIM" | "NAO" | "ABS";
function vot(id: string, date: string, n: { sim: number; nao: number; abs: number }): ParsedVotacao {
  const quem: [string, V][] = [];
  for (let i = 0; i < n.sim; i++) quem.push([`C:s${id}${i}`, "SIM"]);
  for (let i = 0; i < n.nao; i++) quem.push([`C:n${id}${i}`, "NAO"]);
  for (let i = 0; i < n.abs; i++) quem.push([`C:a${id}${i}`, "ABS"]);
  return {
    chamber: "C", svId: `C:${id}`, date, description: "Votação em turno único.", result: "approved", nominal: true,
    bill: { id: `C:${id}`, label: `PL ${id}`, ementa: "x" },
    members: quem.map(([m]) => ({ id: m, name: m, party: "PT", uf: "PE", photo: null })),
    votes: quem.map(([m, v]) => ({ memberId: m, party: "PT", vote: v })),
    orientations: [],
  };
}

describe("votosPesados: influência = max(|e|,|p|) × confiança × votantes Sim/Não", () => {
  const db = openMemoryDb();
  // 54ª legislatura (2012): v1 tem 10 votantes (6+4; 3 abstenções não contam), v2 tem 20, v3 é procedimental, v4 é fraca demais
  writeVotacao(db, vot("1-1", "2012-03-01", { sim: 6, nao: 4, abs: 3 }));
  writeVotacao(db, vot("2-1", "2012-03-02", { sim: 12, nao: 8, abs: 0 }));
  writeVotacao(db, vot("3-1", "2012-03-03", { sim: 30, nao: 30, abs: 0 }));
  writeVotacao(db, vot("4-1", "2012-03-04", { sim: 40, nao: 40, abs: 0 }));
  writeVotacao(db, vot("5-1", "2024-03-01", { sim: 5, nao: 5, abs: 0 })); // outra legislatura (57ª)
  const tag = (sv: string, e: number, p: number, proc: number, c: number) =>
    `('${sv}','llm',${e},${p},${proc},${c},'x','r1')`;
  db.exec(`INSERT INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver) VALUES
    ${tag("C:1-1", 0.6, 0, 0, 0.5)}, ${tag("C:2-1", 0, -0.8, 0, 0.5)}, ${tag("C:3-1", 0.9, 0, 1, 0.9)},
    ${tag("C:4-1", 0.1, 0.2, 0, 0.9)}, ${tag("C:5-1", 0.9, 0, 0, 1)}`);
  deriveIv(db, undefined, { minEconomic: 1, minPrivilege: 1 });
  useDb(db);

  it("ordena pela influência: v2 = 0,8 × 0,5 × 20 = 8; v1 = 0,6 × 0,5 × 10 = 3 (abstenções não contam)", () => {
    const r = votosPesados(54, 10, 0);
    expect(r.map((x) => x.sv)).toEqual(["C:2-1", "C:1-1"]);
    expect(r[0].influencia).toBeCloseTo(8, 6);
    expect(r[0].votantes).toBe(20);
    expect(r[1].influencia).toBeCloseTo(3, 6);
    expect(r[1].votantes).toBe(10);
  });
  it("não inclui procedimentais, marcações abaixo dos limites (|e|<0,2 e |p|<0,3) nem outras legislaturas", () => {
    const todas = votosPesados(54, 10, 0).map((x) => x.sv);
    expect(todas).not.toContain("C:3-1"); // procedimental
    expect(todas).not.toContain("C:4-1"); // e=0,1 e p=0,2: abaixo dos limites
    expect(todas).not.toContain("C:5-1"); // 57ª
    expect(votosPesados(57, 10, 0).map((x) => x.sv)).toEqual(["C:5-1"]);
  });
  it("paginação", () => {
    expect(votosPesados(54, 1, 0).map((x) => x.sv)).toEqual(["C:2-1"]);
    expect(votosPesados(54, 1, 1).map((x) => x.sv)).toEqual(["C:1-1"]);
  });
});
