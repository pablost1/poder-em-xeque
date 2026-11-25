/**
 * Importa o histórico de votações nominais de plenário (padrão: 2003-02-01 até 2023-01-31, legislaturas 52 a 56).
 *   npm run history                                   # Câmara e Senado
 *   npm run history -- --from 2019-02-01 --to 2023-01-31 --chamber camara
 *
 * Câmara: arquivos anuais em lote (data/bulk/), em vez de ~3 chamadas à API por votação.
 * Senado: a mesma API de ingest-senado.ts (cada resposta já traz os votos de todos os senadores).
 * Retomável e idempotente: votações já no banco são ignoradas; arquivos já baixados são reaproveitados.
 * Não importa orientações de bancada (o alinhamento com o Governo continua só da legislatura atual).
 */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/lib/db";
import { LEG_ATUAL, legislaturaDaData, periodoDaLegislatura } from "../src/lib/legislaturas";
import { ingestSenado } from "./ingest-senado";
import { writeVotacao } from "./lib/parsed";
import {
  ehCandidata,
  lerRegistros,
  parseVotacaoBulk,
  type BulkProp,
  type BulkVotacao,
  type BulkVoto,
} from "./lib/parse-camara-bulk";

const BASE = "https://dadosabertos.camara.leg.br/arquivos";
export const BULK_DIR = path.join(process.cwd(), "data", "bulk");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Baixa um arquivo em lote (se ainda não existir). Devolve false se o servidor não tiver o arquivo (404). */
export async function baixar(tipo: string, ano: number | string, atualizar = false): Promise<string | null> {
  const nome = `${tipo}-${ano}.json`;
  const dest = path.join(BULK_DIR, nome);
  if (fs.existsSync(dest)) {
    if (!atualizar) return dest;
    // arquivo do ano em curso: baixa de novo só se o tamanho no servidor mudou
    try {
      const h = await fetch(`${BASE}/${tipo}/json/${nome}`, { method: "HEAD" });
      const remoto = Number(h.headers.get("content-length") ?? 0);
      if (!remoto || remoto === fs.statSync(dest).size) return dest;
      fs.unlinkSync(dest);
    } catch {
      return dest;
    }
  }
  fs.mkdirSync(BULK_DIR, { recursive: true });
  const url = `${BASE}/${tipo}/json/${nome}`;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const esperado = Number(res.headers.get("content-length") ?? 0);
      const parcial = `${dest}.part`;
      await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(parcial));
      if (esperado && fs.statSync(parcial).size !== esperado) throw new Error("download incompleto");
      fs.renameSync(parcial, dest);
      return dest;
    } catch (e) {
      console.log(`  (tentativa ${tentativa + 1} de ${nome} falhou: ${(e as Error).message})`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** tentativa));
    }
  }
  throw new Error(`não consegui baixar ${url}`);
}

/** Importa um ano da Câmara; devolve { votacoes novas, votos gravados }. */
export async function ingestCamaraAno(db: DatabaseSync, ano: number, de: string, ate: string) {
  const conhecidas = new Set(
    (db.prepare("SELECT id FROM session_vote_all WHERE chamber = 'C'").all() as { id: string }[]).map((r) => r.id),
  );
  const [fVot, fVotos, fProp, fObj] = await Promise.all([
    baixar("votacoes", ano),
    baixar("votacoesVotos", ano),
    baixar("votacoesProposicoes", ano),
    baixar("votacoesObjetos", ano),
  ]);
  if (!fVot || !fVotos) {
    console.log(`  ${ano}: sem arquivo de votações/votos no servidor, pulando.`);
    return { novas: 0, votos: 0, candidatas: 0, semVotos: 0 };
  }

  // 1. votações de plenário com votos individuais, no período
  const candidatas = new Map<string, BulkVotacao>();
  for await (const v of lerRegistros<BulkVotacao>(fVot)) if (ehCandidata(v, de, ate)) candidatas.set(v.id, v);

  // 2. os votos dessas votações (o arquivo de votos tem todos os órgãos; guardamos só o que interessa)
  const votos = new Map<string, BulkVoto[]>();
  for await (const x of lerRegistros<BulkVoto>(fVotos)) {
    if (!candidatas.has(x.idVotacao)) continue;
    const l = votos.get(x.idVotacao);
    if (l) l.push(x);
    else votos.set(x.idVotacao, [x]);
  }

  // 3. proposição principal de cada votação: "afetadas" primeiro, "objetos" como reserva (mesma ordem da API)
  const props = new Map<string, BulkProp["proposicao_"]>();
  for (const f of [fProp, fObj]) {
    if (!f) continue;
    for await (const p of lerRegistros<BulkProp>(f)) {
      if (candidatas.has(p.idVotacao) && !props.has(p.idVotacao) && p.proposicao_) props.set(p.idVotacao, p.proposicao_);
    }
  }

  let novas = 0;
  let gravados = 0;
  let semVotos = 0;
  for (const [id, v] of candidatas) {
    if (conhecidas.has(`C:${id}`)) continue;
    const parsed = parseVotacaoBulk(v, votos.get(id) ?? [], props.get(id) ?? null);
    if (!parsed) {
      semVotos++;
      continue;
    }
    writeVotacao(db, parsed);
    novas++;
    gravados += parsed.votes.length;
  }
  return { novas, votos: gravados, candidatas: candidatas.size, semVotos };
}

/** Siglas com que os arquivos em lote chamam a orientação do Governo ("GOV." nos anos antigos, "Governo" nos recentes). */
const SIGLAS_GOVERNO = new Set(["GOV.", "Governo"]);

/**
 * Importa só a orientação do Governo de um ano (a única que usamos no alinhamento), para votações que já estão no banco.
 * Grava no mesmo formato da legislatura atual (chave "Governo", tipo bloco), então as mesmas contas servem.
 */
export async function ingestOrientacoesAno(db: DatabaseSync, ano: number): Promise<{ lidas: number; gravadas: number }> {
  const arquivo = await baixar("votacoesOrientacoes", ano);
  if (!arquivo) return { lidas: 0, gravadas: 0 };
  const existentes = new Set((db.prepare("SELECT id FROM session_vote_all WHERE chamber = 'C'").all() as { id: string }[]).map((r) => r.id));
  const ins = db.prepare("INSERT OR REPLACE INTO orientation (session_vote_id, key, kind, orientation) VALUES (?, 'Governo', 'bloc', ?)");
  let lidas = 0;
  let gravadas = 0;
  db.exec("BEGIN");
  try {
    for await (const o of lerRegistros<{ idVotacao: string; siglaBancada: string | null; orientacao: string | null }>(arquivo)) {
      if (!o.siglaBancada || !SIGLAS_GOVERNO.has(o.siglaBancada) || !o.orientacao) continue;
      lidas++;
      const sv = `C:${o.idVotacao}`;
      if (!existentes.has(sv)) continue;
      ins.run(sv, o.orientacao);
      gravadas++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { lidas, gravadas };
}

export async function ingestCamaraHistorico(db: DatabaseSync, de: string, ate: string) {
  const total = { novas: 0, votos: 0 };
  for (let ano = Number(de.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
    const t0 = Date.now();
    const r = await ingestCamaraAno(db, ano, de, ate);
    total.novas += r.novas;
    total.votos += r.votos;
    console.log(
      `  Câmara ${ano}: ${r.candidatas} votações de plenário com contagem de votos, ${r.novas} novas (${r.votos} votos)` +
        `${r.semVotos ? `, ${r.semVotos} sem votos individuais` : ""} — ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
  }
  return total;
}

if (require.main === module) {
  const de = arg("from", periodoDaLegislatura(52).inicio);
  const ate = arg("to", periodoDaLegislatura(LEG_ATUAL - 1).fim);
  const casa = arg("chamber", "todas");
  const soOrientacoes = process.argv.includes("--so-orientacoes");
  if (legislaturaDaData(ate) >= LEG_ATUAL) console.log("Aviso: o período chega à legislatura atual; use `npm run update` para ela.");
  const db = openDb();
  (async () => {
    console.log(`Histórico ${de} → ${ate} (${casa})`);
    if (soOrientacoes) {
      for (let ano = Number(de.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
        const r = await ingestOrientacoesAno(db, ano);
        console.log(`  ${ano}: ${r.lidas} orientações do Governo no arquivo, ${r.gravadas} em votações importadas`);
      }
      return;
    }
    if (casa === "todas" || casa === "camara") {
      console.log("Câmara (arquivos em lote):");
      const r = await ingestCamaraHistorico(db, de, ate);
      console.log(`Câmara: ${r.novas} votações novas, ${r.votos} votos.`);
    }
    if (casa === "todas" || casa === "senado") {
      console.log("Senado:");
      await ingestSenado(db, de, ate);
    }
    const c = db
      .prepare(
        `SELECT legislatura, chamber, COUNT(*) AS votacoes FROM session_vote_all WHERE is_nominal = 1 GROUP BY 1, 2 ORDER BY 1, 2`,
      )
      .all();
    console.table(c.map((x) => ({ ...x })));
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
