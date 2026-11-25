import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../src/lib/db";
import { aplicarExercicio, idsCamara, idsSenado } from "../scripts/lib/parse-exercicio";
import { writeVotacao, type ParsedVotacao } from "../scripts/lib/parsed";
import { getMember, getMemberHistorico, listMembers, listMembersTodos, useDb } from "../src/lib/queries";

const camara = (n: number, desde = 1) => Array.from({ length: n }, (_, i) => `C:${desde + i}`);
const senado = (n: number, desde = 1) => Array.from({ length: n }, (_, i) => `S:${desde + i}`);

function voto(sv: string, date: string, ids: string[]): ParsedVotacao {
  return {
    chamber: "C", svId: sv, date, description: "Votação em turno único.", result: "approved", nominal: true, bill: null,
    members: ids.map((id) => ({ id, name: `Pessoa ${id}`, party: "PT", uf: "PE", photo: null })),
    votes: ids.map((id) => ({ memberId: id, party: "PT", vote: "SIM" as const })),
    orientations: [],
  };
}

describe("listas oficiais de quem está em exercício", () => {
  it("lê o formato da Câmara e do Senado", () => {
    expect(idsCamara({ dados: [{ id: 160541 }, { id: 5 }] })).toEqual(["C:160541", "C:5"]);
    expect(
      idsSenado({ ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: [{ IdentificacaoParlamentar: { CodigoParlamentar: "5672" } }, { IdentificacaoParlamentar: { CodigoParlamentar: 70 } }, {}] } } }),
    ).toEqual(["S:5672", "S:70"]);
    expect(idsSenado({})).toEqual([]);
  });

  it("liga em_exercicio só para quem está na lista e desliga os outros (titular que saiu, suplente que assumiu)", () => {
    const db = openMemoryDb();
    // C:1..500 votaram na 57ª. C:1 saiu do cargo; C:900 é suplente que assumiu depois e ainda não tinha votado.
    writeVotacao(db, voto("1-1", "2024-03-01", [...camara(500), "S:1"].filter((x) => x.startsWith("C"))));
    const roster = [...camara(500, 2), "C:900"]; // 2..501 (501 não existe no banco) e C:900
    const r = aplicarExercicio(db, roster.slice(0, 499).concat("C:900"), senado(81), "2026-11-24T10:00:00Z");
    expect(r.camara).toBe(500);
    const em = (id: string) => (db.prepare("SELECT em_exercicio e FROM member_all WHERE id = ?").get(id) as { e: number } | undefined)?.e;
    expect(em("C:1")).toBe(0); // votou na 57ª mas não está na lista
    expect(em("C:2")).toBe(1);
    expect(em("C:900")).toBeUndefined(); // quem nunca votou não é criado pela lista
    expect((db.prepare("SELECT value FROM meta WHERE key = 'ultima_sync_exercicio'").get() as { value: string }).value).toBe("2026-11-24T10:00:00Z");
    // a lista é a verdade: rodar de novo sem mudar nada não altera nada
    expect(aplicarExercicio(db, roster.slice(0, 499).concat("C:900"), senado(81)).mudancas).toBe(0);
  });

  it("recusa lista de tamanho implausível sem tocar no banco (resposta quebrada da API)", () => {
    const db = openMemoryDb();
    writeVotacao(db, voto("1-1", "2024-03-01", camara(500)));
    const antes = (db.prepare("SELECT SUM(em_exercicio) s FROM member_all").get() as { s: number }).s;
    expect(() => aplicarExercicio(db, camara(3), senado(81))).toThrow(/Câmara/);
    expect(() => aplicarExercicio(db, camara(513), senado(10))).toThrow(/Senado/);
    expect((db.prepare("SELECT SUM(em_exercicio) s FROM member_all").get() as { s: number }).s).toBe(antes);
    expect(db.prepare("SELECT value FROM meta WHERE key = 'ultima_sync_exercicio'").get()).toBeUndefined();
  });
});

describe("visão member = quem está no cargo", () => {
  it("quem votou na 57ª mas saiu fica fora das listas padrão e aparece como ex-parlamentar", () => {
    const db = openMemoryDb();
    writeVotacao(db, voto("1-1", "2023-05-30", ["C:sai", "C:fica"]));
    writeVotacao(db, voto("2-1", "2026-10-01", ["C:fica"]));
    // sem sincronização, votar na legislatura atual liga em_exercicio
    expect((db.prepare("SELECT COUNT(*) c FROM member").get() as { c: number }).c).toBe(2);
    // a lista oficial desliga quem saiu (aqui direto, para não depender do tamanho mínimo da lista)
    db.exec("UPDATE member_all SET em_exercicio = 0 WHERE id = 'C:sai'");
    useDb(db);
    expect(listMembers({}).map((m) => m.id)).toEqual(["C:fica"]);
    expect(getMember("C:sai")).toBeUndefined();
    const todos = listMembersTodos({});
    const sai = todos.find((m) => m.id === "C:sai")!;
    expect(sai.atual).toBe(0);
    expect(sai.ultima_leg).toBe(57);
    expect(sai.ultimo_voto).toBe("2023-05-30");
    expect(todos.find((m) => m.id === "C:fica")!.atual).toBe(1);
    expect(getMemberHistorico("C:sai")?.atual).toBe(0);
    // os votos dele na 57ª continuam valendo para as contas de partido (member_vote não mudou)
    expect((db.prepare("SELECT COUNT(*) c FROM member_vote WHERE member_id = 'C:sai'").get() as { c: number }).c).toBe(1);
  });

  it("um voto novo na legislatura atual liga em_exercicio (até a próxima sincronização), mas nunca desliga", () => {
    const db = openMemoryDb();
    writeVotacao(db, voto("1-1", "2011-05-01", ["C:x"])); // só em legislatura antiga
    expect((db.prepare("SELECT em_exercicio e FROM member_all WHERE id = 'C:x'").get() as { e: number }).e).toBe(0);
    writeVotacao(db, voto("2-1", "2024-05-01", ["C:x"]));
    expect((db.prepare("SELECT em_exercicio e FROM member_all WHERE id = 'C:x'").get() as { e: number }).e).toBe(1);
    db.exec("UPDATE member_all SET em_exercicio = 0 WHERE id = 'C:x'");
    writeVotacao(db, voto("1-1", "2011-05-01", ["C:x"])); // reimportar uma votação antiga não religa
    expect((db.prepare("SELECT em_exercicio e FROM member_all WHERE id = 'C:x'").get() as { e: number }).e).toBe(0);
  });
});
