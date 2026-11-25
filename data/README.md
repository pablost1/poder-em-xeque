# Pasta `data/`

Esta pasta guarda os dados do site e **quase tudo dela fica fora do git** (veja `.gitignore`).

| Arquivo / pasta | O que é | No git? |
|---|---|---|
| `congresso.db` | Banco SQLite completo (≈ 1 GB) que o site lê | não |
| `congresso.prod.db` | Cópia enxuta para publicar (≈ 780 MB), gerada por `npm run db:slim` | não |
| `bulk/` | Arquivos em lote baixados da Câmara (≈ 4 GB), só para importação | não |
| `history/` | Cópias de segurança do banco | não |
| `*.log` | Registros das importações | não |
| `tagging/` | Lotes de marcação das votações (feitos por modelo e revisados por pessoas) | **sim** |

## Como ter o banco

**Opção 1: baixar pronto.** Na página de *Releases* do repositório há dois arquivos; descompacte o escolhido aqui como `congresso.db`:

| Arquivo | O que é |
|---|---|
| `congresso.completo.db.zip` | **Banco completo** (992 MB descompactado). Para atualizar dados, reimportar e desenvolver. |
| `congresso.db.zip` | Banco enxuto (778 MB). Só para rodar o site; ementas de requerimentos e partes longas de discursos foram cortadas. |

**Opção 2: construir do zero.** Leva horas e baixa vários GB. A ordem está no `README.md` (seção "Construir os dados do zero").
As marcações das votações não são recalculadas: elas vêm de `tagging/` com `npm run tags:import`.

Sem banco, o site abre, mas as páginas aparecem vazias.
