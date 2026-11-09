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
| **Pulpit** | przycisk **Komunikat** – wiadomość do wszystkich kierowców (widzą ją na górze swojego ekranu do wybranej daty, aż klikną „Przeczytane”); trzy liczby (w trasie, wymaga uwagi, koszty miesiąca), „Wymaga uwagi” (blokady, terminy, niesprawne auta, tankowania do wyjaśnienia, konta, spory, budżet, opony, podejrzane spalanie i tankowania z kart, złe liczniki) i „Flota teraz” (auta w trasie oraz dzisiejsze przydziały jeszcze nie przejęte – z telefonem do kierowcy) |
| **Pojazdy** | lista z filtrami (w trasie, wolne, wymaga uwagi – także auta z podejrzanym spalaniem albo tankowaniami z kart) i karta auta w zakładkach: **Dane** (polisa, assistance, grafik, dokumenty), **Terminy i serwis**, **Paliwo i koszty**, **Historia**; dokumenty, książka serwisowa, historia |
| **Grafik** | zakładki **Grafik** (tydzień: kierowcy × dni, załadunek ze zmiany, auta teraz w trasie; **Drukuj** – tydzień na A4 poziomo; przy kierowcy z nieważnymi dokumentami czerwone oznaczenie, a formularz przydziału ostrzega) i **Trasy** (przy każdej trasie przycisk **Przystanki**: klienci w kolejności jazdy – adres, godzina, telefon, uwagi) |
| **Serwis** | zakładki **Usterki** (przy usterce **Wpis serwisowy** – od razu do książki; szkody z oznaczeniem „szkoda”, filtr **Szkody**), **Terminy** (domyślnie tylko pilne; **Plan 8 tygodni** – terminy tydzień po tygodniu, a terminy „na km” przeliczone na datę według tego, ile auto jeździ), **Książka serwisowa** |
| **Paliwo** | (kierownik floty) zakładki **Karty** (import z kart paliwowych), **Spalanie i liczniki** (u góry przełącznik: spalanie i przebiegi / liczniki do sprawdzenia) i **Opłaty drogowe** (przejazdy, parkingi z kart). **Porównanie miesięcy** (spalanie pojazdów i kierowców) jest w Koszty → Raporty, przełącznik u góry |
| **Koszty** | zakładki **Koszty** (koszty miesiąca, tankowania do wyjaśnienia) i **Raporty** (koszty, kilometry ze wszystkich liczników, koszt/km, limity, Excel, **Wykorzystanie aut – 30 dni**: dni robocze w grafiku i km, auta, które prawie stoją) |
| **Pracownicy** | zakładki **Kierowcy** (kliknięcie kierowcy – karta: dni pracy, tankowania, spalanie na jego odcinkach, złe liczniki, sprawy do wyjaśnienia; 30 albo 90 dni) i **Użytkownicy** (konta, role, spory w obsadzie, zmiany danych kierowców) |
| **Ustawienia** | zakładki **Ustawienia** (**Kompletność danych** – czego brakuje dla alarmów i druków, budżet floty, kontrola paragonów, checklista przejęcia) i **Historia zmian** |

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

**Karty paliwowe** – Paliwo → **Karty** → **Importuj zestawienie**: dostawca, nr faktury, faktura (PDF) i plik CSV/Excel.
Można zaznaczyć kilka plików naraz – każdy to osobne rozliczenie (fakturę dołączysz potem: **Dodaj fakturę**).
Na górze zakładki – **Podejrzane tankowania** ze wszystkich zestawień: więcej litrów niż bak, ponad 1,2 baku w ciągu doby, dwa tankowania
w 3 godziny, cena za litr ponad 15% wyżej niż mediana miesiąca, auto poza grafikiem. Po wyjaśnieniu kliknij **Sprawdzone** (liczba znika z menu).
**Spalanie i przebiegi** – zakres dat (domyślnie całość): przebieg, litry i spalanie każdego busa, średnia floty; sortowanie kliknięciem
w nagłówek kolumny. To samo spalanie widać w Pojazdach, karcie auta, kosztach i raportach.
Przy pierwszym pliku danego układu sprawdź dopasowanie kolumn (data, nr rejestracyjny, litry, kwota brutto, licznik…) – system je zapamięta.
Brane są tylko auta z systemu. Zaznaczone produkty to paliwo; pozostałe (opłaty drogowe, parkingi, myjnia, AdBlue) trafiają do zakładki
**Opłaty drogowe** i same dopisują się do kosztów auta (usunięcie zestawienia usuwa też te koszty). Każde tankowanie z karty jest parowane z wpisem
kierowcy (to samo auto, dzień ±1, litry ±5%): **zgodne**, **różnice** (litry, kwota, licznik), **brak wpisu kierowcy**, a także **wpisy bez karty**.
Przy każdym aucie przebieg i spalanie (l/100 km) z liczników karty i z wpisów kierowców, liczone odcinkami między tankowaniami;
błędny licznik (np. brak cyfry) jest pomijany i oznaczony „licznik podejrzany”, wynik poza 5–25 l/100 km – „niepewne”.
Licznik „zmyślony” (poniżej 1000 km albo z samych jednakowych cyfr: 1, 444, 555555) = brak licznika – litry wchodzą do odcinka między
prawdziwymi licznikami; odcinek ze spalaniem poza 3–40 l/100 km jest odrzucany. Paliwo → Spalanie i liczniki → **Liczniki do sprawdzenia** pokazuje każdy zły licznik (data, auto, kierowca, wpisany i oczekiwany) z przyciskiem „Sprawdzone”.
Kierowca w aplikacji nie wpisze zmyślonego (1, 555555…) ani cofniętego licznika; przy skoku ponad 2000 km musi potwierdzić.
**Alarm spalania:** auto powyżej 13 l/100 km = „podejrzane – możliwa kradzież” (Spalanie, Pulpit, karta auta z odcinkami o najwyższym spalaniu).
Podsumowanie według aut i kierowców; kliknięcie wpisu kierowcy pozwala go poprawić.

**Serwis** – Serwis → **Książka serwisowa** → **Wpis serwisowy**: koszt doda się sam do kosztów, można odnowić termin,
zamknąć usterki, odnotować wymianę oleju (następna za 12 000 km, przypomnienie 2 000 km wcześniej) i opon.


## Rozliczenie aut (Koszty → Rozliczenie aut)

- Wybierasz miesiąc. Dla każdego busa: **przejechane km** (z liczników przy tankowaniu, przejęciu i zwrocie), koszty auta
  (paliwo, serwis i opony, ubezpieczenie i leasing, pozostałe), **udział w kosztach ogólnych floty**, razem i **koszt 1 km**.
- **Koszt ogólny floty** (przycisk u góry) – wydatki wspólne: GPS, plac, abonamenty, księgowość floty, szkolenia…
  Dzielą się po równo na wszystkie aktywne auta (wycofane się nie liczą). „Skopiuj z poprzedniego miesiąca” przenosi stałe pozycje.
- Paliwo = wpisy w aplikacji + tankowania z kart paliwowych, które nie są połączone z wpisem (tylko PLN) – bez liczenia dwa razy.
- **Excel** – całe rozliczenie i lista kosztów ogólnych. Na karcie auta (zakładka Paliwo) – „Km i koszty miesięcznie” za 6 miesięcy.
- Wymaga migracji `024_koszty_ogolne.sql` (bez niej rozliczenie działa, tylko bez kosztów ogólnych).

## Porządki w wyglądzie (08.11)

- Pulpit: jedno auto = jeden wiersz w „Wymaga uwagi” (powód + kto ma nim jechać + **Zmień auto**); na telefonie trzy kafelki w jednym rzędzie.
- Karta auta: dane w jednym panelu; formularz pojazdu podzielony na sekcje (Auto, Kierowcy, Ubezpieczenie, Wyposażenie, Normy spalania).
- Koszty i Raporty: bez wierszy z samymi zerami – pełne rozliczenie każdego auta w **Koszty → Rozliczenie aut**.
- Grafik: krótka legenda kolorów pod tabelą. Usterki na telefonie pokazują auto.
- Ustawienia → Kompletność danych jest zwinięta (rozwija się z Pulpitu przyciskiem „Uzupełnij”).

## Kierowcy odpowiedzialni za busa

- **Ludzie → Kierowcy → „Kto odpowiada za który bus”** – cała flota na jednej liście; **Przypisz / Zmień** przy busie.
- Przy kierowcy (lista i karta kierowcy) – **Przypisz / Busy: …** – zaznaczasz jego busy.
- Na karcie auta przy „Odpowiedzialni” – **Przypisz / Zmień**. Szybko: Ctrl+K → „odpowiedzialni”.
- Odpowiedzialny widzi bus w „Moje auto”, jest podpowiadany przy przydziale i przy tankowaniach z karty bez grafiku.

## Ostrzeżenia w grafiku i na Pulpicie

- Przydział z czerwoną ramką i ⚠ – w tym dniu przegląd / OC auta albo dokumenty kierowcy są nieważne (szczegóły pod kursorem).
  Jeśli to dziś lub jutro, sprawa jest na górze „Wymaga uwagi” z przyciskiem **Zmień przydział**.
- Formularz przydziału ostrzega, gdy przegląd / OC wygasa w trakcie przydziału albo drugi kierowca ma nieważne dokumenty.
- Auto niesprawne lub w serwisie, a w grafiku na najbliższe 3 dni – na Pulpicie kierownika z przyciskiem **Zmień auto**.
  Serwis w karcie „Auta w serwisie i niesprawne” widzi, od ilu dni auto stoi i kiedy jest potrzebne.
- Gdy dane floty są uzupełnione poniżej 70%, Pulpit przypomina o **Kompletności danych** (bak i opony – „Ustaw wszystkim”).
- Skróty klawiszowe (komputer): **?** – lista, **g** + litera – zakładka (np. g g – Grafik), **Ctrl+K** lub **/** – szukaj.

## Ekran kierowcy

Na dole stałe menu: **Start · Grafik · Historia · Ja** (czerwona liczba przy „Start” – sprawy do potwierdzenia lub wyjaśnienia).

1. **Start** – na górze sprawy do zrobienia (komunikaty, potwierdzenia, prośby o wyjaśnienie tankowania, kończące się dokumenty),
   pod nimi czarna karta auta z **etapami dnia: Przejęcie → W trasie → Zdanie**, żeby było widać, co jest następne.
   - **Dziś jedziesz / Twój bus** → **Przyjmij auto** (licznik, trasa, checklista, uwagi). „Inne auto” – lista wolnych aut z powodem, dlaczego reszta jest niedostępna.
   - Auto przejęte: trasa (kliknij, żeby zmienić), licznik i przejechane km, z kim jedziesz, ostrzeżenie o terminie auta (14 dni / 1500 km), **Zdaj auto**.
   - Pod kartą duże przyciski: **Zatankuj**, **Usterka**, **Szkoda** (kolizja – zdjęcia, GPS, druga strona), **Załadunek**, **Dokumenty** auta i **Assistance** (jeśli są).
   - **Przystanki** trasy (Nawiguj, telefon, cała trasa w Mapach Google).
   - Karta **Auto**: usterki już zgłoszone dla tego auta (żeby nie zgłaszać drugi raz) i najbliższe terminy.
   - **Najbliższe dni** z grafiku i liczby z bieżącego miesiąca (dni w trasie, przejechane km, tankowania).
2. **Grafik** – 14 dni: pasek dni (czarne = jedziesz), lista dzień po dniu z trasą, autem, drugim kierowcą, przystankami, uwagami i tym, kto wiezie Twój towar; wolne dni zebrane w jeden wiersz.
3. **Historia** – wybór miesiąca: dni w trasie, km, litry i kwota tankowań, lista przejazdów (auto, trasa, km), tankowania (kliknij, żeby poprawić) i Twoje zgłoszenia usterek ze stanem naprawy.
4. **Ja** – dane i kategorie prawa jazdy, ważność prawa jazdy i badań (kolor: ważne / kończy się / nieważne), auta, za które odpowiadasz, telefon (zmiana do akceptacji kierownika), powiadomienia, jasny / ciemny wygląd, wylogowanie.
5. Wylosowany do kontroli paragonów musi dodać zdjęcie paragonu. Bez zasięgu tankowanie i zdanie auta zapisują się w telefonie
   i wysyłają same po odzyskaniu sieci.

## Telefon
- **iPhone (Safari):** Udostępnij → *Do ekranu początkowego*.
- **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację*.
Motyw jasny/ciemny: przełącznik słońce/księżyc w górnym pasku (komputer) albo ikona w nagłówku (telefon).

## Moduły, kalendarz i raport tygodniowy
- **Ustawienia → Moduły** – załadunek, przystanki tras i podwójną obsadę można wyłączyć. Wyłączony moduł znika z ekranów, dane zostają i wracają po włączeniu.
- **Terminy w kalendarzu telefonu** – Ustawienia (albo Serwis → Terminy → „W kalendarzu”) → link do subskrypcji w Google lub iPhone. Przeglądy, OC, serwisy i dokumenty kierowców, przypomnienie tydzień wcześniej. „Utwórz nowy link” unieważnia stary.
- **Raport tygodniowy** – w poniedziałek rano kierownik floty dostaje powiadomienie: koszty tygodnia (z porównaniem), tankowania, nowe usterki i terminy na 14 dni. Wymaga włączonych powiadomień na telefonie.
- **Terminy floty w jednej tabeli** – Serwis → Terminy → „Terminy floty (N)” albo na Pulpicie „Uzupełnij wszystkie”: przegląd, OC i olej dla wszystkich aut, które ich nie mają, w jednym oknie. Puste pola są pomijane, OC podpowiada się z danych polisy.
- **Edytuj tabelą** – Pojazdy → „Edytuj tabelą”: wszystkie auta w jednej tabeli z wpisanymi wartościami (zbiornik, rocznik, VIN, ubezpieczyciel, OC). Zapisują się tylko zmienione pola; Enter przechodzi do auta niżej.
- **Uzupełnij dane floty** – Pojazdy → „Uzupełnij dane (N)”: jedna tabela aut z brakami – rocznik, VIN, bak, ubezpieczyciel, OC, a przy włączonych modułach umowa leasingu (rodzaj, rata, koniec), ważność gaśnicy i opony na aucie. Puste pola są pomijane, VIN sprawdzany (17 znaków).
- **Stan floty i wymiana aut** – Koszty → Raporty: wiek, przebieg, km na miesiąc, naprawy i koszt/km z 12 miesięcy, kiedy auto dojdzie do 300 tys. km i ocena „w porządku / obserwuj / do rozważenia wymiany”.

## Opony (Serwis → Opony) – po uruchomieniu 027_opony.sql
- Komplety opon każdego auta: sezon, rozmiar, marka, rok produkcji (DOT), bieżnik, gdzie leżą (na aucie / w magazynie / zużyte).
- **Załóż zimowe / letnie** – jedno kliknięcie: zdjęty komplet idzie do magazynu (miejsce i bieżnik), założony na auto, opcjonalnie koszt wymiany do kosztów auta.
- Ostrzeżenia: bieżnik poniżej 1,6 mm (prawo), zimą poniżej 4 mm (zalecane w Niemczech i Austrii), opony 6+ lat. Karta auta pokazuje opony z bieżnikiem.

## Wyposażenie aut (Serwis → Wyposażenie) – po uruchomieniu 028_wyposazenie.sql
- Tabela: każde auto × gaśnica, apteczka, trójkąt, kamizelki, koło zapasowe / zestaw, podnośnik, pasy do ładunku.
- Kliknięcie pola: jest / brak, data ważności (gaśnica, apteczka), notatka. „Sprawdzone dziś” – całe auto jednym kliknięciem.
- Ostrzeżenia: gaśnica po terminie lub ≤ 30 dni, braki, auta nigdy nie sprawdzane lub sprawdzane ponad 90 dni temu. Karta auta pokazuje braki.

## Leasing i umowy (Koszty → Leasing i umowy) – po uruchomieniu 029_umowy.sql
- Umowa auta: leasing / najem / kredyt, finansujący, numer, okres, rata netto i brutto, limit km z przebiegiem na starcie, opłata za nadprzebieg, wykup, co jest w racie.
- Prognoza kilometrów na koniec umowy (tempo z liczników z 90 dni) i koszt nadprzebiegu; ostrzeżenia: koniec umowy ≤ 90 / 30 dni, limit km zagrożony lub przekroczony.
- Rata wchodzi do **Rozliczenia aut** („Ubezp. i leasing”), gdy w miesiącu nie ma ręcznie wpisanego kosztu „Leasing”. Karta auta pokazuje umowę.

## Ocena kierowców (Pracownicy → Kierowcy → Ocena kierowców)
- Wynik 0–100 za ostatnie 30 albo 90 dni, z wyjaśnieniem: spalanie na odcinkach kierowcy vs średnia floty, niewyjaśnione podejrzane tankowania z kart, tankowania do wyjaśnienia, błędne liczniki, szkody w dniach jego jazdy, spóźnione zdania auta.
- Ocena: bardzo dobry (85+), dobry (70+), do poprawy (50+), słaby. Kliknięcie – karta kierowcy. Eksport do Excela. Bez nowej tabeli w bazie.

## Plan serwisu i warsztaty (Serwis → Plan serwisu) – po uruchomieniu 030_warsztaty.sql
- Wizyty aut w warsztatach na 2 / 4 / 8 tygodni, pogrupowane tygodniami; lista warsztatów z telefonem (klik = dzwoń).
- **Do umówienia**: przeglądy, olej, rozrząd itp. ≤ 30 dni lub po terminie i otwarte usterki bez umówionej wizyty – przycisk „Umów”.
- Ostrzeżenie, gdy auto jest w dniu wizyty w grafiku (z przyciskiem „Zmień auto w grafiku”).
- „Auto w warsztacie” ustawia auto na serwis; „Zakończona” przywraca je do jazdy i otwiera wpis do książki serwisowej z warsztatem i opisem.

## Raport dla zarządu i prognoza kosztów (Koszty → Raporty)
- **Raport dla zarządu** – przycisk w Raportach: jedna strona A4 (druk albo „Zapisz jako PDF”) za wybrany miesiąc lub rok, z porównaniem do poprzedniego okresu: koszty, paliwo, kilometry, koszt/km i na auto, kategorie, najdroższe auta, terminy na 30 dni, usterki, umowy, wyposażenie, opony, budżet i uwagi o brakach w danych.
- **Prognoza kosztów – 12 miesięcy** – raty z umów, terminy (olej także wg tempa km) z kosztem z historii lub stawki orientacyjnej, paliwo, naprawy i bieżące koszty jako średnia z 3 pełnych miesięcy; miesiące ponad budżet na czerwono.

## Podejrzane tankowania i „Dlaczego tak dużo?” (Paliwo)

- **Podejrzane tankowania** (Paliwo → Karty) mają dwa poziomy:
  - **Pewne**: fizycznie niemożliwe dla jednego auta. Jest to tankowanie o ponad 12% większe niż bak (95–100 l do baku 90 l bywa normalne – to „na granicy”, do sprawdzenia) albo więcej litrów, niż mogło się zmieścić po poprzednim tankowaniu (wolne miejsce w baku + to, co auto mogło spalić od tamtej chwili: 15 l/100 km według licznika albo 13 l na godzinę – liczy się większa wartość, więc pomyłka w liczniku nie wywoła alarmu). Tylko te liczą się na Pulpicie („niemożliwe tankowania z kart”), w Pojazdach, na karcie auta i w ocenie kierowców.
  - **Do sprawdzenia** (przełącznik „Wszystkie”): dwa tankowania w 3 godziny, cena za litr ponad 15% powyżej mediany, auto poza grafikiem (tylko gdy grafik jest dla tego auta prowadzony w tym tygodniu).
- **Dlaczego tak dużo?** – w Paliwo → Spalanie i liczniki przy aucie, które pali wyraźnie więcej niż średnia floty, jest dopisek; po kliknięciu auta widać rozbicie: tankowania bez licznika (i spalanie bez nich), tankowania niemożliwe dla jednego auta, pomylone liczniki, brak grafiku oraz szacunek nadwyżki w litrach i złotych.
