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
| **Pulpit** | liczby floty, „Wymaga uwagi” (blokady, terminy, niesprawne auta, tankowania do wyjaśnienia, konta, spory, budżet, opony) i flota teraz |
| **Pojazdy** | lista i karta auta: dane, polisa (assistance – Zadzwoń), odpowiedzialni kierowcy, terminy, usterki, grafik, dokumenty, książka serwisowa, historia |
| **Grafik** | zakładki **Grafik** (tydzień: kierowcy × dni, załadunek ze zmiany, auta teraz w trasie) i **Trasy** |
| **Serwis** | zakładki **Usterki**, **Terminy**, **Książka serwisowa** |
| **Koszty i paliwo** | zakładki **Koszty** (koszty miesiąca, tankowania do wyjaśnienia), **Karty paliwowe** i **Przejazdy i parkingi** (kierownik floty) |
| **Raporty** | zakładki **Raporty** (auta, trasy, ranking kierowców, Excel) i **Historia** (zmiany w danych i zmiany obsady) |
| **Pracownicy** | zakładki **Kierowcy** i **Użytkownicy** (konta, role, spory w obsadzie, zmiany danych kierowców) |
| **Ustawienia** | budżet floty, kontrola paragonów, checklista przejęcia, opis ról |

## Najczęstsze czynności

**Nowe auto / wymiana floty** – Pojazdy → **+ Dodaj pojazd** (albo **Import z Excela**). Uzupełnij: kierowców odpowiedzialnych,
opony, pojemność baku (domyślnie 90 l), tachograf, progi spalania („Zastosuj do wszystkich aut tego modelu”),
a w karcie auta terminy **Przegląd techniczny** i **Ubezpieczenie OC**. Stare auto → status **Wycofany** (historia zostaje).

**Blokada auta** – auto z przeglądem technicznym albo OC po terminie nie da się przejąć. Na Pulpicie / w karcie auta:
**Zezwól dziś** (z powodem, tylko na ten dzień) albo **Przegląd zrobiony / OC odnowione** (nowy termin).

**Grafik** – Grafik → kliknij pole kierowcy w danym dniu (albo **+ Przydział**) → kierowca, dzień, auto, trasa,
opcjonalnie drugi kierowca i uwagi. Kierowca widzi swój grafik na 7 dni. **Kopiuj poprzedni tydzień** przenosi przydziały,
pomijając zajęte auta i kierowców.

**Załadunek** – kierowca zaznacza trasy, których towar zabiera; od razu widzi, kto na tej zmianie jedzie tą trasą (z telefonem).
Dzień liczy się według grafiku: ładując w poniedziałek (także po północy) przekazujesz towar kierowcom z poniedziałkowej zmiany
(z poniedziałku na wtorek). Aplikacja bierze go z Twojego przejętego auta; w oknie można przełączyć zmianę.
Kierowca jadący trasą widzi w swoim grafiku, kto ma jego towar.
Kierowca jadący dziś trasą załadunkową wpisuje przy tym wagę towaru (kg, obowiązkowo) i jedno zdjęcie – widzi to tylko kierownik floty. Kierownik widzi to pod grafikiem i ikoną paczki w grafiku.

**Przekazanie auta w trakcie dnia** – w Grafik → **Teraz w trasie** albo w karcie auta **Przekaż** → nowy kierowca, licznik, powód.
Nowy kierowca przyjmuje auto u siebie z checklistą.

**Tankowania do wyjaśnienia** – baza sama oznacza podejrzane tankowania (więcej niż bak, nie to auto, dwa w ciągu 3 h,
cena ±15% od średniej, słabe spalanie). Pulpit / Koszty → **OK** albo **Wyjaśnij** (pytanie do kierowcy).

**Karty paliwowe** – Koszty i paliwo → **Karty paliwowe** → **Importuj zestawienie**: dostawca, nr faktury, faktura (PDF) i plik CSV/Excel.
Przy pierwszym pliku danego układu sprawdź dopasowanie kolumn (data, nr rejestracyjny, litry, kwota brutto, licznik…) – system je zapamięta.
Brane są tylko auta z systemu. Zaznaczone produkty to paliwo; pozostałe (opłaty drogowe, parkingi, myjnia, AdBlue) trafiają do zakładki
**Przejazdy i parkingi** i same dopisują się do kosztów auta (usunięcie zestawienia usuwa też te koszty). Każde tankowanie z karty jest parowane z wpisem
kierowcy (to samo auto, dzień ±1, litry ±5%): **zgodne**, **różnice** (litry, kwota, licznik), **brak wpisu kierowcy**, a także **wpisy bez karty**.
Przy każdym aucie przebieg i spalanie (l/100 km) z liczników karty i z wpisów kierowców, kolor wg progów auta.
Podsumowanie według aut i kierowców; kliknięcie wpisu kierowcy pozwala go poprawić.

**Serwis** – Serwis → **Książka serwisowa** → **Wpis serwisowy**: koszt doda się sam do kosztów, można odnowić termin,
zamknąć usterki, odnotować wymianę oleju (następna za 12 000 km, przypomnienie 2 000 km wcześniej) i opon.


## Ekran kierowcy

1. **Wybierz auto** – na górze „Twój bus” (jeśli jest odpowiedzialny) albo auto przydzielone przez kierownika;
   checklista („Wszystkie punkty OK” albo „Mam uwagi”), przebieg, trasa z listy.
2. W trasie: **Zatankuj** (litry, kwota, licznik; „Tankuję za granicą” – EUR/CZK z kursem NBP) i **Zdaj pojazd** (tylko licznik i uwagi).
   **Załadunek** – zaznacz trasy, których towar zabierasz (na Twoją zmianę z grafiku). Pod **Więcej**: zgłoś usterkę, zmień trasę.
   **Mój grafik** – najbliższe 7 dni: auto, trasa, uwagi, kto wiezie Twój towar.
3. Wylosowany do kontroli paragonów musi dodać zdjęcie paragonu.
4. Bez zasięgu tankowanie i zdanie auta zapisują się w telefonie i wysyłają same po odzyskaniu sieci.
5. **Moje dane i statystyki** – kilometry, spalanie, dni pracy, tankowania, zgłoszenia, telefon (zmiana do akceptacji).

## Telefon
- **iPhone (Safari):** Udostępnij → *Do ekranu początkowego*.
- **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację*.
Motyw jasny/ciemny: przełącznik w menu (komputer) albo ikona w nagłówku (telefon).
