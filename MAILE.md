# Emage FLEET – wysyłka maili przez skrzynkę firmową (home.pl)

Bez własnej wysyłki Supabase wysyła tylko kilka maili na godzinę i tylko do członków zespołu
projektu – pracownicy nie dostaliby linków aktywacyjnych ani resetu hasła.

## 1. Skrzynka na home.pl
1. Panel home.pl → **Poczta** → **Dodaj skrzynkę**, np. `flota@emage.com.pl`
   (albo `noreply@emage.com.pl`). Ustaw mocne hasło i zapisz je w menedżerze haseł.
2. W panelu home.pl przy tej skrzynce znajdź **Konfiguracja programu pocztowego** / **Ustawienia SMTP**
   i odczytaj:
   - **serwer poczty wychodzącej (SMTP)** – w home.pl to zwykle nazwa Twojego serwera w postaci `serwerXXXXXXX.home.pl`,
   - **port** – zwykle **465** (SSL),
   - **login** – pełny adres skrzynki.

## 2. Supabase → Authentication → Emails → SMTP Settings
Włącz **Enable custom SMTP** i wpisz:

| Pole | Wartość |
| --- | --- |
| Sender email | `flota@emage.com.pl` (adres skrzynki) |
| Sender name | `Emage FLEET` |
| Host | serwer SMTP z panelu home.pl |
| Port number | `465` |
| Username | `flota@emage.com.pl` |
| Password | hasło skrzynki |
| Minimum interval between emails | `1` |

**Save**. Hasło wpisujesz sam – nie wysyłaj go w czacie.

## 3. Supabase → Authentication → Rate Limits
Po włączeniu własnego SMTP podnieś **Rate limit for sending emails** np. do **100 na godzinę** → Save.

## 4. Polskie treści maili
Supabase → **Authentication → Emails → Templates**. Dla każdego szablonu wklej temat i treść:

### Confirm signup
**Subject:** `Potwierdź konto w Emage FLEET`
```html
<h2>Witamy w Emage FLEET</h2>
<p>Dzień dobry,</p>
<p>ktoś (mamy nadzieję, że Ty) założył konto w systemie floty Emage Group na ten adres e-mail.</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;background:#f0b429;color:#1b1404;text-decoration:none;border-radius:6px;font-weight:bold">Potwierdź adres e-mail</a></p>
<p>Po potwierdzeniu kierownik floty zatwierdzi Twoje konto i nada Ci rolę.</p>
<p>Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.</p>
<p>— Emage FLEET, Emage Group</p>
```

### Reset Password
**Subject:** `Ustaw nowe hasło – Emage FLEET`
```html
<h2>Reset hasła</h2>
<p>Dzień dobry,</p>
<p>otrzymaliśmy prośbę o ustawienie nowego hasła do Twojego konta w Emage FLEET.</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;background:#f0b429;color:#1b1404;text-decoration:none;border-radius:6px;font-weight:bold">Ustaw nowe hasło</a></p>
<p>Link jest ważny przez godzinę. Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość – Twoje hasło się nie zmieni.</p>
<p>— Emage FLEET, Emage Group</p>
```

### Magic Link
**Subject:** `Link do logowania – Emage FLEET`
```html
<h2>Logowanie do Emage FLEET</h2>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;background:#f0b429;color:#1b1404;text-decoration:none;border-radius:6px;font-weight:bold">Zaloguj się</a></p>
<p>Jeśli to nie Ty prosiłeś o link, zignoruj tę wiadomość.</p>
<p>— Emage FLEET, Emage Group</p>
```

### Change Email Address
**Subject:** `Potwierdź nowy adres e-mail – Emage FLEET`
```html
<h2>Zmiana adresu e-mail</h2>
<p>Potwierdź zmianę adresu z {{ .Email }} na {{ .NewEmail }}:</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;background:#f0b429;color:#1b1404;text-decoration:none;border-radius:6px;font-weight:bold">Potwierdź nowy adres</a></p>
<p>— Emage FLEET, Emage Group</p>
```

## 5. Test
Na stronie Emage FLEET → **Nie pamiętasz hasła?** → wpisz swój adres → mail z `flota@emage.com.pl`
powinien przyjść w ciągu minuty (sprawdź też SPAM). Jeśli nie przyszedł:
Supabase → **Logs → Auth** pokaże błąd SMTP (np. zły serwer, port albo hasło).
