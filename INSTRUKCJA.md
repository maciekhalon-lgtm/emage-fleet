# Emage FLEET – instrukcja obsługi

System zarządzania flotą Emage Group: auta, kierowcy, dzień pracy, tankowania, serwis, kontrole i raporty.
Adres: **https://emage-fleet.maciekhalon.workers.dev** – działa w przeglądarce na komputerze i jako aplikacja na telefonie (dodaj stronę do ekranu głównego).

## Role

| Rola | Co widzi i robi |
| --- | --- |
| **Kierownik floty** | Wszystko: zatwierdza konta i nadaje role, ustawienia, przydziały, trasy, blokady, wyjaśnienia tankowań. Po powiązaniu z wpisem kierowcy może też prowadzić auta (zakładka **Moje auto**). |
| **Kierownik serwisu** | Pulpit napraw, pojazdy, Serwis (usterki, terminy, książka serwisowa; kontrole do podglądu), koszty, raporty, lista kierowców. |
| **Kierowca** | Tylko swój ekran: wybór auta, tankowanie, zdanie auta, swoje dane i statystyki. |

Nowa osoba zakłada konto na stronie, potwierdza e-mail i czeka na zatwierdzenie.
Kierownik floty: **Pracownicy → Użytkownicy** → rola, dla kierowcy jego wpis na liście kierowców (albo „utwórz wpis kierowcy”) → **Zatwierdź**.

## Menu kierownika

**Szybkie wyszukiwanie:** lupa w menu albo **Ctrl+K** (lub „/”) – wpisz rejestrację, nazwisko, trasę, klienta albo czynność (np. „przydział”, „koszt”) i naciśnij Enter.

Na komputerze menu jest na górze strony (czarny pasek), na telefonie – na dole ekranu („Więcej” otwiera resztę sekcji). Na telefonie grafik pokazuje jeden dzień naraz – dni tygodnia wybierasz u góry, a pojazdy są listą kart.

| Pozycja | Co tam jest |
| --- | --- |
| **Moje auto** | (kierownik floty powiązany z wpisem kierowcy) ten sam ekran co u kierowcy |
| **Pulpit** | trzy liczby (w trasie, wymaga uwagi, koszty miesiąca), „Wymaga uwagi” (blokady, terminy, niesprawne auta, tankowania do wyjaśnienia, konta, spory, budżet, opony, podejrzane spalanie i tankowania z kart, złe liczniki) i „Flota teraz” (auta w trasie oraz dzisiejsze przydziały jeszcze nie przejęte – z telefonem do kierowcy) |
| **Pojazdy** | lista z filtrami (w trasie, wolne, wymaga uwagi – także auta z podejrzanym spalaniem albo tankowaniami z kart) i karta auta w zakładkach: **Dane** (polisa, assistance, grafik, dokumenty), **Terminy i serwis**, **Paliwo i koszty**, **Historia**; dokumenty, książka serwisowa, historia |
| **Grafik** | zakładki **Grafik** (tydzień: kierowcy × dni, załadunek ze zmiany, auta teraz w trasie; **Drukuj** – tydzień na A4 poziomo; przy kierowcy z nieważnymi dokumentami czerwone oznaczenie, a formularz przydziału ostrzega) i **Trasy** (przy każdej trasie przycisk **Przystanki**: klienci w kolejności jazdy – adres, godzina, telefon, uwagi) |
| **Serwis** | zakładki **Usterki** (przy usterce **Wpis serwisowy** – od razu do książki; szkody z oznaczeniem „szkoda”), **Terminy** (domyślnie tylko pilne; **Plan 8 tygodni** – terminy tydzień po tygodniu, a terminy „na km” przeliczone na datę według tego, ile auto jeździ), **Książka serwisowa** |
| **Paliwo** | (kierownik floty) zakładki **Karty paliwowe**, **Spalanie i przebiegi**, **Liczniki**, **Miesiąc do miesiąca** (spalanie pojazdów i kierowców: dwa miesiące i zmiana) i **Przejazdy i parkingi** |
| **Koszty** | zakładki **Koszty** (koszty miesiąca, tankowania do wyjaśnienia) i **Raporty** (koszty, kilometry ze wszystkich liczników, koszt/km, limity, Excel) |
| **Pracownicy** | zakładki **Kierowcy** (kliknięcie kierowcy – karta: dni pracy, tankowania, spalanie na jego odcinkach, złe liczniki, sprawy do wyjaśnienia; 30 albo 90 dni) i **Użytkownicy** (konta, role, spory w obsadzie, zmiany danych kierowców) |
| **Ustawienia** | zakładki **Ustawienia** (budżet floty, kontrola paragonów, checklista przejęcia) i **Historia zmian** |

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

**Karty paliwowe** – Paliwo → **Karty paliwowe** → **Importuj zestawienie**: dostawca, nr faktury, faktura (PDF) i plik CSV/Excel.
Można zaznaczyć kilka plików naraz – każdy to osobne rozliczenie (fakturę dołączysz potem: **Dodaj fakturę**).
Na górze zakładki – **Podejrzane tankowania** ze wszystkich zestawień: więcej litrów niż bak, ponad 1,2 baku w ciągu doby, dwa tankowania
w 3 godziny, cena za litr ponad 15% wyżej niż mediana miesiąca, auto poza grafikiem. Po wyjaśnieniu kliknij **Sprawdzone** (liczba znika z menu).
**Spalanie i przebiegi** – zakres dat (domyślnie całość): przebieg, litry i spalanie każdego busa, średnia floty; sortowanie kliknięciem
w nagłówek kolumny. To samo spalanie widać w Pojazdach, karcie auta, kosztach i raportach.
Przy pierwszym pliku danego układu sprawdź dopasowanie kolumn (data, nr rejestracyjny, litry, kwota brutto, licznik…) – system je zapamięta.
Brane są tylko auta z systemu. Zaznaczone produkty to paliwo; pozostałe (opłaty drogowe, parkingi, myjnia, AdBlue) trafiają do zakładki
**Przejazdy i parkingi** i same dopisują się do kosztów auta (usunięcie zestawienia usuwa też te koszty). Każde tankowanie z karty jest parowane z wpisem
kierowcy (to samo auto, dzień ±1, litry ±5%): **zgodne**, **różnice** (litry, kwota, licznik), **brak wpisu kierowcy**, a także **wpisy bez karty**.
Przy każdym aucie przebieg i spalanie (l/100 km) z liczników karty i z wpisów kierowców, liczone odcinkami między tankowaniami;
błędny licznik (np. brak cyfry) jest pomijany i oznaczony „licznik podejrzany”, wynik poza 5–25 l/100 km – „niepewne”.
Licznik „zmyślony” (poniżej 1000 km albo z samych jednakowych cyfr: 1, 444, 555555) = brak licznika – litry wchodzą do odcinka między
prawdziwymi licznikami; odcinek ze spalaniem poza 3–40 l/100 km jest odrzucany. Zakładka **Liczniki** pokazuje każdy zły licznik (data, auto, kierowca, wpisany i oczekiwany) z przyciskiem „Sprawdzone”.
Kierowca w aplikacji nie wpisze zmyślonego (1, 555555…) ani cofniętego licznika; przy skoku ponad 2000 km musi potwierdzić.
**Alarm spalania:** auto powyżej 13 l/100 km = „podejrzane – możliwa kradzież” (Spalanie, Pulpit, karta auta z odcinkami o najwyższym spalaniu).
Podsumowanie według aut i kierowców; kliknięcie wpisu kierowcy pozwala go poprawić.

**Serwis** – Serwis → **Książka serwisowa** → **Wpis serwisowy**: koszt doda się sam do kosztów, można odnowić termin,
zamknąć usterki, odnotować wymianę oleju (następna za 12 000 km, przypomnienie 2 000 km wcześniej) i opon.


## Ekran kierowcy

Ekran ma jedną dużą kartę „co teraz”:
1. **Dziś jedziesz / Twój bus** – auto przydzielone w grafiku (z trasą i uwagami) → **Przyjmij auto**: licznik, trasa,
   checklista („Wszystkie punkty OK” albo „Mam uwagi”), uwagi; zdjęcia są opcjonalne. „Inne auto” – lista wolnych aut.
2. Auto przejęte: na karcie trasa (kliknij, żeby zmienić) i licznik, a pod spodem trzy przyciski –
   **Zatankuj** (litry, kwota, licznik; „Tankuję za granicą” – EUR/CZK z kursem NBP), **Załadunek** (trasy, których towar zabierasz,
   waga i zdjęcie przy trasie z załadunkiem) i **Usterka** – oraz duży przycisk **Zdaj auto** (tylko licznik i uwagi).
   Jeśli trasa ma przystanki, pod kartą auta jest lista klientów: **Nawiguj** (Mapy Google), telefon i „Cała trasa w Mapach Google”.
   Pod przyciskiem „Zdaj auto” – **Kolizja lub szkoda**: najpierw bezpieczeństwo (112), potem rodzaj, miejsce, dane drugiej strony,
   sprawca, policja, opis i do 8 zdjęć. Zgłoszenie trafia do Serwis → Usterki z oznaczeniem „szkoda”.
3. **Mój grafik** – najbliższe 3 dni pracy (przycisk „Wszystkie” – 2 tygodnie): auto, trasa, uwagi, kto wiezie Twój towar.
4. Ikona osoby w prawym górnym rogu – **Moje dane**: ostatnie tankowania, zgłoszone usterki, dane i telefon (zmiana do akceptacji).
5. Wylosowany do kontroli paragonów musi dodać zdjęcie paragonu. Bez zasięgu tankowanie i zdanie auta zapisują się w telefonie
   i wysyłają same po odzyskaniu sieci.

## Telefon
- **iPhone (Safari):** Udostępnij → *Do ekranu początkowego*.
- **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację*.
Motyw jasny/ciemny: przełącznik słońce/księżyc w górnym pasku (komputer) albo ikona w nagłówku (telefon).
