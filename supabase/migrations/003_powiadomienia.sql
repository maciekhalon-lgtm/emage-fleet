-- ============================================================================
-- Emage FLEET — powiadomienia push (uruchom po 002_aplikacja.sql)
-- ============================================================================

-- Urządzenia, na których dana osoba włączyła powiadomienia (telefon, komputer).
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
-- Każdy zarządza tylko swoimi urządzeniami. Wysyłka działa po stronie serwera (funkcja Edge).
create policy push_own_select on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_own_insert on public.push_subscriptions for insert with check (user_id = auth.uid() and public.is_active());
create policy push_own_update on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own_delete on public.push_subscriptions for delete using (user_id = auth.uid());

-- Publiczny klucz powiadomień (ustawienie 'push') muszą móc odczytać wszyscy zatwierdzeni,
-- także kierowcy – inaczej nie włączą powiadomień na swoim telefonie.
create policy settings_select_push on public.settings for select
  using (key = 'push' and public.is_active());
