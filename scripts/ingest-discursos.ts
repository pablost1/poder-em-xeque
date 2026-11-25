/**
 * Importa os discursos de cada mandato (Câmara e Senado) pelas APIs, que não têm arquivo em lote.
 *   npm run history:discursos                       # todos os mandatos ainda não importados
 *   npm run history:discursos -- --leg 57           # só uma legislatura (a atual é sempre reimportada)
 *   npm run history:discursos -- --limite 20        # só os 20 primeiros, para testar
 * Retomável: mandatos já importados ficam marcados em discurso_mandato. A transcrição vem na resposta mas nunca é guardada.
 */
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/lib/db";
import { LEG_ATUAL, periodoDaLegislatura } from "../src/lib/legislaturas";
import { discursosDaCamara, discursosDoSenado, listaDoSenado, type DiscursoCamara, type DiscursoLinha } from "./lib/parse-discursos";

const CAMARA = "https://dadosabertos.camara.leg.br/api/v2";
const SENADO = "https://legis.senado.leg.br/dadosabertos";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pegar(url: string, json = false): Promise<unknown> {
  for (let t = 0; t < 5; t++) {
    try {
      const res = await fetch(url, json ? { headers: { Accept: "application/json" } } : undefined);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (t === 4) throw e;
      await sleep(1000 * (t + 1));
    }
  }
  return null;
}

/** Janela do mandato: da legislatura, cortada em hoje. */
export function janelaDoMandato(legislatura: number, hoje = new Date().toISOString().slice(0, 10)): { inicio: string; fim: string } {
  const p = periodoDaLegislatura(legislatura);
  return { inicio: p.inicio, fim: p.fim < hoje ? p.fim : hoje };
}

export async function discursosDaCamaraApi(id: string, legislatura: number): Promise<DiscursoLinha[]> {
  const { inicio, fim } = janelaDoMandato(legislatura);
  const out: DiscursoLinha[] = [];
  let url: string | null = `${CAMARA}/deputados/${id}/discursos?dataInicio=${inicio}&dataFim=${fim}&itens=100&ordenarPor=dataHoraInicio&ordem=ASC`;
  while (url) {
    const r = (await pegar(url)) as { dados: DiscursoCamara[]; links: { rel: string; href: string }[] } | null;
    if (!r) break;
    out.push(...discursosDaCamara(r.dados));
    url = r.links.find((l) => l.rel === "next")?.href ?? null;
  }
  return out;
}

export async function discursosDoSenadoApi(codigo: string, legislatura: number): Promise<DiscursoLinha[]> {
  const { inicio, fim } = janelaDoMandato(legislatura);
  const compacta = (d: string) => d.replaceAll("-", "");
  const r = await pegar(`${SENADO}/senador/${codigo}/discursos?dataInicio=${compacta(inicio)}&dataFim=${compacta(fim)}`, true);
  return r ? discursosDoSenado(listaDoSenado(r)) : [];
}

function gravar(db: DatabaseSync, memberId: string, legislatura: number, linhas: DiscursoLinha[]) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM discurso WHERE member_id = ? AND legislatura = ?").run(memberId, legislatura);
    const ins = db.prepare("INSERT INTO discurso (member_id, legislatura, data, tipo, fase, grupo, sumario, url, video) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const l of linhas) ins.run(memberId, legislatura, l.data, l.tipo, l.fase, l.grupo, l.sumario, l.url, l.video);
    db.prepare("INSERT OR REPLACE INTO discurso_mandato (member_id, legislatura, importado) VALUES (?, ?, ?)").run(memberId, legislatura, new Date().toISOString().slice(0, 10));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

if (process.argv[1]?.includes("ingest-discursos")) {
  const arg = (k: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const leg = Number(arg("leg")) || undefined;
  const limite = Number(arg("limite")) || Infinity;
  const db = openDb();
  const mandatos = (
    db
      .prepare(
        `SELECT m.member_id, m.legislatura FROM mandato m
          LEFT JOIN discurso_mandato d ON d.member_id = m.member_id AND d.legislatura = m.legislatura
          WHERE (? IS NULL OR m.legislatura = ?) AND (d.member_id IS NULL OR m.legislatura = ${LEG_ATUAL})
          ORDER BY m.legislatura DESC, m.member_id`,
      )
      .all(leg ?? null, leg ?? null) as { member_id: string; legislatura: number }[]
  ).slice(0, limite);
  console.log(`  ${mandatos.length} mandatos para importar`);
  let feitos = 0;
  let falhas = 0;
  let linhasTotal = 0;
  const fila = [...mandatos];
  const trabalhar = async () => {
    for (let m = fila.shift(); m; m = fila.shift()) {
      try {
        const [casa, id] = m.member_id.split(":");
        const linhas = casa === "C" ? await discursosDaCamaraApi(id, m.legislatura) : await discursosDoSenadoApi(id, m.legislatura);
        gravar(db, m.member_id, m.legislatura, linhas);
        linhasTotal += linhas.length;
      } catch (e) {
        falhas++;
        console.error(`  falhou ${m.member_id} L${m.legislatura}: ${(e as Error).message}`);
      }
      if (++feitos % 100 === 0) console.log(`  ${feitos}/${mandatos.length} mandatos, ${linhasTotal} discursos, ${falhas} falhas`);
    }
  };
  Promise.all([trabalhar(), trabalhar(), trabalhar(), trabalhar()])
    .then(() => console.log(`  pronto: ${feitos - falhas} mandatos importados, ${linhasTotal} discursos, ${falhas} falhas`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
