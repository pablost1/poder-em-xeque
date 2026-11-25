import type { DatabaseSync } from "node:sqlite";

/* Listas oficiais de quem está em exercício hoje (a Câmara tem 513 cadeiras e o Senado, 81). */

export type CamaraRoster = { dados: { id: number }[]; links?: { rel: string; href: string }[] };
export type SenadoRoster = {
  ListaParlamentarEmExercicio?: {
    Parlamentares?: { Parlamentar?: { IdentificacaoParlamentar?: { CodigoParlamentar?: string | number } }[] };
  };
};

/** Ids (no formato do banco, "C:123") dos deputados em exercício de uma página da lista da Câmara. */
export function idsCamara(r: CamaraRoster): string[] {
  return (r.dados ?? []).map((d) => `C:${d.id}`);
}

/** Ids (no formato do banco, "S:5672") dos senadores em exercício. */
export function idsSenado(r: SenadoRoster): string[] {
  const l = r.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar ?? [];
  return l.map((p) => p.IdentificacaoParlamentar?.CodigoParlamentar).filter((c) => c != null).map((c) => `S:${c}`);
}

/** Faixas plausíveis: protegem contra uma resposta quebrada da API apagar todo mundo. */
const FAIXA = { C: [450, 560], S: [70, 95] } as const;

export type ResultadoSync = { camara: number; senado: number; mudancas: number };

/**
 * Marca em_exercicio = 1 só para quem está nas listas e 0 para todos os outros. Recusa listas com tamanho implausível
 * (resposta incompleta) sem tocar no banco.
 */
export function aplicarExercicio(db: DatabaseSync, camara: string[], senado: string[], quando = new Date().toISOString()): ResultadoSync {
  const c = new Set(camara);
  const s = new Set(senado);
  if (c.size < FAIXA.C[0] || c.size > FAIXA.C[1]) throw new Error(`Lista da Câmara com ${c.size} deputados: fora do esperado, nada foi alterado.`);
  if (s.size < FAIXA.S[0] || s.size > FAIXA.S[1]) throw new Error(`Lista do Senado com ${s.size} senadores: fora do esperado, nada foi alterado.`);
  const todos = db.prepare("SELECT id, em_exercicio FROM member_all").all() as { id: string; em_exercicio: number }[];
  const upd = db.prepare("UPDATE member_all SET em_exercicio = ? WHERE id = ?");
  let mudancas = 0;
  db.exec("BEGIN");
  try {
    for (const m of todos) {
      const novo = c.has(m.id) || s.has(m.id) ? 1 : 0;
      if (novo !== m.em_exercicio) {
        upd.run(novo, m.id);
        mudancas++;
      }
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('ultima_sync_exercicio', ?)").run(quando);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { camara: c.size, senado: s.size, mudancas };
}
