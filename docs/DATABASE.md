# Banco de dados

## Identidade

Entidades do domínio usam UUIDs internos. IDs externos, como `igdb_id`, são
identificadores auxiliares e nunca substituem a chave primária interna.

## Entidades planejadas

Primeira etapa de domínio:

- `profiles`
- `games`
- `platforms`
- `game_platforms`
- `library_entries`
- `wishlist_entries`

Etapas posteriores:

- `platform_accounts`
- `achievements`
- `user_achievements`
- `reviews`
- `player_category_scores`
- `player_traits`
- `sync_jobs`
- `sync_logs`

Não crie essas tabelas antes da tarefa correspondente.

## Library entry

Uma entrada representa `user + game + platform` e deverá comportar status,
tempo em minutos, avaliação, conclusão, origem e timestamps. Origens iniciais:
`manual`, `steam`, `xbox`, `playstation` e `nintendo`.

## Conexão

A API usa SQLAlchemy e Psycopg. Configuração e credenciais são fornecidas por
variáveis de ambiente. O frontend não recebe a string de conexão.

Para o backend persistente, prefira conexão direta com o Supabase quando houver
IPv6. Use o Session pooler quando o ambiente exigir IPv4. Conexões devem exigir
TLS e usar pool de tamanho limitado.

## Migrations

Alembic é a fonte de histórico do schema. Toda alteração de schema deve ser
versionada, revisada e testada. O metadata compartilhado está em
`apps/api/app/db/base.py`; o ambiente Alembic está em `apps/api/migrations`.
