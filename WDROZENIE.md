# Emage FLEET – wdrożenie (Supabase, GitHub, Cloudflare)

Jednorazowe uruchomienie systemu. Instrukcja obsługi: `INSTRUKCJA.md`.


Zajmie to ok. 30 minut. Wszystko robisz sam, bo konta i hasła należą do firmy.
Claude nie zakłada kont i nie wpisuje haseł ani kluczy za Ciebie.

---

## A. Supabase – baza danych i logowanie

1. Wejdź na **supabase.com** → *Start your project* → zarejestruj się firmowym e-mailem
   (najlepiej ogólnym, np. it@ lub flota@, żeby konto nie było przypięte do jednej osoby).
2. Utwórz organizację **Emage Group**. Plan na start: **Free** (na testy). Przed uruchomieniem
   dla całej firmy przejdź na **Pro** (ok. 25 USD / mies.), bo darmowy projekt usypia się po tygodniu bez ruchu.
3. *New project*:
   - Name: `emage-fleet`
   - Database password: wygeneruj i **zapisz w menedżerze haseł** (nie wysyłaj go w czacie)
   - Region: **Central EU (Frankfurt)**
4. Gdy projekt się utworzy, otwórz **SQL Editor** → *New query* → wklej całą zawartość pliku
   `supabase/migrations/001_schemat.sql` → **Run**. Powinno pojawić się „Success. No rows returned”.
5. **Authentication → Sign In / Providers → Email**:
   - Email: włączone
   - **Confirm email: włączone** (nowa osoba musi potwierdzić adres)
   - Minimalna długość hasła: 10
6. **Authentication → URL Configuration**: na razie nic – uzupełnimy, gdy będzie gotowy adres strony.
7. **Project Settings → API**: skopiuj i wyślij mi w czacie **tylko dwie rzeczy**:
   - *Project URL* (np. `https://abcd1234.supabase.co`)
   - klucz **anon / publishable** (jest przeznaczony do aplikacji w przeglądarce, można go podać)

   **Nigdy nie wysyłaj klucza `service_role` / `secret`** – on omija wszystkie reguły bezpieczeństwa.

## B. GitHub – miejsce na kod

1. Załóż konto na **github.com** (również na adres firmowy).
2. *New repository* → nazwa `emage-fleet` → **Private** → bez README → *Create*.
3. W Claude: **Ustawienia → Konektory → GitHub** → połącz konto i daj dostęp do repozytorium
   `emage-fleet`. Wtedy będę mógł wysyłać tam kod.
4. Napisz mi nazwę konta, np. `emagegroup/emage-fleet`.

## C. Cloudflare – hosting strony

1. Załóż konto na **dash.cloudflare.com** (plan **Free**).
2. Na razie nic więcej – stronę podepniemy, gdy kod będzie w GitHubie
   (Workers & Pages → Create → Pages → Connect to Git → `emage-fleet`).
3. Jeśli firma ma domenę (np. emagegroup.pl), podaj ją – ustawimy adres `fleet.twojadomena.pl`.

---

## D. Pierwszy administrator (po uruchomieniu strony)

Gdy strona będzie działać, zarejestrujesz się na niej jak każdy pracownik. Twoje konto
trzeba raz zatwierdzić ręcznie, bo nie ma jeszcze nikogo, kto mógłby to zrobić.
W Supabase → **SQL Editor** uruchomisz:

```sql
update public.profiles
set status = 'active', role = 'floty', approved_at = now()
where email = 'TWOJ_ADRES@firma.pl';
```

Od tej chwili zatwierdzasz wszystkich pozostałych w panelu **Użytkownicy** na stronie.

---

## Jak działa rejestracja

1. Pracownik wchodzi na stronę → **Załóż konto** → imię i nazwisko, e-mail, hasło.
2. Dostaje e-mail z linkiem potwierdzającym adres.
3. Po zalogowaniu widzi tylko komunikat „Konto czeka na zatwierdzenie”.
4. Kierownik floty w panelu **Użytkownicy** nadaje rolę (kierownik floty / kierownik serwisu / kierowca),
   a kierowcę wiąże z jego wpisem na liście kierowców. Może też zablokować konto.
5. Uprawnienia pilnuje baza danych: kierowca nie odczyta cudzych kosztów ani nie nada sobie roli,
   nawet gdyby próbował obejść stronę.

---


Kod aplikacji jest w folderze `public/`. Cloudflare (Workers Builds) publikuje go automatycznie
po każdej zmianie w GitHubie (ok. 1–2 minut). Adres strony: **https://emage-fleet.maciekhalon.workers.dev**

## E. Uruchomienie aplikacji

### 1. Skrypty bazy
Supabase → **SQL Editor** → uruchom po kolei wszystkie pliki z `supabase/migrations/` (001, 002, … 033).
Każdy plik wklejasz w całości i klikasz **Run**.

### 2. Adres strony w ustawieniach logowania
Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://emage-fleet.maciekhalon.workers.dev`
- **Redirect URLs:** `https://emage-fleet.maciekhalon.workers.dev/**`

Bez tego linki z maili (potwierdzenie konta, reset hasła) prowadziłyby w złe miejsce.

### 3. Twoje konto administratora
1. Wejdź na stronę → **Załóż konto** → imię i nazwisko, e-mail, hasło (min. 10 znaków).
2. Kliknij link w mailu potwierdzającym.
3. Supabase → **SQL Editor** → uruchom (wpisz swój adres):
   ```sql
   update public.profiles
   set status = 'active', role = 'floty', approved_at = now()
   where email = 'TWOJ_ADRES@firma.pl';
   ```
4. Odśwież stronę – zobaczysz pełny panel z zakładką **Użytkownicy**.

### 4. Pracownicy
1. Wyślij pracownikom adres strony.
2. Każdy zakłada konto i potwierdza e-mail – widzi komunikat „Konto czeka na zatwierdzenie”.
3. W zakładce **Użytkownicy** wybierasz rolę (i dla kierowcy jego wpis na liście kierowców
   albo „utwórz wpis kierowcy”) → **Zatwierdź**. Strona u pracownika odblokuje się sama.

### Na telefonie (kierowcy)
Otwórz stronę w przeglądarce i dodaj ją do ekranu głównego:
- **iPhone (Safari):** przycisk Udostępnij → *Do ekranu początkowego*
- **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację* / *Dodaj do ekranu głównego*
Kierowca po zalogowaniu widzi ekran **Moje auto**: odbierz auto, zatankuj, zgłoś usterkę, oddaj auto.
