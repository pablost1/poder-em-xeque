import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../src/lib/db";
import { writeVotacao } from "../scripts/lib/parsed";
import {
  ehCandidata,
  lerRegistros,
  parseVotacaoBulk,
  rotuloProp,
  type BulkVotacao,
  type BulkVoto,
} from "../scripts/lib/parse-camara-bulk";

function arquivoTemporario(conteudo: string): string {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bulk-")), "x.json");
  fs.writeFileSync(f, conteudo);
  return f;
}
async function coletar<T>(f: string): Promise<T[]> {
  const out: T[] = [];
  for await (const r of lerRegistros<T>(f)) out.push(r);
  return out;
}

const dados = [
  { id: "1-1", nota: 'tem "aspas", vírgula,\n e quebra de linha', aninhado: { a: [1, 2, { b: 3 }] } },
  { id: "2-2", nota: "    }", aninhado: {} },
  { id: "3-3", nota: null, aninhado: { x: { y: { z: 1 } } } },
];

describe("lerRegistros", () => {
  it("lê arquivos formatados como os da Câmara, com objetos aninhados e texto difícil", async () => {
    const f = arquivoTemporario(JSON.stringify({ dados }, null, 2));
    expect(await coletar(f)).toEqual(dados);
  });
  it("cai para o JSON inteiro quando o arquivo não está formatado em linhas", async () => {
    const f = arquivoTemporario(JSON.stringify({ dados }));
    expect(await coletar(f)).toEqual(dados);
  });
  it("arquivo sem registros devolve lista vazia", async () => {
    expect(await coletar(arquivoTemporario(JSON.stringify({ dados: [] }, null, 2)))).toEqual([]);
  });
  it("não carrega o arquivo todo: um registro por vez, na ordem", async () => {
    const f = arquivoTemporario(JSON.stringify({ dados: Array.from({ length: 500 }, (_, i) => ({ id: String(i), v: { n: i } })) }, null, 2));
    const ids: string[] = [];
    for await (const r of lerRegistros<{ id: string }>(f)) ids.push(r.id);
    expect(ids).toHaveLength(500);
    expect(ids[0]).toBe("0");
    expect(ids[499]).toBe("499");
  });
});

const vot = (over: Partial<BulkVotacao> = {}): BulkVotacao => ({
  id: "100-1",
  data: "2011-04-27",
  siglaOrgao: "PLEN",
  aprovacao: 1,
  votosSim: 300,
  votosNao: 50,
  votosOutros: 2,
  descricao: "Aprovado o requerimento.",
  ultimaAberturaVotacao: { descricao: "Votação em turno único." },
  ...over,
});

describe("ehCandidata", () => {
  it("só plenário, com voto individual, dentro do período", () => {
    expect(ehCandidata(vot(), "2011-02-01", "2011-12-31")).toBe(true);
    expect(ehCandidata(vot({ siglaOrgao: "CCJC" }), "2011-02-01", "2011-12-31")).toBe(false);
    expect(ehCandidata(vot({ votosSim: 0, votosNao: 0, votosOutros: 0 }), "2011-02-01", "2011-12-31")).toBe(false);
    expect(ehCandidata(vot({ votosSim: null, votosNao: null, votosOutros: 1 }), "2011-02-01", "2011-12-31")).toBe(true);
    expect(ehCandidata(vot({ data: "2010-12-31" }), "2011-02-01", "2011-12-31")).toBe(false);
    expect(ehCandidata(vot({ data: "2023-02-07" }), "2003-02-01", "2023-01-31")).toBe(false);
    expect(ehCandidata(vot({ data: "2023-01-31" }), "2003-02-01", "2023-01-31")).toBe(true);
  });
});

const voto = (id: number, v: string, partido: string | null = "PFL"): BulkVoto => ({
  idVotacao: "100-1",
  voto: v,
  deputado_: { id: String(id), nome: `Dep ${id}`, siglaPartido: partido, siglaUf: "PR", urlFoto: null },
});

describe("parseVotacaoBulk", () => {
  it("converte votos e mantém o partido da época; Artigo 17 (presidente) não é voto Sim/Não", () => {
    const p = parseVotacaoBulk(vot(), [voto(1, "Sim"), voto(2, "Não", "PT"), voto(3, "Abstenção"), voto(4, "Artigo 17", "PMDB")], {
      id: 104471, titulo: "PL 62/2003", ementa: "Ementa X", siglaTipo: "PL", numero: 62, ano: 2003,
    })!;
    expect(p.svId).toBe("C:100-1");
    expect(p.date).toBe("2011-04-27");
    expect(p.description).toBe("Votação em turno único."); // a abertura da votação vence a descrição do resultado
    expect(p.result).toBe("approved");
    expect(p.nominal).toBe(true);
    expect(p.bill).toEqual({ id: "C:104471", label: "PL 62/2003", ementa: "Ementa X" });
    expect(p.votes.map((v) => [v.memberId, v.party, v.vote])).toEqual([
      ["C:1", "PFL", "SIM"],
      ["C:2", "PT", "NAO"],
      ["C:3", "PFL", "ABS"],
      ["C:4", "PMDB", "OUTRO"],
    ]);
    expect(p.orientations).toEqual([]);
  });
  it("usa a descrição do resultado quando não há abertura; resultado desconhecido vira null", () => {
    const p = parseVotacaoBulk(vot({ ultimaAberturaVotacao: null, aprovacao: null }), [voto(1, "Sim")], null)!;
    expect(p.description).toBe("Aprovado o requerimento.");
    expect(p.result).toBeNull();
    expect(p.bill).toBeNull();
    expect(parseVotacaoBulk(vot({ aprovacao: 0 }), [voto(1, "Sim")], null)!.result).toBe("rejected");
  });
  it("sem votos individuais devolve null (votação simbólica)", () => {
    expect(parseVotacaoBulk(vot(), [], null)).toBeNull();
  });
  it("o resultado grava no banco como legislatura antiga e fica fora das visões", () => {
    const db = openMemoryDb();
    writeVotacao(db, parseVotacaoBulk(vot(), [voto(1, "Sim"), voto(2, "Não", "PT")], null)!);
    expect((db.prepare("SELECT legislatura FROM session_vote_all").get() as { legislatura: number }).legislatura).toBe(54);
    expect((db.prepare("SELECT COUNT(*) c FROM session_vote").get() as { c: number }).c).toBe(0);
    expect((db.prepare("SELECT COUNT(*) c FROM member_vote_all").get() as { c: number }).c).toBe(2);
  });
});

describe("rotuloProp", () => {
  it("usa tipo número/ano; cai para o título quando falta o ano", () => {
    expect(rotuloProp({ id: 1, ementa: null, siglaTipo: "PEC", numero: 45, ano: 2019 })).toBe("PEC 45/2019");
    expect(rotuloProp({ id: 1, ementa: null, siglaTipo: "PPP", numero: 1, titulo: "PPP 1 MPV50210 => MPV 502/2010" })).toBe(
      "PPP 1 MPV50210 => MPV 502/2010",
    );
  });
});
