# Arquitetura

## Componentes

- Frontend: Next.js, TypeScript, Tailwind CSS e shadcn/ui.
- Backend: Python, FastAPI, Pydantic e SQLAlchemy.
- Banco e autenticação: PostgreSQL e Supabase Auth.
- Catálogo: IGDB.
- Deploy previsto: Vercel, Railway e Supabase.

## Fluxo

```text
Next.js → FastAPI → PostgreSQL/Supabase → integrações externas
```

O frontend não acessa diretamente IGDB, Steam, Xbox, PlayStation, Nintendo nem
qualquer serviço que exija secrets. Toda integração passa pelo backend.

## Contratos da API

Endpoints consumidos pelo frontend devem documentar:

- método e caminho;
- parâmetros e corpo da requisição;
- formato da resposta;
- campos opcionais;
- códigos de erro.

Breaking changes devem ser destacadas. Não crie endpoints inexistentes apenas
para satisfazer uma tela.

Mocks temporários são permitidos quando identificados como tal, isolados de
produção e removidos assim que a API real estiver disponível.

## Autenticação (Task 004, backend)

O frontend usa exclusivamente a API FastAPI para cadastro, login, renovação da sessão e consultas do usuário. A API encaminha credenciais ao Supabase Auth com uma chave publicável e valida cada bearer token protegido consultando `GET /auth/v1/user`. A API não confia em IDs enviados pelo navegador, e cria um `profiles` mínimo no primeiro `GET /auth/me` validado, com username provisório `player_<uuid sem hífens>`.

| Método | Caminho | Entrada | Resposta | Erros |
| --- | --- | --- | --- | --- |
| POST | `/auth/signup` | JSON `{email, password}` | 202 `{message}`; confirmação de e-mail pode ser necessária | 400, 429, 503 |
| POST | `/auth/login` | JSON `{email, password}` | 200 `{access_token, refresh_token, token_type, expires_in}` | 401, 429, 503 |
| POST | `/auth/refresh` | JSON `{refresh_token}` | 200 mesmos campos; substitua o refresh token anterior | 401, 429, 503 |
| GET | `/auth/me` | `Authorization: Bearer <access_token>` | 200 `{id, email}` | 401, 429, 503 |

Requisições com corpo inválido retornam 422. Erros do provedor não são repassados com dados internos. Outros endpoints privados devem depender de `get_current_profile` e obter o identificador do usuário validado. O backend não usa o Data API para as seis tabelas iniciais.

Para o Antigravity: criar páginas de cadastro/login, estados de confirmação de e-mail, expiração e renovação de sessão, tratamento de 401/429/503 e rota protegida de perfil. Planejar armazenamento de sessão no lado do servidor ou em cookies `HttpOnly`; nunca colocar o refresh token em URL ou registrar tokens em logs. A origem do frontend deve corresponder a `WEB_ORIGIN`. Não acessar o Supabase Auth diretamente no navegador, conforme o fluxo de arquitetura definido aqui.

## Integrações

A ordem planejada é IGDB, Steam, Xbox, PlayStation e Nintendo. Steam será a
primeira sincronização real de biblioteca. As demais plataformas exigem provas
de conceito antes de serem tratadas como integrações estáveis.
