# Emage FLEET

System zarządzania flotą firmy Emage Group.

| Plik / folder | Co zawiera |
| --- | --- |
| `INSTRUKCJA.md` | instrukcja obsługi (role, menu, najczęstsze czynności, ekran kierowcy) |
| `WDROZENIE.md` | jednorazowe uruchomienie: Supabase, GitHub, Cloudflare, pierwszy administrator |
| `POWIADOMIENIA.md` | powiadomienia push: klucze, funkcja `powiadomienia`, harmonogram, aktualizacja funkcji |
| `MAILE.md` | wysyłka maili przez Gmail i polskie szablony maili |
| `public/` | aplikacja (PWA), publikowana automatycznie przez Cloudflare Pages z gałęzi `main` |
| `supabase/migrations/` | schemat bazy, reguły ról i automatyka – uruchamiane po kolei w SQL Editor: 001 … 016 |
| `supabase/functions/powiadomienia/` | funkcja wysyłająca powiadomienia (Edge Function) |
| `supabase/tests/` | testy bazy na lokalnym PostgreSQL 16: `PGHOST=… PGPORT=… PGUSER=postgres ./supabase/tests/uruchom.sh` |

## Aplikacja (`public/`)
Bez etapu budowania – zwykłe pliki HTML/CSS/JS ładowane w kolejności z `index.html`.

- rdzeń: `config.js`, `motyw.js` (motyw, ikony), `rdzen.js` (stan, daty, logika domenowa), `role.js` (uprawnienia),
  `baza.js` (Supabase: tabele, odświeżanie na żywo, zapisy, pliki), `auth.js` (logowanie), `app.js` (nawigacja, zdarzenia),
  `porzadek.js` (grupy menu i zakładki, książka serwisowa, kierowcy, ustawienia), `formularz.js` (okna formularzy)
- strony: `pulpit.js`, `pojazdy.js`, `karta-pojazdu.js`, `rezerwacje.js`, `kalendarz.js`, `trasy.js`, `terminy.js`, `usterki.js`,
  `kontrole.js`, `koszty.js`, `raporty.js`, `statystyki.js`, `historia.js`, `uzytkownicy.js`
- kierowca: `kierowca.js` (ekran startowy, wybór auta, moje dane), `wydania.js` (przejęcie, zdanie, przekazanie auta), `offline.js` (praca bez zasięgu)
- pozostałe: `automatyka.js` (blokady, tankowania do wyjaśnienia, opony, grafik), `zdjecia.js`, `import.js` (Excel), `powiadomienia.js`, `sw.js` (service worker – przy zmianach podbij `CACHE`)

## Zasady
- Uprawnień pilnuje baza (reguły RLS i wyzwalacze) – aplikacja tylko ukrywa to, czego dana rola nie może.
- Każda zmiana schematu to nowy plik migracji z kolejnym numerem; po zmianach uruchom testy z `supabase/tests/`.
