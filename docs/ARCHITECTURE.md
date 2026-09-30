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

## Estratégia de sessão (Task 004, frontend)

O frontend usa o padrão BFF (Backend For Frontend) para gerenciar a sessão de autenticação com segurança. Os tokens JWT nunca são acessíveis por JavaScript no navegador.

### Fluxo

```text
Browser → Next.js API Routes (BFF) → FastAPI → Supabase Auth
```

O browser faz chamadas às rotas internas do Next.js (`/api/auth/*`), que:

1. Encaminham credenciais para a API FastAPI.
2. Recebem `access_token` e `refresh_token` na resposta JSON.
3. Armazenam ambos os tokens em cookies `HttpOnly`.
4. Retornam ao client apenas o status da operação (sem tokens).

### Cookies

| Cookie | Conteúdo | HttpOnly | Secure | SameSite | Path | Max-Age |
| --- | --- | --- | --- | --- | --- | --- |
| `gp_at` | access_token | ✓ | ✓ (prod) | Lax | `/api/auth` | `expires_in` da API |
| `gp_rt` | refresh_token | ✓ | ✓ (prod) | Strict | `/api/auth` | 30 dias |

- **HttpOnly**: impede leitura por XSS.
- **Secure**: cookie enviado apenas via HTTPS (desativado em dev para localhost).
- **SameSite=Lax** (access): permite navegação normal ao site.
- **SameSite=Strict** (refresh): usado apenas em POST same-origin, mitigando CSRF.
- **Path=/api/auth**: cookies restritos às rotas do BFF; não enviados em requests para outras rotas Next.js ou assets estáticos.

### Renovação transparente

Quando `GET /api/auth/me` recebe 401 do backend (access token expirado), o BFF tenta renovar a sessão automaticamente usando o refresh token do cookie `gp_rt`. Se a renovação for bem-sucedida, os cookies são atualizados (rotação) e a requisição é re-executada. Os cookies só são limpos quando o refresh token é rejeitado com 401 ou quando o access token recém-emitido também é rejeitado com 401.

Uma falha de renovação só invalida a sessão local quando o backend responde 401,
confirmando que o refresh token não é mais aceito. Rate limit, indisponibilidade,
falha de rede e outros erros do upstream preservam os cookies existentes. Se a
renovação tiver sucesso, mas o retry de `/auth/me` falhar com 429, 503 ou outro
erro não-401, o par de tokens recém-rotacionado também é preservado.

### Rotas BFF

| Rota Next.js | Método | Descrição |
| --- | --- | --- |
| `/api/auth/signup` | POST | Proxy para `/auth/signup`; sem cookies. |
| `/api/auth/login` | POST | Proxy para `/auth/login`; define cookies. |
| `/api/auth/refresh` | POST | Usa cookie `gp_rt` para renovar; atualiza cookies. |
| `/api/auth/refresh` | GET | Retorna `{ has_session: boolean }` (sem revelar token). |
| `/api/auth/me` | GET | Usa cookie `gp_at` para consultar `/auth/me`; renova se 401. |
| `/api/auth/logout` | POST | Limpa apenas os cookies locais; não revoga a sessão no Supabase. |

### Contrato de erros do BFF

As respostas de erro nunca incluem access ou refresh tokens. O campo `code` é
estável para a interface distinguir estados, enquanto `detail` é uma mensagem
legível.

| Situação | Status | `code` | Cookies |
| --- | --- | --- | --- |
| Nenhum cookie de sessão disponível | 401 | `no_session` | não altera |
| Backend rejeita refresh token, ou rejeita novamente o access token recém-emitido | 401 | `invalid_session` | limpa ambos |
| Rate limit do backend/provedor | 429 | `rate_limited` | preserva |
| Backend/provedor indisponível ou falha de rede | 503 | `auth_unavailable` | preserva |
| Resposta 2xx inválida do serviço de autenticação | 502 | `invalid_upstream_response` | preserva |
| Outro erro não-401 do upstream | status original | `auth_upstream_error` | preserva |
| Falha ao limpar cookies no logout | 500 | `local_logout_failed` | sucesso local não confirmado |

O logout bem-sucedido retorna
`{logged_out: true, provider_session_revoked: false}`. Ele encerra a sessão neste
navegador ao remover os cookies `HttpOnly`, mas não chama o endpoint de sign-out
do Supabase. Revogação local/global no provedor é uma decisão de produto separada.

### Garantias de segurança

- Tokens nunca aparecem em URLs, query strings ou logs do navegador.
- Tokens nunca são armazenados em `localStorage`, `sessionStorage` ou state React.
- O refresh token usa `SameSite=Strict`, impedindo envio em requests cross-site.
- O escopo `Path=/api/auth` evita envio desnecessário de cookies em outras requisições.
- Respostas do BFF expõem apenas estado, códigos de erro e dados do usuário; nunca os tokens.

## Integrações

A ordem planejada é IGDB, Steam, Xbox, PlayStation e Nintendo. Steam será a
primeira sincronização real de biblioteca. As demais plataformas exigem provas
de conceito antes de serem tratadas como integrações estáveis.

### Cliente interno IGDB (Task 005)

`app.integrations.igdb.IGDBClient` é o limite interno entre a API e a IGDB. Ele
não registra endpoints FastAPI e não persiste dados. A Task 006 poderá injetar um
`httpx.AsyncClient` configurado com `IGDB_TIMEOUT_SECONDS` e chamar:

```python
await client.query(endpoint="games", apicalypse_query="fields id,name; limit 10;")
```

O retorno é `list[dict[str, Any]]`, somente depois de validar que o upstream
respondeu uma lista de objetos JSON. O chamador deve selecionar explicitamente
os campos na consulta APICalypse e converter a resposta em schemas próprios
antes de expô-la por um endpoint público.

Autenticação usa Client Credentials da Twitch exclusivamente no backend. O
cliente guarda o app access token em memória até pouco antes de `expires_in` e,
ao receber 401 da IGDB, obtém um token novo e repete a consulta uma única vez.
App access tokens não possuem refresh token. Client ID, Client Secret e access
token nunca devem ser retornados pelo FastAPI, registrados em logs ou colocados
em variáveis `NEXT_PUBLIC_*`.

Erros internos são tipados para a camada futura mapear sem revelar o corpo do
provedor: `IGDBAuthenticationError`, `IGDBRateLimitError` (inclui
`retry_after` quando numérico), `IGDBUnavailableError`,
`IGDBInvalidResponseError` e `IGDBRequestError`. Timeouts, falhas de rede e 5xx
são indisponibilidade. O orçamento oficial é de 4 requisições por segundo e até
8 requisições simultâneas; uma implantação com múltiplas instâncias deverá
coordenar cache e limitação fora deste cliente quando a Task 006 definir o
endpoint público.

Variáveis necessárias:

- `IGDB_CLIENT_ID`;
- `IGDB_CLIENT_SECRET`;
- `IGDB_TIMEOUT_SECONDS` (opcional, padrão `10`).

A [documentação oficial da IGDB](https://api-docs.igdb.com/) informa que a API é
gratuita, mas um produto monetizado deve formalizar uma parceria comercial com a
IGDB e exibir atribuição visível à IGDB.com. Essa autorização e a apresentação
da atribuição são requisitos de produto antes de uso comercial; esta tarefa não
concede nem presume licença comercial. O fluxo Client Credentials segue a
[documentação oficial da Twitch](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/).
