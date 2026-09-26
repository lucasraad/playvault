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

Implementadas na migration `003_initial_domain`:

- `profiles.id` usa o UUID de `auth.users.id` como chave primária e FK com exclusão em cascata. O Supabase é o dono de `auth.users`; o Alembic nunca cria essa tabela. `username` é único.
- `games` representa o título canônico (`title`, `igdb_id` opcional e único); `platforms` mantém `slug` único e nome legível. Ambos usam UUIDs internos.
- `game_platforms` registra combinações conhecidas de jogo e plataforma, únicas por par. A biblioteca manual pode ser preenchida mesmo que essa associação ainda não tenha sido importada.
- `library_entries` é única por `profile_id + game_id + platform_id`. Contém `status`, `source`, `playtime_minutes`, `rating` de 0 a 10 e `completion_percent` de 0 a 100. Os valores iniciais são `backlog`, `manual` e zero minuto.
- `wishlist_entries` é única por `profile_id + game_id` e independe da biblioteca.

As seis tabelas estão no schema `public`, com RLS habilitada e privilégios de `anon`, `authenticated` e `service_role` revogados. O acesso a dados ocorre pela API FastAPI, cuja conexão de banco deve ter privilégios apropriados. A Task 004 implementará autenticação e verificação de identidade antes de disponibilizar endpoints privados. Ainda não há políticas públicas de Data API nem gatilho de criação automática de perfil.

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
