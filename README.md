# Emage FLEET

System zarządzania flotą firmy Emage Group.

- `supabase/migrations/` – schemat bazy danych z regułami ról (Supabase, region Frankfurt)
- `INSTRUKCJA-KONTA.md` – zakładanie kont i pierwszego administratora

- `public/` – aplikacja (PWA), publikowana przez Cloudflare Pages
- `supabase/migrations/` uruchamiaj po kolei w SQL Editor: 001, 002, 003, 004, 005, 006, 007, 008, 009
- `URUCHOMIENIE.md` – co zrobić po wgraniu aplikacji (drugi skrypt bazy, adres strony, pierwszy administrator)

Struktura aplikacji: `index.html` + `style.css`, wspólne moduły (`config.js`, `baza.js`, `auth.js`, `role.js`, `rdzen.js`, `formularz.js`, `app.js`) i osobny plik na każdą podstronę (`pojazdy.js`, `karta-pojazdu.js`, `terminy.js`, `usterki.js`, `rezerwacje.js`, `kalendarz.js`, `wydania.js`, `koszty.js`, `statystyki.js`, `raporty.js`, `historia.js`, `import.js`, `uzytkownicy.js`, `kierowca.js`).
