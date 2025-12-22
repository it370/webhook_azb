## Aizawl Bazaar WhatsApp AI (RAG)

Node.js + Express backend that bridges Meta WhatsApp Cloud to an AI shopping assistant for Aizawl, using OpenAI for parsing/answering and Supabase (Postgres + pgvector) for product search.

### Prerequisites
- Node 18+
- Supabase project with `vector` extension enabled
- OpenAI API key

### Quick start
1) Install deps: `npm install`
2) Copy env: `cp env.sample .env` and fill values
3) Start server: `npm run dev` (defaults to port 3000)
4) Expose to Meta via tunnel (e.g., `ngrok http 3000`) and set your WhatsApp webhook to `<public_url>/webhook`

### Environment
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (service role key recommended for RLS bypass on RPC)
- `WHATSAPP_VERIFY_TOKEN` (must match the token configured in Meta)
- `PORT` (optional)

See `.env.example` for a template.

### Webhook
- `GET /webhook`: Meta verification. Expects `hub.verify_token` and returns `hub.challenge` when valid.
- `POST /webhook`: Accepts WhatsApp inbound payload (or `{ "text": "..." }` for local testing). Detects order intent, otherwise runs product search + RAG response. Returns `{ reply, products }`.

### Supabase schema
Run in SQL editor:
```sql
create extension if not exists vector;

create table vendors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  veng_location text not null,
  phone_number text
);

create table products (
  id uuid primary key default uuid_generate_v4(),
  vendor_id uuid references vendors(id),
  name text not null,
  price numeric not null,
  description text,
  stock_status boolean default true,
  embedding vector(1536)
);
```

Add an RPC for similarity search (adjust table/column names if needed):
```sql
create or replace function match_products (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
) returns table (
  id uuid,
  name text,
  price numeric,
  description text,
  stock_status boolean,
  vendor_id uuid,
  vendor_name text,
  veng_location text,
  similarity float
) language sql stable as $$
  select
    p.id,
    p.name,
    p.price,
    p.description,
    p.stock_status,
    p.vendor_id,
    v.name as vendor_name,
    v.veng_location,
    1 - (p.embedding <=> query_embedding) as similarity
  from products p
  join vendors v on v.id = p.vendor_id
  where 1 - (p.embedding <=> query_embedding) > match_threshold
  order by p.embedding <=> query_embedding
  limit match_count;
$$;
```

### How it works
- Message parsing: LLM classifies intent (`search` vs `order`) and extracts query text (supports Mizo + English mix).
- Embedding: `text-embedding-3-small` on the query.
- Retrieval: calls `match_products` RPC with similarity threshold 0.5 and top 5.
- Response: `gpt-4o-mini` generates a concise WhatsApp-friendly bullet list with bold product names and shop info. If intent is order, logs a mock pending order and returns a confirmation.
- Safety: System prompt refuses non-shopping or non-Aizawl topics.

### Local testing
`curl -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d "{\"text\": \"Chanmari-ah cake a awm em?\"}"`

### Next steps
- Persist orders into Supabase
- Add auth/verification for Meta signatures
- Add monitoring + request logging

