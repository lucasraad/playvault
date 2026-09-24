# Gamer Profile

Fundação do monorepo para uma plataforma que centraliza a identidade e a biblioteca gamer de um usuário entre diferentes plataformas.

## Estrutura

```text
apps/
  web/          Frontend Next.js + TypeScript + Tailwind CSS
  api/          Backend FastAPI + Pydantic
docs/           Documentação e decisões de arquitetura
experiments/    Provas de conceito isoladas
```

O frontend e o backend são aplicações independentes. Integrações externas futuras serão acessadas somente pelo backend.

## Requisitos

- Node.js 20 ou superior
- npm 10 ou superior
- Python 3.12 ou superior

## Frontend

Na raiz do repositório:

```bash
npm install
npm run dev:web
```

Abra `http://localhost:3000`.

## Backend

No diretório `apps/api`:

```bash
python -m venv .venv
```

Ative o ambiente virtual no Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Instale as dependências e execute a API:

```bash
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload
```

Antes de iniciar, copie `.env.example` para `.env` na raiz e substitua
`DATABASE_URL` pela URI exibida em **Connect** no painel do Supabase. Como o
backend será persistente no Railway, prefira a conexão direta. Caso o ambiente
não suporte IPv6, use o **Session pooler**. Preserve `sslmode=require`.

A API estará em `http://localhost:8000`:

- `GET /health` valida o processo da API sem acessar dependências externas.
- `GET /health/database` executa `SELECT 1` e valida a conexão PostgreSQL.

O endpoint de banco retorna HTTP `503` quando a conexão não está configurada ou
o banco está indisponível.

## Autenticação

Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `WEB_ORIGIN` no `.env`.
O frontend usa os endpoints `/auth/signup`, `/auth/login`, `/auth/refresh` e
`/auth/me` da API. Consulte `docs/ARCHITECTURE.md` para o contrato completo.
O primeiro `/auth/me` autenticado cria o perfil inicial no banco, portanto
requer que a migration de domínio já tenha sido aplicada.

## Migrations

O Alembic está configurado para usar a mesma `DATABASE_URL` da aplicação. No
diretório `apps/api`, use:

```bash
python -m alembic revision --autogenerate -m "descricao_da_migration"
python -m alembic upgrade head
python -m alembic downgrade -1
```

A migration `003_initial_domain` cria as tabelas iniciais do domínio. Ela depende
do schema `auth.users` presente em um projeto Supabase. Execute `upgrade head`
apenas com `DATABASE_URL` configurada para o banco pretendido.

## Validação

Na raiz:

```bash
npm run lint
npm run build:web
```

Em `apps/api` com o ambiente virtual ativo:

```bash
python -m ruff check .
python -m pytest
```

## Variáveis de ambiente

Copie `.env.example` para `.env` na raiz do repositório. Nunca versione o `.env`
real nem credenciais do Supabase. O backend carrega esse arquivo automaticamente;
em deploy, configure as mesmas chaves como variáveis do ambiente.
