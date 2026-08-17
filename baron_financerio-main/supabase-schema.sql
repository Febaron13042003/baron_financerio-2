-- ==========================================================================
-- Baron Financeiro — Schema do Supabase
-- Cole tudo isso no SQL Editor do seu projeto Supabase e clique em "Run".
-- Roda só uma vez.
-- ==========================================================================

-- Tabela única que guarda o estado completo do app por usuário
create table if not exists app_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Habilita Row Level Security: cada usuário só vê/edita os próprios dados
alter table app_state enable row level security;

-- Policies — cada usuário pode ler/inserir/atualizar SOMENTE a própria linha
drop policy if exists "user reads own state"   on app_state;
drop policy if exists "user inserts own state" on app_state;
drop policy if exists "user updates own state" on app_state;

create policy "user reads own state" on app_state
  for select using (auth.uid() = user_id);

create policy "user inserts own state" on app_state
  for insert with check (auth.uid() = user_id);

create policy "user updates own state" on app_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Trigger pra atualizar updated_at automaticamente em cada UPDATE
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_state_updated_at on app_state;
create trigger trg_app_state_updated_at
  before update on app_state
  for each row execute function set_updated_at();

-- Pronto! Confirme com:
--   select * from app_state;  -- deve estar vazio
