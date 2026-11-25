# Poder em Xeque — guia para sessões novas

Site em pt-BR (Next.js 16, Cache Components, SQLite via `node:sqlite`) que acompanha votações nominais da Câmara e do Senado.
O README explica o projeto para pessoas; este arquivo guarda o que um agente precisa saber para retomar o trabalho sem o histórico da conversa.
Publicação e instalador: `DEPLOY.md`, `Dockerfile`, `scripts/package-windows.ps1` e `installer/setup.iss`.
Antes de escrever código Next, leia o guia certo em `node_modules/next/dist/docs/` (esta versão difere do que se conhece).

## Arquitetura de dados
- Tabelas físicas `*_all` (`member_all`, `session_vote_all`, `member_vote_all`) guardam todas as legislaturas (52ª a 57ª, 2003 em diante).
  O site "clássico" lê visões da legislatura atual (`member`, `session_vote`, `member_vote`); `member` = `em_exercicio = 1`.
- `src/lib/legislaturas.ts`: `LEG_ATUAL`, `legislaturaDaData`, `lerLegislatura`, `periodoDaLegislatura`.
- Tabelas por legislatura: `member_iv_leg`, `party_leg`, `party_iv_leg`, `member_party_agreement_leg`, `member_loyalty_leg`, `member_governo_leg`, `mapa_leg`, `validacao_leg`.
- Mandatos: `mandato_evento`, `mandato_senado`, `mandato` (natureza classificada em `src/lib/mandato.ts`).
- Participação (`src/lib/presenca.ts` é lógica pura; `src/lib/derive-presenca.ts` monta as tabelas): `participacao_mandato/mes/tipo/marcas/ausencia`, `votacao_margem`, `exercicio_periodo`, `fora_exercicio`, `sessao_plenario` (`com_presenca`), `presenca_sessao`, `mesa_cargo`, `ausencia_senado`.
- Marcações (efeito de um "Sim" nos eixos Estado/Mercado e Privilégios): `docs/rubric.md`; `vote_tag_eff` junta marcação humana e de modelo.
- Linhagens de partidos: `src/lib/partidos.ts`.

## Comandos
- `npm run update` (ingestão + derivação), `npm run derive -- --iv` (só derivações), `npm run history`, `history:mandatos`, `history:presenca -- --from 2011 --to 2026`.
- Marcação: `tags:export:hist -- --legislatura N`, `tags:import -- --dir <pasta> --fill-neutral`, `tags:pesados -- --legislatura N`.
- Verificação: `npx tsc --noEmit`, `npx vitest run`, `npx tsx scripts/parity.ts` (deve dar 37/37 itens idênticos), `npm run build`.
- Depois de criar rota nova: `npx next typegen` (tipos `PageProps`).

## Regras aprendidas
- Rode `parity.ts` depois de qualquer mudança em derivação ou consulta; só regrave a base de paridade de propósito.
- Para escrever arquivos a partir de scripts use a ferramenta Write, não heredoc com aspas/crases. No PowerShell, scripts `node -e` quebram aspas: use arquivos `.cjs`/`.ts`.
- Em testes, apague de `*_all`, não das visões.
- Sem chave de API: marcação em lote é feita por subagentes de contexto novo (pasta `data/tagging/hist/L{N}`).
- Servidor de teste: porta 3200 (`npm run start -- -p 3200`); ao terminar, pare pelo PID conferindo que a linha de comando contém "congresso-iv".
- Não publicar nem criar commit/remoto sem o usuário pedir.
- Textos sensíveis ("cassado", "perdeu o mandato") usam a redação oficial; nada é inventado.

## Limites conhecidos (dizer com honestidade nas páginas)
- Só 15–25% dos votos têm direção marcada (destaques ficam neutros). A 52ª e a 54ª tiveram teste independente fraco.
- Câmara não informa motivo de ausência; presença nas sessões só existe de 2011 em diante, com anos de lista incompleta (2013, 2022, 2025).
- Autoria de projetos no Senado: sem fonte utilizável.

## Pendências
- Atividade por mandato: faltam discursos e gastos. Autoria e comissões da Câmara já existem (`autoria`, `member_comissao`, importadas por `npm run history:atividade`; só proposições legislativas contam como projeto; a API conta também quem apenas assinou, o banco não).
- Amostra cega de consistência por legislatura (~300 mil tokens) e revisão humana das votações mais pesadas (`/revisar?tipo=pesados`).
- Depois: trajetória por pessoa, troca de partido, página por estado, exportação de dados, decisões de publicação.
