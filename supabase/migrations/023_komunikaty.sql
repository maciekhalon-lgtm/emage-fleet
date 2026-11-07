-- ============================================================================
-- Emage FLEET — komunikaty kierownika dla kierowców (uruchom po 022)
-- Komunikaty są w settings (klucz 'announce'); kierowca musi móc je odczytać.
-- ============================================================================
drop policy if exists settings_select_public on public.settings;
create policy settings_select_public on public.settings for select
  using (key in ('push', 'checklist', 'schedule', 'announce') and public.is_active());
