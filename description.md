Project Goal: Build a WhatsApp-based AI Commerce engine using a RAG (Retrieval-Augmented Generation) architecture. The system must allow users to query a local Aizawl product catalog via WhatsApp and receive intelligent, location-aware responses.

1. The Tech Stack
Backend: Node.js with Express.

Database: Supabase (Postgres) with pgvector enabled for semantic search.

AI Engine: OpenAI gpt-4o-mini for reasoning and text-embedding-3-small for vector search.

WhatsApp Bridge: Official Meta WhatsApp Cloud API.

2. Database Schema (Run this in Supabase first)
SQL

-- Enable the vector extension
create extension if not exists vector;

-- Table for Store/Vendors
create table vendors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  veng_location text not null, -- e.g., 'Chanmari', 'Mission Veng'
  phone_number text
);

-- Table for Products
create table products (
  id uuid primary key default uuid_generate_v4(),
  vendor_id uuid references vendors(id),
  name text not null,
  price numeric not null,
  description text,
  stock_status boolean default true,
  embedding vector(1536) -- For RAG
);
3. Functional Requirements for Cursor
Webhook Handler: Create a /webhook endpoint (GET for verification, POST for receiving messages).

Mizlish/English Parser: Use the LLM to understand mixed Mizo-English text (e.g., "Chanmari-ah cake tui deuh a awm em?").

RAG Logic:

Convert incoming user text into a vector embedding.

Query Supabase using a match function to find products with a similarity threshold > 0.5.

Pass the retrieved products as "context" to the LLM.

Response Generation: LLM must generate a concise WhatsApp message listing the product, price, and shop name.

Ordering Logic: If a user says "I want to buy [X]", trigger a function to log a "pending_order" and return a mock payment confirmation message.

4. Implementation Rules
Safety: Never answer questions unrelated to shopping or Aizawl logistics.

Cost Efficiency: Use gpt-4o-mini for all chat completions.

Scannability: Format product lists using bold text and bullet points for easy reading on mobile.