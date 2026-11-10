# Emage FLEET

System zarządzania flotą firmy Emage Group – **https://emage-fleet.maciekhalon.workers.dev**

| Plik / folder | Co zawiera |
| --- | --- |
| `INSTRUKCJA.md` | instrukcja obsługi (role, menu, najczęstsze czynności, ekran kierowcy) |
| `WDROZENIE.md` | jednorazowe uruchomienie: Supabase, GitHub, Cloudflare, pierwszy administrator |
| `POWIADOMIENIA.md` | powiadomienia push: klucze, funkcja `powiadomienia`, harmonogram, aktualizacja funkcji |
| `MAILE.md` | wysyłka maili przez Gmail i polskie szablony maili |
| `public/` | aplikacja (PWA), publikowana automatycznie przez Cloudflare (Workers Builds) z gałęzi `main` pod adresem https://emage-fleet.maciekhalon.workers.dev |
| `supabase/migrations/` | schemat bazy, reguły ról i automatyka – uruchamiane po kolei w SQL Editor: 001 … 032 |
| `supabase/functions/powiadomienia/` | funkcja wysyłająca powiadomienia (Edge Function) |
| `supabase/tests/` | testy bazy na lokalnym PostgreSQL 16: `PGHOST=… PGPORT=… PGUSER=postgres ./supabase/tests/uruchom.sh` |

## Aplikacja (`public/`)
Bez etapu budowania – zwykłe pliki HTML/CSS/JS ładowane w kolejności z `index.html`.

- wygląd: `style.css` (jeden plik: elementy podstawowe + motyw)
- rdzeń: `config.js`, `motyw.js` (motyw, ikony), `rdzen.js` (stan, daty, logika domenowa), `role.js` (uprawnienia),
  `baza.js` (Supabase: tabele, odświeżanie na żywo, zapisy, pliki), `auth.js` (logowanie), `app.js` (nawigacja, zdarzenia),
  `porzadek.js` (grupy menu i zakładki, książka serwisowa, kierowcy, ustawienia), `formularz.js` (okna formularzy)
- strony: `pulpit.js`, `pojazdy.js`, `karta-pojazdu.js`, `rezerwacje.js` (grafik), `trasy.js`, `terminy.js`, `usterki.js`,
  `koszty.js`, `karty.js` (karty paliwowe), `przebiegi.js` (spalanie i przebiegi aut w zakresie dat), `porownanie.js` (spalanie miesiąc do miesiąca), `liczniki.js` (liczniki z czapy, walidacja licznika, alarm spalania), `raporty.js`, `statystyki.js`, `historia.js`, `uzytkownicy.js`
- kierowca: `kierowca.js` (ekran startowy, wybór auta, moje dane), `zaladunek.js` (załadunek, mój grafik), `wydania.js` (przejęcie, zdanie, przekazanie auta), `offline.js` (praca bez zasięgu)
- pozostałe: `automatyka.js` (blokady, tankowania do wyjaśnienia, opony, grafik), `zdjecia.js`, `import.js` (Excel), `powiadomienia.js`, `moduly.js` (moduły do włączenia i link kalendarza terminów), `sw.js` (service worker – przy zmianach podbij `CACHE`)

## Zasady
- Uprawnień pilnuje baza (reguły RLS i wyzwalacze) – aplikacja tylko ukrywa to, czego dana rola nie może.
- Każda zmiana schematu to nowy plik migracji z kolejnym numerem; po zmianach uruchom testy z `supabase/tests/`.
