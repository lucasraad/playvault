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

### Busca de jogos (Task 006)

Fluxo: `Browser → GET /api/catalog/games/search (Next.js) → GET
/catalog/games/search (FastAPI) → IGDBClient → IGDB`. A rota BFF fica fora de
`/api/auth`: os cookies `gp_at` e `gp_rt` continuam com `Path=/api/auth`, não são
enviados para a busca e não tiveram escopo ampliado. A busca de catálogo é
pública e somente leitura; o BFF não encaminha cookies de autenticação nem
`Authorization`. Ela permanece protegida tanto no BFF quanto no FastAPI, pois a
rota FastAPI também pode ser acessada diretamente.

| Camada | Método e rota | Parâmetros |
| --- | --- | --- |
| Navegador/BFF | `GET /api/catalog/games/search` | `q` obrigatório, 2–80 caracteres; `limit` opcional, 1–20, padrão 10 |
| FastAPI | `GET /catalog/games/search` | Mesmo contrato; não aceita corpo ou consulta APICalypse do cliente |

O backend constrói uma consulta fixa ao endpoint IGDB `games`, exclui versões
com `version_parent`, limita o resultado e seleciona explicitamente `id`,
`name`, `slug`, `summary`, `first_release_date`, capa, plataformas e gêneros.
Caracteres de controle de APICalypse (`"`, `;`, `\\`, `{`, `}`) não são aceitos
na entrada pública.

Resposta `200`:

```json
{
  "query": "Halo",
  "limit": 10,
  "results": [
    {
      "igdb_id": 740,
      "name": "Halo: Combat Evolved",
      "slug": "halo-combat-evolved",
      "summary": null,
      "first_release_date": "2001-11-15",
      "cover_url": null,
      "platforms": [{"igdb_id": 11, "name": "Xbox", "abbreviation": "XBOX"}],
      "genres": [{"igdb_id": 5, "name": "Shooter"}]
    }
  ]
}
```

`summary`, `first_release_date`, `cover_url` e `platforms[].abbreviation` podem
ser `null`; as listas podem ser vazias. `igdb_id` é uma referência externa e
**não** é `games.id`, que continua sendo um UUID interno criado somente quando
um fluxo futuro persistir um jogo. Buscar não cadastra jogo, não cria entrada de
biblioteca e não escreve no banco.

#### Proteção preventiva e cache

Em produção, Next.js e FastAPI usam o **mesmo banco Upstash Redis**, acessado
pela REST API, para que os limites sejam compartilhados entre todas as
instâncias. Cache não substitui o orçamento global: apenas cache misses podem
consumir esse orçamento e chamar a IGDB.

- por visitante: 10 buscas em uma janela móvel de 60 segundos no BFF e também
  no FastAPI, inclusive quando houver cache hit;
- global: no máximo 4 cache misses por segundo em todas as instâncias e no
  máximo 8 chamadas IGDB simultâneas. Cada chamada adquire um lease de 15
  segundos, renovado a cada 5 segundos enquanto permanecer em andamento;
- cache: resposta validada por consulta normalizada e `limit`, TTL de 60
  segundos, compartilhado entre instâncias;
- falha fechada: configuração ausente, timeout, resposta inválida ou
  indisponibilidade do Redis devolve 503 `catalog_protection_unavailable` e a
  IGDB não é chamada.

O BFF cria `pv_catalog_visitor`, cookie assinado, `HttpOnly`, `SameSite=Lax`,
`Secure` em produção e limitado a `Path=/api/catalog`. Ele encaminha ao FastAPI
apenas o identificador assinado em `X-PlayVault-Catalog-Visitor`. Limpar o cookie
pode reiniciar o orçamento por visitante no BFF; portanto esse limite é uma
barreira de abuso de melhor esforço, enquanto o limite global é a proteção
incontornável do orçamento IGDB.

No acesso direto, o FastAPI aceita esse identificador somente com assinatura
válida; caso contrário deriva a identidade de `request.client.host`. O código
deliberadamente ignora `X-Forwarded-For` fornecido pelo cliente. Em uma
implantação atrás de proxy, a infraestrutura ASGI deve aceitar informações do
proxy somente de endereços confiáveis; sem essa configuração, visitantes podem
ser agrupados no endereço do proxy (restrição excessiva), mas não escolher um
IP arbitrário para contornar o limite.

Variáveis obrigatórias em produção, com os mesmos valores/recursos no Vercel e
no Railway:

- `APP_ENVIRONMENT=production` no FastAPI;
- `CATALOG_VISITOR_SECRET`, segredo aleatório com ao menos 32 caracteres;
- `UPSTASH_REDIS_REST_URL`;
- `UPSTASH_REDIS_REST_TOKEN`;
- `CATALOG_STORE_TIMEOUT_SECONDS` opcional no FastAPI, padrão 2 segundos.

A integração do Upstash pelo Marketplace da Vercel injeta variáveis apenas no
projeto Vercel; URL e token devem ser configurados separadamente no Railway,
apontando para o mesmo banco. Enquanto qualquer item estiver ausente, a busca
pública fica desabilitada em produção por falha fechada. Somente quando
`APP_ENVIRONMENT` for explicitamente `development` ou `test` é permitido
armazenamento em memória, que vale para uma única instância e não representa a
proteção de produção. O padrão seguro é `production`.

Erros públicos estáveis:

| Status | `code` | Situação |
| --- | --- | --- |
| 400 | `invalid_search` | entrada rejeitada pelo BFF ou serviço |
| 422 | validação FastAPI | parâmetro ausente ou fora dos limites no acesso direto à API |
| 429 | `catalog_visitor_rate_limited` | orçamento do visitante esgotado |
| 429 | `catalog_global_rate_limited` | orçamento global ou concorrência esgotados |
| 429 | `catalog_upstream_rate_limited` | limite devolvido pela IGDB |
| 502 | `invalid_catalog_response` | sucesso upstream com schema inválido |
| 502 | `catalog_upstream_error` | outra rejeição ou erro inesperado do backend |
| 503 | `catalog_unavailable` | credenciais ausentes/rejeitadas, timeout, rede ou 5xx |
| 503 | `catalog_protection_unavailable` | proteção compartilhada ausente ou indisponível |

O frontend consome `searchGames` de `api-client.ts`. A URL interna do FastAPI
deve usar `API_URL` no servidor Next.js; `NEXT_PUBLIC_API_URL` permanece apenas
como fallback de compatibilidade. Nenhuma resposta contém credenciais, app
token, consulta APICalypse ou payload bruto da IGDB.

### Adição à biblioteca a partir do catálogo (Task 007)

Fluxo autenticado: `Browser → POST /api/auth/library/entries (Next.js BFF) →
POST /library/entries/from-catalog (FastAPI) → IGDBClient + PostgreSQL`.

A rota BFF permanece deliberadamente sob `/api/auth`. Os cookies `gp_at` e
`gp_rt` continuam restritos a `Path=/api/auth`, sem ampliar tokens para todas as
rotas `/api`. Por ser escrita autenticada, a rota aceita somente JSON enviado
da mesma origem: `Origin` deve corresponder à origem da requisição e
`Sec-Fetch-Site`, quando presente, deve ser `same-origin`.

| Camada | Método e rota | Corpo |
| --- | --- | --- |
| Navegador/BFF | `POST /api/auth/library/entries` | `{igdb_id, platform_igdb_id}` |
| FastAPI | `POST /library/entries/from-catalog` | Mesmo corpo; bearer obrigatório |

Ambos os IDs do corpo são inteiros positivos da IGDB. O cliente não envia
`profile_id`, `games.id` ou `platforms.id`. O FastAPI obtém o perfil da sessão
validada, consulta a IGDB por uma query fixa e confirma que a plataforma
selecionada pertence ao jogo antes de escrever. Então resolve ou cria `Game` e
`Platform` com UUIDs internos, registra `GamePlatform` e cria `LibraryEntry`
com `status=backlog` e `source=manual`. A biblioteca manual continua
independente da disponibilidade da IGDB; somente este fluxo de catálogo exige a
integração.

Resposta `201` quando criada e `200` quando a mesma combinação já existe:

```json
{
  "id": "uuid-da-entrada",
  "game": {
    "id": "uuid-interno-do-jogo",
    "igdb_id": 1942,
    "title": "The Witcher 3: Wild Hunt"
  },
  "platform": {
    "id": "uuid-interno-da-plataforma",
    "igdb_id": 6,
    "slug": "pc",
    "name": "PC"
  },
  "status": "backlog",
  "source": "manual",
  "created": true
}
```

Erros públicos estáveis:

| Status | `code` | Situação |
| --- | --- | --- |
| 400 | `invalid_library_request` | corpo rejeitado pelo BFF |
| 401 | `no_session` ou `invalid_session` | sessão ausente ou rejeitada |
| 403 | `invalid_origin` | tentativa de escrita fora da mesma origem |
| 404 | `catalog_game_not_found` | jogo não existe mais na IGDB |
| 415 | `invalid_content_type` | corpo não é JSON |
| 422 | `catalog_platform_not_found` | plataforma não pertence ao jogo |
| 429 | `rate_limited` | renovação de sessão limitada |
| 429 | `catalog_upstream_rate_limited` | IGDB limitou a resolução |
| 502 | `invalid_catalog_response` ou `catalog_upstream_error` | resposta inválida/rejeitada do catálogo |
| 502 | `invalid_library_response` ou `library_upstream_error` | contrato inesperado entre BFF e FastAPI |
| 503 | `auth_unavailable` | autenticação/refresh indisponível |
| 503 | `catalog_unavailable` | IGDB indisponível |
| 503 | `library_unavailable` | banco ou serviço de biblioteca indisponível |

O BFF tenta renovar uma vez quando o FastAPI responde 401. Refresh rejeitado
com 401, ou novo access token também rejeitado com 401, limpa a sessão. Falhas
429, 5xx, rede e respostas inválidas preservam os cookies; se houver rotação
antes de uma falha transitória no retry, o novo par permanece armazenado.
