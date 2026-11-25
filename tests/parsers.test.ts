/* eslint-disable @typescript-eslint/no-explicit-any -- ajudantes de teste com linhas de formato livre */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseVotacaoCamara } from "../scripts/lib/parse-camara";
import { parseVotacaoSenado } from "../scripts/lib/parse-senado";
import { windows, writeVotacao } from "../scripts/lib/parsed";
import { openMemoryDb } from "../src/lib/db";

const sample = (f: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "samples", f), "utf8"));

describe("parser da Câmara (amostra real, votação 2655570-57)", () => {
  const s = sample("camara-votacao.json");
  const p = parseVotacaoCamara(s.item, s.detail, s.votos, s.orientacoes);

  it("monta ids com prefixo da casa e data AAAA-MM-DD", () => {
    expect(p.chamber).toBe("C");
    expect(p.svId).toBe("C:2655570-57");
    expect(p.date).toBe("2026-11-23");
    expect(p.nominal).toBe(true);
  });
  it("liga a votação à proposição e monta o rótulo", () => {
    expect(p.bill).toMatchObject({ id: "C:2655570", label: "PLP 299/2026" });
  });
  it("normaliza os votos e guarda o partido do momento", () => {
    expect(p.votes.map((v) => v.vote)).toEqual(["SIM", "SIM", "NAO", "NAO", "OBS", "OBS"]);
    expect(p.votes.every((v) => v.memberId.startsWith("C:"))).toBe(true);
    expect(p.members).toHaveLength(6);
  });
  it("converte orientações: P = partido, B = bloco/governo", () => {
    const gov = p.orientations.find((o) => o.key === "Governo");
    expect(gov).toEqual({ key: "Governo", kind: "bloc", orientation: "Sim" });
    // orientações em branco (PSB e MISSÃO nesta amostra) são descartadas
    expect(p.orientations.map((o) => o.key).sort()).toEqual(["Bl UniPpPsd...", "Fdr PSOL-REDE", "Governo", "Minoria"]);
    const comLider = parseVotacaoCamara(s.item, s.detail, s.votos, {
      dados: [{ orientacaoVoto: "Não", codTipoLideranca: "P", siglaPartidoBloco: "PSB" }],
    });
    expect(comLider.orientations).toEqual([{ key: "PSB", kind: "party", orientation: "Não" }]);
  });
  it("sem votos individuais, a votação não é nominal; detalhe ausente usa a listagem", () => {
    const vazio = parseVotacaoCamara(s.item, { dados: [] }, { dados: [] }, { dados: [] });
    expect(vazio.nominal).toBe(false);
    expect(vazio.date).toBe("2026-11-23");
    expect(vazio.bill).toBeNull();
    expect(vazio.result).toBeNull();
  });
  it("resultado: aprovacao 1 → approved, 0 → rejected", () => {
    const mk = (aprovacao: number | null) => parseVotacaoCamara(s.item, { dados: { ...s.detail.dados, aprovacao } }, s.votos, s.orientacoes).result;
    expect(mk(1)).toBe("approved");
    expect(mk(0)).toBe("rejected");
    expect(mk(null)).toBeNull();
  });
});

describe("parser do Senado (amostra real)", () => {
  const s = sample("senado-votacao.json");

  it("guarda só Sim/Não/Abstenção/Obstrução; P-NRV, AP e o presidente não são voto", () => {
    const p = parseVotacaoSenado(s.aberta)!;
    expect(p.votes.map((v) => v.vote).sort()).toEqual(["NAO", "SIM"]);
    expect(p.members).toHaveLength(2);
    expect(p.svId).toBe(`S:${s.aberta.codigoSessaoVotacao}`);
    expect(p.members[0].photo).toContain("legis.senado.leg.br/senadores/fotos-oficiais/");
    expect(p.orientations).toEqual([]);
  });
  it("ignora votação secreta", () => {
    expect(parseVotacaoSenado(s.secreta)).toBeNull();
  });
  it("ignora votação sem nenhum voto de fato", () => {
    const so_ausentes = { ...s.aberta, votos: s.aberta.votos.filter((v: any) => ["P-NRV", "AP"].includes(v.siglaVotoParlamentar)) };
    expect(parseVotacaoSenado(so_ausentes)).toBeNull();
  });
  it("resultado A/R", () => {
    expect(parseVotacaoSenado({ ...s.aberta, resultadoVotacao: "A" })!.result).toBe("approved");
    expect(parseVotacaoSenado({ ...s.aberta, resultadoVotacao: "R" })!.result).toBe("rejected");
  });
});

describe("gravação e janelas", () => {
  it("grava uma votação inteira e é idempotente", () => {
    const db = openMemoryDb();
    const s = sample("camara-votacao.json");
    const p = parseVotacaoCamara(s.item, s.detail, s.votos, s.orientacoes);
    writeVotacao(db, p);
    writeVotacao(db, p); // de novo: não duplica
    const c = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    expect(c("SELECT COUNT(*) n FROM session_vote")).toBe(1);
    expect(c("SELECT COUNT(*) n FROM member_vote")).toBe(6);
    expect(c("SELECT COUNT(*) n FROM member")).toBe(6);
    expect(c("SELECT COUNT(*) n FROM orientation")).toBe(4); // as duas em branco não entram
    expect(c("SELECT COUNT(*) n FROM bill")).toBe(1);
  });
  it("divide o período em janelas contíguas de no máximo N dias", () => {
    const w = windows("2023-02-01", "2023-04-15", 30);
    expect(w[0][0]).toBe("2023-02-01");
    expect(w[w.length - 1][1]).toBe("2023-04-15");
    for (let i = 1; i < w.length; i++) {
      const prevEnd = new Date(`${w[i - 1][1]}T00:00:00Z`).getTime();
      expect(new Date(`${w[i][0]}T00:00:00Z`).getTime() - prevEnd).toBe(86400000); // sem lacuna nem sobreposição
    }
    for (const [a, b] of w) expect((new Date(b).getTime() - new Date(a).getTime()) / 86400000).toBeLessThanOrEqual(29);
  });
});
