/**
 * Importa os eventos de mandato (posse, licença, saída e o motivo) de cada parlamentar.
 *   npm run history:mandatos                 # Câmara
 *   npm run history:mandatos -- --limit 20   # só os 20 primeiros (teste)
 * Câmara: /deputados/{id}/historico (uma chamada por deputado, em cache e retomável).
 * Senado: /senador/{codigo}/mandatos (mandatos de 8 anos e seus exercícios, com a causa de cada afastamento).
 */
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/lib/db";
import { getJson, pool } from "./lib/http";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";

type HistRow = {
  idLegislatura: number | null;
  dataHora: string | null;
  situacao: string | null;
  condicaoEleitoral: string | null;
  descricaoStatus: string | null;
  siglaPartido: string | null;
  siglaUf: string | null;
};

/** Linhas do histórico no formato do banco. Ignora as que só marcam "nome e partido no início da legislatura". */
export function eventosDoHistorico(rows: HistRow[]) {
  return rows
    .filter((r) => r.situacao || r.descricaoStatus?.startsWith("Entrada") || r.descricaoStatus?.startsWith("Saída"))
    .map((r) => ({
      legislatura: r.idLegislatura,
      data: r.dataHora ? r.dataHora.slice(0, 10) : null,
      situacao: r.situacao,
      condicao: r.condicaoEleitoral,
      descricao: r.descricaoStatus,
      partido: r.siglaPartido,
      uf: r.siglaUf,
    }))
    .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
}

export async function ingestMandatosCamara(db: DatabaseSync, limit = Infinity): Promise<number> {
  const ids = (db.prepare("SELECT id FROM member_all WHERE chamber = 'C' ORDER BY id").all() as { id: string }[]).map((r) => r.id).slice(0, limit);
  const del = db.prepare("DELETE FROM mandato_evento WHERE member_id = ?");
  const ins = db.prepare(
    `INSERT INTO mandato_evento (member_id, seq, legislatura, data, situacao, condicao, descricao, partido, uf)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let feitos = 0;
  await pool(ids, 4, async (id) => {
    const r = await getJson<{ dados: HistRow[] | Record<string, never> }>(`${BASE}/deputados/${id.slice(2)}/historico`);
    const ev = eventosDoHistorico(Array.isArray(r.dados) ? r.dados : []);
    db.exec("BEGIN");
    del.run(id);
    ev.forEach((e, i) => ins.run(id, i, e.legislatura, e.data, e.situacao, e.condicao, e.descricao, e.partido, e.uf));
    db.exec("COMMIT");
    if (++feitos % 200 === 0) console.log(`  ${feitos}/${ids.length}`);
  });
  return feitos;
}

const SENADO = "https://legis.senado.leg.br/dadosabertos";
type Lista<T> = T | T[] | undefined;
const lista = <T>(x: Lista<T>): T[] => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
type MandatoSenadoApi = {
  CodigoMandato?: string;
  UfParlamentar?: string;
  PrimeiraLegislaturaDoMandato?: { DataInicio?: string };
  SegundaLegislaturaDoMandato?: { DataFim?: string };
  DescricaoParticipacao?: string;
  Exercicios?: { Exercicio?: Lista<{ DataInicio?: string; DataFim?: string; SiglaCausaAfastamento?: string; DescricaoCausaAfastamento?: string }> };
};

/** Linhas do banco para os mandatos de um senador (formato da resposta de /senador/{codigo}/mandatos). */
export function linhasMandatoSenado(memberId: string, resp: unknown) {
  const raiz = resp as Record<string, { Parlamentar?: { Mandatos?: { Mandato?: Lista<MandatoSenadoApi> } } }> | null;
  const k = raiz ? Object.keys(raiz)[0] : undefined;
  const mandatos = lista(k ? raiz![k]?.Parlamentar?.Mandatos?.Mandato : undefined);
  const out: unknown[][] = [];
  for (const m of mandatos) {
    const fim = m.SegundaLegislaturaDoMandato?.DataFim ?? null;
    const ini = m.PrimeiraLegislaturaDoMandato?.DataInicio ?? null;
    const exs = lista(m.Exercicios?.Exercicio);
    const base = [memberId, m.CodigoMandato ?? "", m.DescricaoParticipacao ?? null, m.UfParlamentar ?? null, ini, fim];
    if (!exs.length) out.push([...base, null, null, null, null]);
    for (const e of exs) out.push([...base, e.DataInicio ?? null, e.DataFim ?? null, e.SiglaCausaAfastamento?.trim() || null, e.DescricaoCausaAfastamento ?? null]);
  }
  return out;
}

export async function ingestMandatosSenado(db: DatabaseSync, limit = Infinity): Promise<number> {
  const ids = (db.prepare("SELECT id FROM member_all WHERE chamber = 'S' ORDER BY id").all() as { id: string }[]).map((r) => r.id).slice(0, limit);
  const del = db.prepare("DELETE FROM mandato_senado WHERE member_id = ?");
  const ins = db.prepare(
    `INSERT INTO mandato_senado (member_id, codigo_mandato, participacao, uf, mandato_inicio, mandato_fim, ex_inicio, ex_fim, causa, descricao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let feitos = 0;
  await pool(ids, 4, async (id) => {
    const r = await getJson<unknown>(`${SENADO}/senador/${id.slice(2)}/mandatos`);
    const linhas = linhasMandatoSenado(id, r);
    db.exec("BEGIN");
    del.run(id);
    for (const l of linhas) ins.run(...(l as never[]));
    db.exec("COMMIT");
    if (++feitos % 50 === 0) console.log(`  ${feitos}/${ids.length}`);
  });
  return feitos;
}

if (require.main === module) {
  const i = process.argv.indexOf("--limit");
  const limit = i >= 0 ? Number(process.argv[i + 1]) : Infinity;
  const db = openDb();
  (async () => {
    console.log("Câmara: histórico de mandato de cada deputado …");
    const n = await ingestMandatosCamara(db, limit);
    console.log(`Câmara: ${n} deputados. Eventos gravados: ${(db.prepare("SELECT COUNT(*) c FROM mandato_evento").get() as { c: number }).c}.`);
    console.log("Senado: mandatos de cada senador …");
    const s = await ingestMandatosSenado(db, limit);
    console.log(`Senado: ${s} senadores. Linhas gravadas: ${(db.prepare("SELECT COUNT(*) c FROM mandato_senado").get() as { c: number }).c}.`);
  })()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
