-- ============================================================================
-- Emage FLEET — zdanie auta „pod domem” (uruchom po 038)
-- Kierowca przy zdaniu wybiera: „Zdaj do bazy” albo „Pod domem” (auto zostaje u niego pod domem).
-- Znacznik trzyma ostatnie zdanie; znika przy kolejnym przejęciu auta.
-- ============================================================================
alter table public.bookings add column if not exists return_home boolean not null default false;
