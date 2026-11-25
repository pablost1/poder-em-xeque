# Poder em Xeque

Como votam os deputados federais e senadores do Brasil: por pessoa e por partido, comparações (partido × partido,
parlamentar × partido, parlamentar × parlamentar), página de cada votação e de cada projeto, busca, resumos por tema,
**perfil de votação** (barras Estado / Esquerda, Mercado / Direita e Privilégios), **rankings** de cada eixo, alinhamento com
a orientação do Governo, **mapa de votos**, **história por partido** desde 2003, **mandatos** (como cada um terminou),
**participação e presença**, projetos de autoria (e quantos viraram lei), comissões e discursos.

Projeto independente que usa dados abertos da Câmara dos Deputados e do Senado Federal. Sem vínculo com o Governo Federal.
O perfil de votação é uma **interpretação**, não uma nota oficial: leia a página `/metodologia` antes de tirar conclusões.

Tecnologia: Next.js 16 (App Router, Cache Components) + TypeScript + Tailwind v4, SQLite nativo do Node (`node:sqlite`, com FTS5
para a busca). Interface toda em pt-BR. Licença do código: [MIT](LICENSE).

## Escolha o seu caminho

| Quero… | Faça |
|---|---|
| **Só usar o site no meu Windows** | Baixe o `PoderEmXeque-Setup.exe` na página de *Releases* e execute (veja [Instalador do Windows](#instalador-do-windows)) |
| **Rodar o código (desenvolver)** | [Início rápido](#início-rápido) |
| **Publicar na internet** | [DEPLOY.md](DEPLOY.md) |
| **Reconstruir os dados do zero** | [Construir os dados do zero](#construir-os-dados-do-zero) |

## Início rápido

Requisitos: **Node 24 ou mais novo** (usa `node:sqlite`) e npm.

```bash
git clone https://github.com/SEU-USUARIO/poder-em-xeque.git
cd poder-em-xeque
npm install
```

O código **não traz o banco de dados** (ele tem ≈ 1 GB e fica fora do git). Baixe `congresso.db.zip` na página de *Releases*,
descompacte em `data/congresso.db` (veja [`data/README.md`](data/README.md)) e rode:

```bash
npm run dev            # http://localhost:3000
ADMIN=1 npm run dev    # habilita também /revisar (revisão de marcações), só local
npm run build && npm start
npm test               # testes (Vitest); npm run test:watch para modo contínuo
```

O site lê `data/congresso.db`; troque o caminho com a variável `CONGRESSO_DB` (veja `.env.example`).
Sem banco o site abre, mas as páginas ficam vazias.

## Instalador do Windows

O instalador traz tudo: o site, um Node portátil e o banco de dados enxuto (cerca de 100 MB para baixar, ≈ 900 MB instalado).
Não precisa de administrador nem de Node instalado.

1. Execute `PoderEmXeque-Setup.exe`, escolha a pasta (o padrão é `%LOCALAPPDATA%\PoderEmXeque`) e conclua.
2. Abra **Poder em Xeque** no Menu Iniciar. Uma janela preta abre o servidor e o navegador abre em `http://127.0.0.1:3200`.
3. Deixe a janela aberta enquanto usa. Para encerrar, feche-a ou use **Parar o Poder em Xeque**.

O site roda só no seu computador e não envia nada para fora. A versão instalada não se atualiza sozinha.

### Gerar o instalador você mesmo

```powershell
winget install JRSoftware.InnoSetup                     # uma vez
powershell -ExecutionPolicy Bypass -File scripts\package-windows.ps1
# resultado: installer\Output\PoderEmXeque-Setup.exe  (use -SemInstalador para gerar só a pasta dist\PoderEmXeque)
```

O script faz: banco enxuto (`npm run db:slim`) → build autossuficiente (`NEXT_STANDALONE=1`) → monta `dist\PoderEmXeque`
(site + `node.exe` + banco + `Iniciar.bat`/`Parar.bat`) → compila `installer\setup.iss` com o Inno Setup.
Publique o `.exe` em *Releases*; **nunca** o coloque no git.

## Atualizar os dados (um comando)

```bash
npm run update
```

Importa as votações novas da Câmara e do Senado (a partir de 7 dias antes da última conhecida), completa os projetos novos com
palavras-chave, recalcula todas as tabelas derivadas, grava a data da atualização (mostrada no rodapé do site) e diz quantas
votações nominais ainda esperam marcação. Votos novos **não ganham marcação sozinhos**: veja "Marcações" abaixo.

**Quem está em exercício.** "Legislatura vigente" significa *está no cargo hoje*, não "votou na legislatura atual" (suplentes e
titulares que saíram também votaram). O `npm run update` consulta as listas oficiais (Câmara `/deputados`, Senado
`/senador/lista/atual`) e grava `member_all.em_exercicio`; `npm run sync:exercicio` faz só isso.

Os passos soltos continuam existindo: `npm run ingest:camara`, `npm run ingest:senado`, `npm run enrich:bills`,
`npm run derive` (tudo, ~25 s) e `npm run derive -- --iv` (só perfil de votação, busca e validação; use depois de mudar marcações).

## Construir os dados do zero

Leva várias horas e baixa alguns GB (arquivos em lote da Câmara ficam em `data/bulk/`). Em ordem:

```bash
npm install
npm run update                         # votações recentes (Câmara e Senado) + tabelas derivadas
npm run history                        # votações de 2003 a jan/2023 (arquivos em lote da Câmara + API do Senado)
npm run history -- --so-orientacoes    # orientação do Governo (Câmara) nas votações já importadas
npm run history:mandatos               # eventos de mandato de cada pessoa (posse, licença, saída e o motivo oficial)
npm run history:presenca -- --from 2011 --to 2026   # presença nas sessões e Mesa Diretora
npm run history:atividade -- --from 2003 --to 2026  # autoria (e situação dos projetos) e comissões
npm run history:discursos              # discursos de cada mandato (API; ≈ 1 hora)
npm run sync:exercicio                 # quem está no cargo hoje
```

Depois importe as **marcações** (que já estão no repositório, em `data/tagging/`; elas não são recalculadas):

```bash
npm run tags:import -- --dir data/tagging                  # legislatura atual
for L in 52 53 54 55 56; do npm run tags:import -- --dir data/tagging/hist/L$L --fill-neutral; done
npm run derive                                             # recalcula tudo
npx tsx scripts/parity.ts                                  # confere: "Paridade ok: 37 itens idênticos"
```

Atenção: reconstruir **não reproduz exatamente** o banco publicado. As correções feitas por pessoas em `/revisar` e as rodadas
de revisão de marcação ficam **só no banco**, então o jeito seguro de ter os mesmos números é baixar o `congresso.db` pronto.
Faça cópias dele (`data/history/`) antes de refazer qualquer coisa.

## Marcações e perfil de votação

Cada votação nominal é marcada pelo **efeito de um "Sim"** em um eixo econômico (−1 Estado … +1 Mercado) e em um eixo de
privilégios (−1 … +1), com confiança e justificativa. Roteiro: [`docs/rubric.md`](docs/rubric.md). Resumos e justificativas são em português.

```bash
npm run tags:export                    # marca moções procedimentais e grava data/tagging/batch-NN.txt com o resto
# …marque os lotes em data/tagging/out-NN.json (formato em scripts/lib/validate-tags.ts) e a tradução em pt-NN.json…
npm run tags:import -- --fill-neutral  # valida e carrega (aplica pt-NN.json); votos não listados ficam neutros (peso zero)
npm run derive -- --iv
```

Rodadas seguintes usam o prefixo da versão (`npm run tags:export:r2`, `npm run tags:import -- --rubric r2`).
Legislaturas antigas: `npm run tags:export:hist -- --legislatura 55` grava lotes em `data/tagging/hist/L55`.

### Segunda marcação às cegas e consistência

```bash
npm run tags:export:blind   # exporta todos os votos substantivos SEM marcações, em data/blind/ (com o roteiro)
npm run tags:import:blind   # valida e confere que todas as votações de cada lote foram marcadas
npm run tags:compare        # concordância, kappa, correlação das notas; grava a fila de divergências
npm run tags:pesados -- --legislatura 54   # lista as votações de maior peso para revisão humana
```

Os resultados aparecem na `/metodologia`; os votos em que as duas marcações discordam entram em `/revisar?tipo=divergencias`
(exige `ADMIN=1`). Correções humanas (`source = human`) têm prioridade sobre as marcações do modelo.

As marcações são feitas por modelos de IA a partir de ementas, palavras-chave e descrições (não dos textos completos); muitas votações
não podem ser avaliadas e ficam neutras. O teste independente por legislatura (página `/metodologia`) é mais fraco na 52ª e na 54ª.

## Páginas

`/membros`, `/membro/[id]` (com sumário lateral), `/membro/[id]/mandato/[leg]` (autoria, comissões, discursos, alinhamento),
`/membro/[id]/participacao`, `/partidos`, `/partido/[sigla]`, `/comparar`, `/rankings`, `/historia`, `/mandatos`, `/mapa`, `/busca`,
`/votacao/[id]`, `/projeto/[id]`, `/metodologia` e `/revisar` (só com `ADMIN=1`).

## Estrutura

- `scripts/` — ingestão (`ingest-*.ts`, parsers puros em `scripts/lib/`), `update.ts`, marcações (`export-*`, `import-*`,
  `compare-tags.ts`), `slim-db.ts` (banco enxuto para publicar), `package-windows.ps1` (instalador), `build-derived.ts`.
- `src/lib/db.ts` — esquema; `src/lib/derive*.ts` — tabelas derivadas; `src/lib/queries.ts` — consultas só de leitura;
  `src/lib/presenca.ts`, `mandato.ts`, `historia.ts`, `legislaturas.ts`, `partidos.ts`, `mapa.ts` — lógica pura testada.
- `src/app/` — páginas; `src/components/` — componentes.
- `tests/` — testes com um banco de exemplo pequeno e números calculados à mão (`tests/fixtures.ts`).
- `installer/` — Inno Setup e atalhos do instalador do Windows; `Dockerfile` e `fly.toml` — publicação em servidor.
- Tokens de design (inspirados no gov.br, claro/escuro) em `src/app/globals.css`.

O banco tem tabelas físicas `*_all` com todas as legislaturas (52ª a 57ª, 2003 em diante) e visões da legislatura atual
(`member`, `session_vote`, `member_vote`) que as páginas principais usam. `npx tsx scripts/parity.ts` prova que os números da
legislatura atual não mudam quando o histórico cresce. Mais detalhes para quem desenvolve: [`CLAUDE.md`](CLAUDE.md).

## Contribuir

Leia [CONTRIBUTING.md](CONTRIBUTING.md). Erros nos dados, na metodologia ou em textos sobre pessoas são o tipo de contribuição
mais valioso: abra uma *issue* com o link da página e a fonte oficial.

## Fontes e avisos

- Dados: [Dados Abertos da Câmara dos Deputados](https://dadosabertos.camara.leg.br) e [Dados Abertos do Senado Federal](https://www12.senado.leg.br/dados-abertos).
- O projeto não tem vínculo com o Governo Federal, com a Câmara, com o Senado nem com partidos.
- Rótulos como "cassado" ou "perdeu o mandato" usam a redação oficial do motivo registrado na fonte; nada é inventado.
- Taxas de participação e de projetos que viraram lei **não medem produtividade nem qualidade do trabalho**; as páginas explicam os limites.
