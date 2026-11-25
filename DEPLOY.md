# Publicar o Poder em Xeque

O site **não roda no GitHub Pages**: ele consulta um banco SQLite no servidor a cada visita (filtros, busca e paginação vêm do
endereço). Você precisa de um host que execute Node 24 e tenha um **disco persistente** para o banco.

Preços citados são aproximados e mudam; confirme na página de cada provedor.

## Antes de abrir ao público

- [ ] Rever os textos sensíveis ("cassado", "perdeu o mandato", natureza do mandato) com alguém de fora do projeto.
- [ ] Ter um canal de correção (e-mail ou *issues* do GitHub) e citá-lo no rodapé.
- [ ] Conferir a data da última atualização que aparece no rodapé.
- [ ] **Nunca** definir `ADMIN=1` em produção (habilita edição de marcações).
- [ ] Decidir como atualizar os dados (veja o fim deste arquivo).

## 1. Gerar o banco enxuto

```bash
npm run db:slim          # grava data/congresso.prod.db (≈ 780 MB), sem mexer no original
CONGRESSO_DB=data/congresso.prod.db npx tsx scripts/parity.ts   # deve dizer: Paridade ok: 37 itens idênticos
```

Ele corta o que o site não mostra: ementa e link de proposições de autoria que não são projetos, e resumos de discurso
longos. As páginas e contagens ficam iguais.

## 2. Docker (qualquer host de containers)

O `Dockerfile` gera uma imagem pequena (≈ 25 MB de aplicação). O banco **não vai na imagem**: monte um volume em `/data`.

```bash
docker build -t poder-em-xeque .
docker run -p 3000:3000 -v "$PWD/data:/data" -e CONGRESSO_DB=/data/congresso.prod.db poder-em-xeque
```

## 3. Fly.io (exemplo completo)

Custo aproximado: ≈ US$ 7/mês pela máquina de 1 GB + US$ 0,15 por GB de disco (um volume de 2 GB). Confirme em fly.io/pricing.

```bash
fly launch --no-deploy --copy-config          # usa o fly.toml; troque o nome do app e a região
fly volumes create dados --size 2 --region gru
fly deploy
# envie o banco para o volume (compacte antes: o arquivo comprime muito bem)
fly ssh console -C "mkdir -p /data"
fly ssh sftp shell                            # put data/congresso.prod.db /data/congresso.db
fly machine restart
```

## 4. Outros hosts

| Host | Observação |
|---|---|
| Railway | Disco (volume) a ≈ US$ 0,15/GB/mês; no plano Hobby o volume tem teto de 5 GB (basta). Use o `Dockerfile`. |
| Render | ≈ US$ 7/mês por 512 MB de memória (apertado para este site) + disco a ≈ US$ 0,25/GB. Prefira uma instância maior. |
| VPS (Hetzner e similares) | Mais barato (≈ € 4–6/mês), mas você administra o servidor: instale Docker, rode a imagem e use um proxy com HTTPS (Caddy). |
| GitHub Pages / Vercel / Netlify | **Não servem** como estão: sem servidor Node com disco persistente. |

## 5. Atualizar os dados em produção

A importação (`npm run update`) roda na sua máquina, não no servidor:

1. `npm run update` (baixa votações novas e recalcula).
2. Marque as votações novas (`npm run tags:export` … `tags:import`, passo que hoje depende de uma sessão com um modelo de IA).
3. `npm run db:slim` e envie o novo `congresso.prod.db` ao volume (passo do Fly.io acima), reiniciando o app.

Faça cópia do `data/congresso.db` completo antes de cada atualização: as correções humanas de `/revisar` só existem lá.

## Instalador do Windows

Veja a seção "Instalador do Windows" do README. O `.exe` (≈ 100 MB) vai para *Releases*, nunca para o git.
