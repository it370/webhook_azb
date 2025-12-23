-- Product catalog hardening for production
-- Run inside Supabase SQL editor or psql connected to your project.

create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- Core taxonomies
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists subcategories (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references categories(id) on delete cascade,
  slug text not null unique,
  name text not null,
  description text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists tags (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  created_at timestamptz default now()
);

-- Vendor defaults for commissions
alter table if exists vendors
  add column if not exists default_commission_percent numeric(5,2),
  add column if not exists default_commission_fixed_amount numeric(12,2);

-- Products: alter existing table to add required metadata
alter table if exists products
  add column if not exists vendor_id uuid references vendors(id) on delete set null,
  add column if not exists category_id uuid references categories(id),
  add column if not exists subcategory_id uuid references subcategories(id),
  add column if not exists slug text,
  add column if not exists sku text,
  add column if not exists status text not null default 'draft' check (status in ('draft','published','archived')),
  add column if not exists currency_code text not null default 'INR',
  add column if not exists search_description text,
  add column if not exists search_keywords text,
  add column if not exists stock_quantity int,
  add column if not exists unit_label text,
  add column if not exists package_size text,
  add column if not exists cover_image_url text,
  add column if not exists thumbnail_url text,
  add column if not exists minified_image_url text,
  add column if not exists hero_image_url text,
  add column if not exists commission_percent numeric(5,2),
  add column if not exists commission_fixed_amount numeric(12,2),
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedding_updated_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Ensure slug uniqueness per vendor (conditional because IF NOT EXISTS is unsupported for constraints)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_slug_unique_per_vendor'
  ) then
    alter table products
      add constraint products_slug_unique_per_vendor unique (vendor_id, slug);
  end if;
end $$;

create index if not exists products_status_idx on products(status);
create index if not exists products_vendor_idx on products(vendor_id);
create index if not exists products_category_idx on products(category_id, subcategory_id);
create index if not exists products_textsearch_idx on products using gin (
  to_tsvector(
    'english',
    coalesce(name,'') || ' ' ||
    coalesce(description,'') || ' ' ||
    coalesce(search_description,'') || ' ' ||
    coalesce(search_keywords,'')
  )
);

-- Product/tag mapping
create table if not exists product_tags (
  product_id uuid references products(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

-- Image variants (original, thumb, minified, hero)
create table if not exists product_images (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  variant text not null check (variant in ('original','thumbnail','minified','hero','gallery')),
  url text not null,
  width int,
  height int,
  size_bytes int,
  mime_type text,
  cdn_path text,
  created_at timestamptz default now()
);

-- Ensure uniqueness per product + variant for idempotent upserts
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_images_product_variant_key'
  ) then
    alter table product_images
      add constraint product_images_product_variant_key unique (product_id, variant);
  end if;
end $$;

-- Dedicated embeddings table (allows multiple models/versions)
create table if not exists product_embeddings (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid unique references products(id) on delete cascade,
  model text not null,
  source_text text,
  embedding vector(1536) not null,
  created_at timestamptz default now()
);

create index if not exists product_embeddings_model_idx on product_embeddings(model);
create index if not exists product_embeddings_ivfflat on product_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Similarity search RPC across enriched product data.
-- Drop first to avoid return type conflicts with previous definition.
drop function if exists match_products(vector, double precision, integer);
create or replace function match_products (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
) returns table (
  id uuid,
  name text,
  price numeric,
  description text,
  search_description text,
  stock_status boolean,
  stock_quantity int,
  vendor_id uuid,
  vendor_name text,
  veng_location text,
  category text,
  subcategory text,
  tags text[],
  cover_image_url text,
  thumbnail_url text,
  minified_image_url text,
  commission_percent numeric,
  commission_fixed_amount numeric,
  similarity float
) language sql stable as $$
  select
    p.id,
    p.name,
    p.price,
    p.description,
    p.search_description,
    p.stock_status,
    p.stock_quantity,
    p.vendor_id,
    v.name as vendor_name,
    v.veng_location,
    c.name as category,
    sc.name as subcategory,
    array_remove(array_agg(distinct t.name), null) as tags,
    p.cover_image_url,
    p.thumbnail_url,
    p.minified_image_url,
    coalesce(p.commission_percent, v.default_commission_percent) as commission_percent,
    coalesce(p.commission_fixed_amount, v.default_commission_fixed_amount) as commission_fixed_amount,
    1 - (pe.embedding <=> query_embedding) as similarity
  from product_embeddings pe
  join products p on p.id = pe.product_id and p.status = 'published'
  join vendors v on v.id = p.vendor_id
  left join categories c on c.id = p.category_id
  left join subcategories sc on sc.id = p.subcategory_id
  left join product_tags pt on pt.product_id = p.id
  left join tags t on t.id = pt.tag_id
  where 1 - (pe.embedding <=> query_embedding) > match_threshold
  group by
    p.id, p.name, p.price, p.description, p.search_description, p.stock_status,
    p.stock_quantity, p.vendor_id, v.name, v.veng_location, c.name, sc.name,
    p.cover_image_url, p.thumbnail_url, p.minified_image_url,
    p.commission_percent, p.commission_fixed_amount,
    v.default_commission_percent, v.default_commission_fixed_amount,
    pe.embedding
  order by pe.embedding <=> query_embedding
  limit match_count;
$$;

comment on function match_products is 'Vector similarity search over published products with category/tag metadata';

-- Convenience view to expose a flattened product record for admin/API reads.
create or replace view product_catalog_view as
select
  p.*,
  c.name as category_name,
  sc.name as subcategory_name,
  array_remove(array_agg(distinct t.name), null) as tag_names
from products p
left join categories c on c.id = p.category_id
left join subcategories sc on sc.id = p.subcategory_id
left join product_tags pt on pt.product_id = p.id
left join tags t on t.id = pt.tag_id
group by p.id, c.name, sc.name;


