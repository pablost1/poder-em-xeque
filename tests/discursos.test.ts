import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../src/lib/db";
import { discursosDoMandato, discursosLista, useDb as ligarBanco } from "../src/lib/queries";
import { discursosDaCamara, discursosDoSenado, grupoDoTipo, listaDoSenado } from "../scripts/lib/parse-discursos";
import { janelaDoMandato } from "../scripts/ingest-discursos";

describe("grupoDoTipo", () => {
  it("separa pronunciamento, intervenção e presidência, ignorando acento e caixa", () => {
    expect(grupoDoTipo("BREVES COMUNICAÇÕES")).toBe("pronunciamento");
    expect(grupoDoTipo("Comunicação inadiável")).toBe("pronunciamento");
    expect(grupoDoTipo("GRANDE EXPEDIENTE")).toBe("pronunciamento");
    expect(grupoDoTipo("PELA ORDEM")).toBe("intervencao");
    expect(grupoDoTipo("ENCAMINHAMENTO DE VOTAÇÃO")).toBe("intervencao");
    expect(grupoDoTipo("Orientação à bancada")).toBe("intervencao");
    expect(grupoDoTipo("FALA DO PRESIDENTE OU NO EXERCÍCIO DA PRESIDÊNCIA")).toBe("presidencia");
    expect(grupoDoTipo("Fala da Presidência")).toBe("presidencia");
    expect(grupoDoTipo(null)).toBe("intervencao");
  });
});

describe("leitura das APIs", () => {
  it("Câmara: usa só a data, resume espaços e nunca guarda a transcrição", () => {
    const linhas = discursosDaCamara([
      { dataHoraInicio: "2022-12-21T18:32", tipoDiscurso: "PELA ORDEM", faseEvento: { titulo: "Ordem do Dia" }, sumario: "  Agradecimento \n aos líderes ", urlTexto: "http://x", urlVideo: null, transcricao: "texto longo" } as never,
      { dataHoraInicio: null, tipoDiscurso: "PELA ORDEM" },
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toEqual({ data: "2022-12-21", tipo: "PELA ORDEM", fase: "Ordem do Dia", grupo: "intervencao", sumario: "Agradecimento aos líderes", url: "http://x", video: null });
    expect(JSON.stringify(linhas)).not.toContain("texto longo");
  });
  it("Senado: aceita um item só ou uma lista", () => {
    const um = { DiscursosParlamentar: { Parlamentar: { Pronunciamentos: { Pronunciamento: { CodigoPronunciamento: "1", TipoUsoPalavra: { Descricao: "Pela ordem" }, DataPronunciamento: "2026-10-14", TextoResumo: "r", UrlTexto: "u" } } } } };
    expect(listaDoSenado(um)).toHaveLength(1);
    expect(discursosDoSenado(listaDoSenado(um))[0]).toMatchObject({ data: "2026-10-14", tipo: "Pela ordem", grupo: "intervencao", sumario: "r", url: "u" });
    expect(listaDoSenado({ DiscursosParlamentar: { Parlamentar: {} } })).toEqual([]);
  });
});

describe("janelaDoMandato", () => {
  it("legislatura passada vai até 31/01 do último ano; a atual é cortada em hoje", () => {
    expect(janelaDoMandato(56, "2026-11-24")).toEqual({ inicio: "2019-02-01", fim: "2023-01-31" });
    expect(janelaDoMandato(57, "2026-11-24")).toEqual({ inicio: "2023-02-01", fim: "2026-11-24" });
  });
});

function base() {
  const db = openMemoryDb();
  ligarBanco(db);
  const ins = db.prepare("INSERT INTO discurso (member_id, legislatura, data, tipo, fase, grupo, sumario, url, video) VALUES (?,?,?,?,?,?,?,?,?)");
  ins.run("C:1", 57, "2024-03-01", "BREVES COMUNICAÇÕES", null, "pronunciamento", "a", null, null);
  ins.run("C:1", 57, "2024-04-01", "BREVES COMUNICAÇÕES", null, "pronunciamento", "b", null, null);
  ins.run("C:1", 57, "2024-05-01", "PELA ORDEM", null, "intervencao", "c", null, null);
  ins.run("C:1", 57, "2024-05-02", "FALA DA PRESIDÊNCIA", null, "presidencia", "d", null, null);
  db.prepare("INSERT INTO discurso_mandato VALUES ('C:1', 57, '2026-11-24')").run();
  db.prepare("INSERT INTO discurso_mandato VALUES ('C:2', 57, '2026-11-24')").run(); // importado, zero discursos
  return db;
}

describe("consultas de discursos", () => {
  it("conta por grupo e deixa a presidência de fora das contas", () => {
    base();
    const r = discursosDoMandato("C:1", 57);
    expect(r).toMatchObject({ importado: true, pronunciamentos: 2, intervencoes: 1, presidencia: 1 });
    expect(r.porTipo).toEqual([{ tipo: "BREVES COMUNICAÇÕES", n: 2 }, { tipo: "PELA ORDEM", n: 1 }]);
  });
  it("distingue zero discursos de mandato ainda não importado", () => {
    base();
    expect(discursosDoMandato("C:2", 57)).toMatchObject({ importado: true, pronunciamentos: 0 });
    expect(discursosDoMandato("C:3", 57).importado).toBe(false);
  });
  it("lista do mais recente ao mais antigo, só do grupo pedido", () => {
    base();
    expect(discursosLista("C:1", 57, "pronunciamento", 10, 0).map((d) => d.sumario)).toEqual(["b", "a"]);
    expect(discursosLista("C:1", 57, "pronunciamento", 1, 1).map((d) => d.sumario)).toEqual(["a"]);
    expect(discursosLista("C:1", 57, "intervencao", 10, 0).map((d) => d.sumario)).toEqual(["c"]);
  });
});
