# Handoff para Antigravity — Task 004

Implementar a experiência de autenticação no `apps/web` após aplicar os commits das Tasks 003 e 004. Consulte `docs/ARCHITECTURE.md` para os contratos e `AGENTS.md` para a divisão de responsabilidades.

## Entrega visual

- Cadastro por e-mail e senha com mensagem de confirmação quando aplicável.
- Login, estado autenticado, perfil inicial e saída da sessão.
- Renovação de sessão com rotação do refresh token retornado por `/auth/refresh`.
- Estados de carregamento, erros 401, 429, 503, validação 422 e layout responsivo.
- Chamadas apenas à API FastAPI configurada em `NEXT_PUBLIC_API_URL`.

## Contrato disponível

`POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`.

Depois do login, chamar `/auth/me` com `Authorization: Bearer <access_token>` para validar a sessão e criar o perfil mínimo. As demais chamadas privadas devem usar o mesmo token. A API retorna tokens em JSON; manter o refresh token fora de URLs, logs e armazenamento legível por JavaScript. Escolher uma estratégia de sessão do lado do servidor ou cookies `HttpOnly` para o frontend e documentá-la em `docs/ARCHITECTURE.md` antes de integrar as telas.

## Limite desta tarefa

Não acessar a Data API do Supabase nem recriar modelos, migrations ou endpoints da API no frontend. O backend ainda depende da migration 003 aplicada no projeto Supabase para `/auth/me` criar o perfil.
