import fs from "node:fs";
import readline from "node:readline";
import { normalizeVote } from "../../src/lib/db";
import type { ParsedVotacao } from "./parsed";

/*
 * Arquivos de download em lote da Câmara (https://dadosabertos.camara.leg.br/arquivos/...), um por ano. Servem o
 * histórico: milhares de chamadas à API viram 4 downloads por ano. Só os campos que usamos.
 */

export type BulkVotacao = {
  id: string;
  data: string; // AAAA-MM-DD
  siglaOrgao: string | null;
  aprovacao: number | null;
  votosSim: number | null;
  votosNao: number | null;
  votosOutros: number | null;
  descricao: string | null;
  ultimaAberturaVotacao?: { descricao: string | null } | null;
};
export type BulkVoto = {
  idVotacao: string;
  voto: string;
  deputado_: { id: string | number; nome: string; siglaPartido: string | null; siglaUf: string | null; urlFoto: string | null };
};
export type BulkProp = {
  idVotacao: string;
  proposicao_: { id: number; titulo?: string | null; ementa: string | null; siglaTipo: string; numero: number | null; ano?: number | null };
};

/**
 * Lê os registros de `dados` sem carregar o arquivo inteiro (o de votos de 2022 tem 120 MB). Os arquivos vêm formatados
 * com 2 espaços: cada registro começa numa linha "    {" e termina em "    }" ou "    },". Se o formato for outro,
 * cai para JSON.parse do arquivo todo.
 */
export async function* lerRegistros<T>(arquivo: string): AsyncGenerator<T> {
  const rl = readline.createInterface({ input: fs.createReadStream(arquivo, { encoding: "utf8" }), crlfDelay: Infinity });
  let buf: string[] | null = null;
  let n = 0;
  for await (const linha of rl) {
    if (buf === null) {
      if (linha === "    {") buf = ["{"];
      continue;
    }
    if (linha === "    }" || linha === "    },") {
      buf.push("}");
      n++;
      yield JSON.parse(buf.join("\n")) as T;
      buf = null;
    } else {
      buf.push(linha);
    }
  }
  if (n === 0) {
    const todo = JSON.parse(fs.readFileSync(arquivo, "utf8")) as { dados?: T[] };
    for (const r of todo.dados ?? []) yield r;
  }
}

/** Rótulo "PL 62/2003" de uma proposição; usa o título quando faltam número ou ano. */
export function rotuloProp(p: BulkProp["proposicao_"]): string {
  if (p.numero != null && p.ano != null) return `${p.siglaTipo} ${p.numero}/${p.ano}`;
  return p.titulo ?? `${p.siglaTipo} ${p.numero ?? ""}`.trim();
}

/** Votação de plenário com algum voto individual registrado, no período pedido. */
export function ehCandidata(v: BulkVotacao, de: string, ate: string): boolean {
  const d = v.data.slice(0, 10);
  return v.siglaOrgao === "PLEN" && d >= de && d <= ate && (v.votosSim ?? 0) + (v.votosNao ?? 0) + (v.votosOutros ?? 0) > 0;
}

/** Converte uma votação dos arquivos em lote para o formato interno. Devolve null se não houver votos individuais. */
export function parseVotacaoBulk(v: BulkVotacao, votos: BulkVoto[], prop: BulkProp["proposicao_"] | null): ParsedVotacao | null {
  if (votos.length === 0) return null;
  return {
    chamber: "C",
    svId: `C:${v.id}`,
    date: v.data.slice(0, 10),
    description: v.ultimaAberturaVotacao?.descricao ?? v.descricao ?? null,
    result: v.aprovacao === 1 ? "approved" : v.aprovacao === 0 ? "rejected" : null,
    nominal: true,
    bill: prop ? { id: `C:${prop.id}`, label: rotuloProp(prop), ementa: prop.ementa } : null,
    members: votos.map((x) => ({
      id: `C:${x.deputado_.id}`,
      name: x.deputado_.nome,
      party: x.deputado_.siglaPartido,
      uf: x.deputado_.siglaUf,
      photo: x.deputado_.urlFoto,
    })),
    votes: votos.map((x) => ({ memberId: `C:${x.deputado_.id}`, party: x.deputado_.siglaPartido, vote: normalizeVote(x.voto) })),
    orientations: [],
  };
}
