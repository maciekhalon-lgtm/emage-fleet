# Emage FLEET – instrukcja obsługi

System zarządzania flotą Emage Group: auta, kierowcy, dzień pracy, tankowania, serwis, kontrole i raporty.
Działa w przeglądarce na komputerze i jako aplikacja na telefonie (dodaj stronę do ekranu głównego).

## Role

| Rola | Co widzi i robi |
| --- | --- |
| **Kierownik floty** | Wszystko: zatwierdza konta i nadaje role, ustawienia, przydziały, trasy, blokady, wyjaśnienia tankowań. Po powiązaniu z wpisem kierowcy może też prowadzić auta (zakładka **Moje auto**). |
| **Kierownik serwisu** | Pulpit napraw, pojazdy, Serwis (usterki, terminy, książka serwisowa; kontrole do podglądu), koszty, raporty, lista kierowców. |
| **Kierowca** | Tylko swój ekran: wybór auta, tankowanie, zdanie auta, swoje dane i statystyki. |

Nowa osoba zakłada konto na stronie, potwierdza e-mail i czeka na zatwierdzenie.
Kierownik floty: **Pracownicy → Użytkownicy** → rola, dla kierowcy jego wpis na liście kierowców (albo „utwórz wpis kierowcy”) → **Zatwierdź**.

## Menu kierownika

| Pozycja | Co tam jest |
| --- | --- |
| **Moje auto** | (kierownik floty powiązany z wpisem kierowcy) ten sam ekran co u kierowcy |
| **Pulpit** | liczby floty, „Wymaga uwagi” (blokady, terminy, niesprawne auta, tankowania do wyjaśnienia, sprzątanie do potwierdzenia, konta, spory, budżet, opony), flota teraz, koszty, ranking |
| **Pojazdy** | lista i karta auta: dane, odpowiedzialni kierowcy, terminy, usterki, rezerwacje, dokumenty, książka serwisowa, historia |
| **Rezerwacje** | zakładki **Rezerwacje** (kalendarz aut, grafik tygodniowy kierowców, lista; zmiany obsady) i **Trasy** |
| **Serwis** | zakładki **Usterki**, **Terminy**, **Kontrole** (inspekcje i sprzątanie), **Książka serwisowa** |
| **Koszty i paliwo** | koszty miesiąca, tankowania do wyjaśnienia |
| **Raporty** | zakładki **Raporty** (auta, trasy, ranking kierowców, Excel) i **Historia** zmian |
| **Pracownicy** | zakładki **Kierowcy** i **Użytkownicy** (konta, role, spory w obsadzie, zmiany danych kierowców) |
| **Ustawienia** | budżet floty, częstotliwość inspekcji i sprzątania, kontrola paragonów, punkty inspekcji, checklista przejęcia, powiadomienia, opis ról |

## Najczęstsze czynności

**Nowe auto / wymiana floty** – Pojazdy → **+ Dodaj pojazd** (albo **Import z Excela**). Uzupełnij: kierowców odpowiedzialnych,
opony, pojemność baku (domyślnie 90 l), tachograf, progi spalania („Zastosuj do wszystkich aut tego modelu”),
a w karcie auta terminy **Przegląd techniczny** i **Ubezpieczenie OC**. Stare auto → status **Wycofany** (historia zostaje).

**Blokada auta** – auto z przeglądem technicznym albo OC po terminie nie da się przejąć. Na Pulpicie / w karcie auta:
**Zezwól dziś** (z powodem, tylko na ten dzień) albo **Przegląd zrobiony / OC odnowione** (nowy termin).

**Przydział na dzień** – Rezerwacje → **Grafik** → kliknij pole kierowcy w danym dniu → auto i trasa.
**Kopiuj poprzedni tydzień** przenosi przydziały, pomijając zajęte auta i kierowców.

**Przekazanie auta w trakcie dnia** – przy aucie w trasie **Przekaż** → nowy kierowca, licznik, powód.
Nowy kierowca przyjmuje auto u siebie z checklistą.

**Tankowania do wyjaśnienia** – baza sama oznacza podejrzane tankowania (więcej niż bak, nie to auto, dwa w ciągu 3 h,
cena ±15% od średniej, słabe spalanie). Pulpit / Koszty → **OK** albo **Wyjaśnij** (pytanie do kierowcy).

**Serwis** – Serwis → **Książka serwisowa** → **Wpis serwisowy**: koszt doda się sam do kosztów, można odnowić termin,
zamknąć usterki, odnotować wymianę oleju (następna za 12 000 km, przypomnienie 2 000 km wcześniej) i opon.

**Kontrole** – inspekcja auta co 14 dni (kierownik floty, punkty z uwagą tworzą usterki);
sprzątanie co 14 dni – kierowca zaznacza, kierownik floty potwierdza. Częstotliwość w Ustawieniach.

## Ekran kierowcy

1. **Wybierz auto** – na górze „Twój bus” (jeśli jest odpowiedzialny) albo auto przydzielone przez kierownika;
   checklista („Wszystkie punkty OK” albo „Mam uwagi”), przebieg, trasa z listy.
2. W trasie: **Zatankuj** (litry, kwota, licznik; waluta PLN/EUR/CZK z kursem NBP) i **Zdaj pojazd**.
   Pod **Więcej**: zgłoś usterkę, posprzątane, zmień trasę. **Inny wydatek** – myjnia, parking, opłaty.
3. Wylosowany do kontroli paragonów musi dodać zdjęcie paragonu.
4. Bez zasięgu tankowanie i zdanie auta zapisują się w telefonie i wysyłają same po odzyskaniu sieci.
5. **Moje dane i statystyki** – kilometry, spalanie, dni pracy, tankowania, zgłoszenia, telefon (zmiana do akceptacji).

## Telefon
- **iPhone (Safari):** Udostępnij → *Do ekranu początkowego*.
- **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację*.
Motyw jasny/ciemny: przełącznik w menu (komputer) albo ikona w nagłówku (telefon).
