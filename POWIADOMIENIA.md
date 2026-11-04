# Emage FLEET – uruchomienie powiadomień push (krok 5)

Każda osoba dostaje raz dziennie rano jedno powiadomienie z jej sprawami na dziś –
tylko gdy coś wymaga uwagi:

| Rola | Co obejmuje podsumowanie |
| --- | --- |
| Kierowca | jutrzejszy / dzisiejszy odbiór auta, dzisiejszy zwrot, auto niezwrócone po terminie, ważność prawa jazdy i badań (30, 14, 7, 3, 1 dzień przed) |
| Kierownik serwisu | terminy po czasie i w ciągu 7 dni, przebieg do serwisu ≤ 1000 km, niesprawne auta, nowe usterki, niezwrócone auta |
| Kierownik floty | to samo co serwis + konta czekające na zatwierdzenie, przekroczone limity kosztów i budżet, nakładające się rezerwacje |

Zajmie ok. 15 minut. Klucze i hasła wpisujesz sam – Claude ich nie wpisuje.

---

## 1. Skrypt bazy
Supabase → **SQL Editor** → wklej `supabase/migrations/003_powiadomienia.sql` → **Run**.

## 2. Rozszerzenia bazy
Supabase → **Database → Extensions** → włącz **pg_cron** i **pg_net** (wyszukaj po nazwie, przełącznik → Enable).

## 3. Klucze
1. W aplikacji Emage FLEET → zakładka **Ustawienia** → panel **Powiadomienia – konfiguracja** → **Wygeneruj klucze**.
   Klucze powstają w Twojej przeglądarce. Klucz publiczny aplikacja zapisuje sama w bazie.
2. Zostaw tę kartę otwartą – za chwilę skopiujesz z niej wartości.

## 4. Funkcja wysyłająca
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nazwa funkcji: **`powiadomienia`** (dokładnie tak).
3. Usuń przykładowy kod i wklej całą zawartość pliku `supabase/functions/powiadomienia/index.ts` → **Deploy function**.
4. Po wdrożeniu otwórz funkcję → **Settings** (lub *Details*) → wyłącz **Verify JWT** (Enforce JWT verification) → **Save**.
   Funkcja sama sprawdza, kto ją wywołuje (sekret harmonogramu albo zalogowany użytkownik).
5. **Edge Functions → Secrets** (Manage secrets) → dodaj cztery sekrety, kopiując je z aplikacji przyciskami *Kopiuj*:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (np. `mailto:flota@twojafirma.pl`)
   - `CRON_SECRET`

## 5. Harmonogram
W aplikacji skopiuj pole **Harmonogram (SQL)** → Supabase → **SQL Editor** → wklej → **Run**.
Powiadomienia przychodzą codziennie o 7:30 (zimą) / 8:30 (latem), bo harmonogram działa w czasie UTC.

Gdy wszystko skopiujesz, kliknij w aplikacji **Gotowe – ukryj klucze**. Klucza prywatnego nie zapisuj nigdzie indziej.

## 6. Włączenie na urządzeniu
Każda osoba robi to sama, na każdym telefonie lub komputerze:
1. W aplikacji w nagłówku kliknij **Powiadomienia** → **Włącz powiadomienia** → zezwól w przeglądarce.
2. Kliknij **Wyślij testowe** – po chwili powinno przyjść powiadomienie „Powiadomienia działają…”.

**iPhone:** powiadomienia działają tylko w aplikacji dodanej do ekranu (Safari → Udostępnij →
*Do ekranu początkowego*), na iOS 16.4 lub nowszym. Włącz je, otwierając Emage FLEET z ikony.

---

### Gdy coś nie działa
- *„Funkcja wysyłająca nie odpowiada”* – funkcja nie jest wdrożona pod nazwą `powiadomienia` albo ma włączone Verify JWT.
- Test mówi „nie znaleziono tego urządzenia” – wyłącz i włącz powiadomienia ponownie.
- Zero powiadomień rano – sprawdź w SQL Editor: `select * from cron.job_run_details order by start_time desc limit 5;`
- Wygenerowanie **nowych** kluczy unieważnia wszystkie włączone urządzenia – każdy musi włączyć powiadomienia ponownie.

---

## Aktualizacja funkcji (podmiana kodu)

Po zmianach w pliku `supabase/functions/powiadomienia/index.ts` trzeba wgrać nową wersję funkcji:
1. Na GitHubie otwórz plik `supabase/functions/powiadomienia/index.ts` → przycisk **Copy raw file** (ikona kopiowania nad kodem).
2. Supabase → **Edge Functions** → **powiadomienia** → zakładka **Code** → zaznacz cały stary kod, usuń, wklej nowy → **Deploy**.
3. Sekrety i harmonogram zostają bez zmian. Verify JWT ma zostać wyłączone.

Nowa wersja dodaje:
- powiadomienia **od razu** (z bazy, migracja 014): auto niesprawne (oba kierownicze konta), podejrzane tankowanie,
  wyjaśnienie kierowcy, spory w obsadzie, sprzątanie i zmiany danych do potwierdzenia (kierownik floty),
  prośba o wyjaśnienie tankowania (kierowca),
- w porannym podsumowaniu: badania psychologiczne, przypomnienie N km przed terminem (np. 2000 km przed olejem),
  auta zablokowane, opony do wymiany, tankowania do wyjaśnienia.
