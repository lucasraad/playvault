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

## Integrações

A ordem planejada é IGDB, Steam, Xbox, PlayStation e Nintendo. Steam será a
primeira sincronização real de biblioteca. As demais plataformas exigem provas
de conceito antes de serem tratadas como integrações estáveis.
