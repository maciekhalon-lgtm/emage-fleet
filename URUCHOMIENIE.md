# Emage FLEET – uruchomienie aplikacji (krok 3)

Kod aplikacji jest w folderze `public/`. Cloudflare Pages publikuje go automatycznie
po każdej zmianie w GitHubie (ok. 1 minuty).

## 1. Drugi skrypt bazy
Supabase → **SQL Editor** → *New query* → wklej całość `supabase/migrations/002_aplikacja.sql` → **Run**.
Włącza odświeżanie na żywo i funkcje potrzebne aplikacji (nazwiska, spalanie dla kierowcy).

## 2. Adres strony w ustawieniach logowania
Supabase → **Authentication → URL Configuration**:
- **Site URL:** adres strony z Cloudflare, np. `https://emage-fleet.pages.dev`
- **Redirect URLs:** dodaj ten sam adres zakończony `/**`, np. `https://emage-fleet.pages.dev/**`

Bez tego linki z maili (potwierdzenie konta, reset hasła) prowadziłyby w złe miejsce.

## 3. Twoje konto administratora
1. Wejdź na stronę → **Załóż konto** → imię i nazwisko, e-mail, hasło (min. 10 znaków).
2. Kliknij link w mailu potwierdzającym.
3. Supabase → **SQL Editor** → uruchom (wpisz swój adres):
   ```sql
   update public.profiles
   set status = 'active', role = 'floty', approved_at = now()
   where email = 'TWOJ_ADRES@firma.pl';
   ```
4. Odśwież stronę – zobaczysz pełny panel z zakładką **Użytkownicy**.

## 4. Pracownicy
1. Wyślij pracownikom adres strony.
2. Każdy zakłada konto i potwierdza e-mail – widzi komunikat „Konto czeka na zatwierdzenie”.
3. W zakładce **Użytkownicy** wybierasz rolę (i dla kierowcy jego wpis na liście kierowców
   albo „utwórz wpis kierowcy”) → **Zatwierdź**. Strona u pracownika odblokuje się sama.

## Na telefonie (kierowcy)
Otwórz stronę w przeglądarce i dodaj ją do ekranu głównego:
- **iPhone (Safari):** przycisk Udostępnij → *Do ekranu początkowego*
- **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację* / *Dodaj do ekranu głównego*
Kierowca po zalogowaniu widzi ekran **Moje auto**: odbierz auto, zatankuj, zgłoś usterkę, oddaj auto.
