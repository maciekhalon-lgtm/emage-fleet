-- ============================================================================
-- Emage FLEET — moduły do włączenia i wyłączenia (uruchom po 024)
-- Ustawienie 'modules' (załadunek, przystanki, podwójna obsada) musi widzieć też kierowca,
-- bo od niego zależy, co pokazuje się na ekranie „Moje auto”.
-- Link kalendarza ('calendar') zostaje widoczny tylko dla kierowników.
-- ============================================================================
drop policy if exists settings_select_public on public.settings;
create policy settings_select_public on public.settings for select
  using (key in ('push', 'checklist', 'schedule', 'announce', 'modules') and public.is_active());
