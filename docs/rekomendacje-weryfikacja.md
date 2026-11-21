# Rekomendacje Ziemowita – zestaw do weryfikacji

> Plik generowany automatycznie przez `apps/web/scripts/advice-matrix.mts` (uruchom: `npm run advice:matrix` w `apps/web`).
> Wyniki scenariuszy pochodzą z prawdziwych funkcji `buildSummary` i `collectAdvice` – nie edytuj ich ręcznie, tylko popraw logikę i wygeneruj plik ponownie.

Dokument ma trzy części:

1. **Reguły** – kiedy włącza się każda porada i każda ocena ogólna (progi wprost z kodu).
2. **Macierz scenariuszy** – które porady pojawiają się w 21 sytuacjach testowych.
3. **Karty scenariuszy** – pełne dane wejściowe, wynik i miejsce na ocenę eksperta.

Na końcu jest lista miejsc, które szczególnie warto zweryfikować merytorycznie.

## 1. Reguły

### 1.1. Skąd biorą się statusy wejściowe

| Wskaźnik | Źródło | Jak jest liczony |
| --- | --- | --- |
| Opady vs norma | Open-Meteo (archiwum) | Suma opadów z 30 dni w porównaniu ze średnią z tych samych dni w poprzednich latach, w %. |
| Najdłużej bez deszczu | Open-Meteo | Najdłuższa seria dni z opadem < 1 mm w ostatnich 30 dniach. |
| Bilans wodny | Open-Meteo | Suma opadu − suma parowania potencjalnego (ET0) z ostatnich 30 dni, w mm. |
| Status gleby | Open-Meteo (wilgotność 9–27 cm) | < 15% obj. → `dry` (sucha), 15–30% → `moderate`, ≥ 30% → `wet` (mokra). |
| Zmiana wilgotności | Open-Meteo | Różnica wilgotności strefy korzeni z 30 dni, w punktach procentowych. |
| Stan wodowskazu | IMGW | `alarm`, gdy stan ≥ alarmowy; `warning`, gdy stan ≥ ostrzegawczy (3 najbliższe stacje). |
| Trend rzeki | GloFAS | Zmiana przepływu względem średniej z 30 dni, w %. |
| Prognoza | Open-Meteo | Opad − parowanie na najbliższe 7 dni, w mm. |
| NDVI | Sentinel-2 | Zieleń roślin 0–1 i różnica względem tego samego okresu rok temu. |

### 1.2. Ocena ogólna (werdykt)

Ocena powstaje z punktów **deficytu** i **nadwyżki** zbieranych przez `buildSummary`:

| Warunek | Deficyt | Nadwyżka |
| --- | --- | --- |
| Opady ≤ −20% normy | +1 | |
| Opady ≥ +20% normy | | +1 |
| ≥ 10 dni bez deszczu | +1 | |
| Bilans ≤ −30 mm | +2 | |
| Bilans od −30 do −5 mm (bez −5) | +1 | |
| Bilans > +15 mm | | +1 |
| Gleba sucha | +2 | |
| Gleba mokra | | +1 |
| Spadek wilgotności ≤ −3 p.p. (gdy gleba nie jest mokra) | +1 | |
| Wodowskaz w stanie ostrzegawczym lub alarmowym | | +2 |
| Trend rzeki ≤ −20% | +1 | |
| Trend rzeki ≥ +30% | | +1 |
| NDVI < 0,3 lub spadek NDVI ≤ −0,08 rok do roku, **tylko gdy deficyt > 0** | +1 | |

Werdykt wybierany jest w tej kolejności (pierwszy pasujący wygrywa):

| Werdykt | Warunek | Tytuł w raporcie |
| --- | --- | --- |
| `deficit-high` | deficyt ≥ 3 | Wysokie ryzyko niedoboru wody |
| `deficit` | deficyt ≥ 1 i deficyt > nadwyżka | Umiarkowane ryzyko niedoboru wody |
| `flood` | alarm/ostrzeżenie na wodowskazie lub nadwyżka ≥ 4 | Nadmiar wody – ryzyko podtopień |
| `wet` | nadwyżka ≥ 2 | Dobre uwilgotnienie – czas magazynować wodę |
| `stable` | pozostałe przypadki | Sytuacja wodna stabilna |

Sezon wegetacyjny w regułach to **kwiecień–wrzesień**, sezon chłodny to **październik–luty**. Marzec nie należy do żadnego z nich.

### 1.3. Porady (maksymalnie 5 w raporcie, posortowane po priorytecie – mniejszy = ważniejszy)

| ID | Porada | Kiedy się włącza | Priorytet | Termin |
| --- | --- | --- | --- | --- |
| `flood` | Przygotuj pole na wysoką wodę | Którykolwiek z 3 najbliższych wodowskazów w stanie ostrzegawczym lub alarmowym. | 1 | Zrób teraz |
| `gates-close` | Zamknij zastawki na rowach | Werdykt `deficit` lub `deficit-high`. | 2 przy `deficit-high`, 3 przy `deficit` | Zrób teraz |
| `gates-hold` | Zatrzymaj nadwyżkę wody na polu | Brak deficytu **i** brak alarmu na wodowskazie **i** (gleba mokra **lub** bilans > +15 mm). | 3 | W tym tygodniu |
| `tillage` | Ogranicz uprawę gleby | Gleba sucha (< 15%). | 3 | W tym tygodniu |
| `irrigation` | Nawadniaj w chłodnych godzinach | Sezon wegetacyjny **i** ≥ 10 dni bez deszczu. | 2 | Zrób teraz |
| `forecast-dry` | Nie czekaj na deszcz | Prognoza 7 dni < −5 mm. | 3 | Zrób teraz |
| `heavy-machinery` | Odłóż wjazd ciężkim sprzętem | Gleba mokra (≥ 30%). | 4 | W tym tygodniu |
| `field-check` | Obejrzyj rośliny na polu | Sezon wegetacyjny **i** jest NDVI **i** (NDVI < 0,3 **lub** spadek ≤ −0,08 rok do roku). | 3 przy deficycie, inaczej 4 | W tym tygodniu |
| `crop` | Ściółkowanie zależne od uprawy (patrz niżej) | Werdykt `deficit`/`deficit-high` **lub** gleba sucha; uprawa inna niż „inna uprawa”. | 4 | W tym sezonie |
| `cover-crop` | Zostaw okrywę roślinną na zimę | Sezon chłodny **i** brak deficytu. | 5 | W tym sezonie |
| `gates-ready` | Sprawdź zastawki i rowy | Zawsze. | 6 | W tym sezonie |
| `humus` | Dbaj o próchnicę w glebie | Zawsze. | 7 | W tym sezonie |

Warianty porady `crop`:

| Uprawa | Porada |
| --- | --- |
| ziemniaki, warzywa | Okryj glebę między rzędami |
| owoce i sad | Wyściółkuj pasy pod drzewami |
| zboża, rzepak, kukurydza, buraki | Zostaw resztki roślin na polu |
| inna uprawa | brak porady |

## 2. Macierz scenariuszy

● – porada pokazana w raporcie, ○ – porada pasuje, ale wypadła przez limit 5 porad.

| Scenariusz | Werdykt | `flood` | `gates-close` | `gates-hold` | `tillage` | `irrigation` | `forecast-dry` | `heavy-machinery` | `field-check` | `crop` | `cover-crop` | `gates-ready` | `humus` |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| [S01](#s01) Sytuacja stabilna latem | `stable` |  |  |  |  |  |  |  |  |  |  | ● | ● |
| [S02](#s02) Sytuacja stabilna jesienią | `stable` |  |  |  |  |  |  |  |  |  | ● | ● | ● |
| [S03](#s03) Sytuacja stabilna w marcu | `stable` |  |  |  |  |  |  |  |  |  |  | ● | ● |
| [S04](#s04) Silna susza w lipcu | `deficit-high` |  | ● |  | ● | ● | ● |  | ● | ○ |  | ○ | ○ |
| [S05](#s05) Umiarkowany niedobór wiosną | `deficit` |  | ● |  |  |  |  |  |  | ● |  | ● | ● |
| [S06](#s06) Niedobór zimą (sad) | `deficit` |  | ● |  |  |  |  |  |  | ● |  | ● | ● |
| [S07](#s07) Krótka susza w sierpniu | `deficit` |  | ● |  |  | ● |  |  |  | ● |  | ● | ● |
| [S08](#s08) Sucha prognoza przy normalnym stanie | `stable` |  |  |  |  |  | ● |  |  |  |  | ● | ● |
| [S09](#s09) Mokro jesienią | `wet` |  |  | ● |  |  |  | ● |  |  | ● | ● | ● |
| [S10](#s10) Stan alarmowy na rzece | `flood` | ● |  |  |  |  |  | ● |  |  |  | ● | ● |
| [S11](#s11) Duży nadmiar wody bez alarmu | `flood` |  |  | ● |  |  |  | ● |  |  | ● | ● | ● |
| [S12](#s12) Susza i jednocześnie stan ostrzegawczy | `deficit-high` | ● | ● |  | ● | ● | ● |  |  | ○ |  | ○ | ○ |
| [S13](#s13) Remis: długi brak deszczu i mokra gleba | `stable` |  |  | ● |  | ● |  | ● |  |  |  | ● | ● |
| [S14](#s14) Słabe NDVI przy normalnej wodzie | `stable` |  |  |  |  |  |  |  | ● |  |  | ● | ● |
| [S15](#s15) Spadek NDVI wzmacnia niedobór | `deficit` |  | ● |  |  |  |  |  | ● | ● |  | ● | ● |
| [S16](#s16) Słabe NDVI w listopadzie | `stable` |  |  |  |  |  |  |  |  |  | ● | ● | ● |
| [S17](#s17) Niedobór dla „innej uprawy” | `deficit` |  | ● |  |  |  |  |  |  |  |  | ● | ● |
| [S18](#s18) Brak danych hydrologicznych | `deficit` |  | ● |  |  |  |  |  |  | ● |  | ● | ● |
| [S19](#s19) Gleba szybko przesycha | `deficit` |  | ● |  |  |  |  |  |  | ● |  | ● | ● |
| [S20](#s20) Wartości tuż poniżej progów | `stable` |  |  |  |  |  |  |  |  |  |  | ● | ● |
| [S21](#s21) Wartości dokładnie na progach | `deficit-high` |  | ● |  |  | ● |  |  |  | ● |  | ● | ● |

Pokrycie: 12/12 porad pokazanych co najmniej raz, werdykty: `stable`, `deficit-high`, `deficit`, `wet`, `flood`.

## 3. Karty scenariuszy

Przy każdej karcie zaznacz ocenę. Jeśli porada jest nietrafna, wpisz, co powinno się pojawić zamiast niej.

<a id="s01"></a>
### S01 · Sytuacja stabilna latem

*Cel:* Punkt odniesienia: wszystkie wskaźniki w normie w sezonie wegetacyjnym. Powinny zostać tylko porady ogólne.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | lipiec |
| Uprawa | zboża |
| Opady 30 dni vs norma | 0% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | 0 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | 0.70 (rok do roku +0.02) |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Wnioski z danych:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Silna zielona biomasa (NDVI); NDVI zbliżone do ubiegłego roku

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 2 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s02"></a>
### S02 · Sytuacja stabilna jesienią

*Cel:* Normalne warunki w okresie chłodnym – powinna dojść porada o okrywie roślinnej.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | listopad |
| Uprawa | zboża |
| Opady 30 dni vs norma | 0% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | 0 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | brak jakościowej sceny |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Wnioski z danych:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Brak jakościowego NDVI

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🌱 Zostaw okrywę roślinną na zimę | W tym sezonie | 5 | Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać. |
| 2 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 3 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s03"></a>
### S03 · Sytuacja stabilna w marcu

*Cel:* Marzec nie jest ani sezonem wegetacyjnym (kwi–wrz), ani chłodnym (paź–lut) – brak porad sezonowych.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | marzec |
| Uprawa | zboża |
| Opady 30 dni vs norma | 0% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | 0 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Wnioski z danych:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 2 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s04"></a>
### S04 · Silna susza w lipcu

*Cel:* Wszystkie wskaźniki suszy naraz. Sprawdza limit 5 porad i kolejność priorytetów.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | lipiec |
| Uprawa | ziemniaki |
| Opady 30 dni vs norma | -45% |
| Najdłużej bez deszczu | 16 dni |
| Bilans wodny 30 dni (opad − parowanie) | -48 mm |
| Gleba (strefa korzeni) | dry, 12%, zmiana -5 p.p. |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | -18 mm |
| Satelita (NDVI) | 0.25 (rok do roku -0.12) |

**Werdykt:** `deficit-high` – Wysokie ryzyko niedoboru wody

**Wnioski z danych:** Opady poniżej normy; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Słaba zielona biomasa (NDVI); Spadek NDVI rok do roku

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 2 | W ostatnich 30 dniach wyparowało o 48 mm więcej wody, niż spadło z deszczem. |
| 2 | 💦 Nawadniaj w chłodnych godzinach | Zrób teraz | 2 | Przez 16 dni z rzędu nie spadło więcej niż 1 mm deszczu. |
| 3 | 🚜 Ogranicz uprawę gleby | W tym tygodniu | 3 | Wilgotność w strefie korzeni wynosi tylko 12% – to poziom suchej gleby. |
| 4 | ☀️ Nie czekaj na deszcz | Zrób teraz | 3 | Prognoza na 7 dni: ok. 0 mm deszczu przy 18 mm parowania. |
| 5 | 🔍 Obejrzyj rośliny na polu | W tym tygodniu | 3 | Zieleń roślin z satelity (NDVI) spadła z 0.37 rok temu do 0.25. |

*Wypadły przez limit 5:* Okryj glebę między rzędami (priorytet 4), Sprawdź zastawki i rowy (priorytet 6), Dbaj o próchnicę w glebie (priorytet 7).

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s05"></a>
### S05 · Umiarkowany niedobór wiosną

*Cel:* Opady poniżej normy i lekko ujemny bilans przy umiarkowanej wilgotności gleby.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | maj |
| Uprawa | rzepak |
| Opady 30 dni vs norma | -25% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | -10 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Wnioski z danych:** Opady poniżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | W ostatnich 30 dniach wyparowało o 10 mm więcej wody, niż spadło z deszczem. |
| 2 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s06"></a>
### S06 · Niedobór zimą (sad)

*Cel:* Deficyt poza sezonem wegetacyjnym: bez porady o nawadnianiu i bez okrywy roślinnej (bo jest deficyt).

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | styczeń |
| Uprawa | owoce i sad |
| Opady 30 dni vs norma | -30% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | -12 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Wnioski z danych:** Opady poniżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | W ostatnich 30 dniach wyparowało o 12 mm więcej wody, niż spadło z deszczem. |
| 2 | 🍎 Wyściółkuj pasy pod drzewami | W tym sezonie | 4 | Drzewa owocowe potrzebują stałej wilgoci, a odkryta gleba pod koronami szybko wysycha. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s07"></a>
### S07 · Krótka susza w sierpniu

*Cel:* Tylko długi okres bez deszczu (12 dni), reszta w normie.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | sierpień |
| Uprawa | kukurydza |
| Opady 30 dni vs norma | 0% |
| Najdłużej bez deszczu | 12 dni |
| Bilans wodny 30 dni (opad − parowanie) | 0 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Wnioski z danych:** Opady w normie; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 💦 Nawadniaj w chłodnych godzinach | Zrób teraz | 2 | Przez 12 dni z rzędu nie spadło więcej niż 1 mm deszczu. |
| 2 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | Wskaźniki pokazują, że wody na działce ubywa. |
| 3 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s08"></a>
### S08 · Sucha prognoza przy normalnym stanie

*Cel:* Bieżąco w normie, ale prognoza na 7 dni wyraźnie ujemna.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | czerwiec |
| Uprawa | zboża |
| Opady 30 dni vs norma | 0% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | 0 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | -10 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Wnioski z danych:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | ☀️ Nie czekaj na deszcz | Zrób teraz | 3 | Prognoza na 7 dni: ok. 5 mm deszczu przy 15 mm parowania. |
| 2 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 3 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s09"></a>
### S09 · Mokro jesienią

*Cel:* Opady powyżej normy, dodatni bilans i mokra gleba bez alarmów – ocena „wet”.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | październik |
| Uprawa | zboża |
| Opady 30 dni vs norma | +35% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | +24 mm |
| Gleba (strefa korzeni) | wet, 34% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | +3 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `wet` – Dobre uwilgotnienie – czas magazynować wodę

**Wnioski z danych:** Opady powyżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🚧 Zatrzymaj nadwyżkę wody na polu | W tym tygodniu | 3 | W ostatnich 30 dniach spadło o 24 mm więcej wody, niż wyparowało, a wilgotność gleby wynosi 34%. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Wilgotność gleby wynosi 34% – to poziom mokrej gleby. |
| 3 | 🌱 Zostaw okrywę roślinną na zimę | W tym sezonie | 5 | Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s10"></a>
### S10 · Stan alarmowy na rzece

*Cel:* Wodowskaz w stanie alarmowym – porada bezpieczeństwa na pierwszym miejscu, bez „zatrzymaj nadwyżkę”.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | kwiecień |
| Uprawa | kukurydza |
| Opady 30 dni vs norma | +40% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | +40 mm |
| Gleba (strefa korzeni) | wet, 38% |
| Wodowskaz w pobliżu | STAN ALARMOWY |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | +12 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `flood` – Nadmiar wody – ryzyko podtopień

**Wnioski z danych:** Opady powyżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Podwyższone stany wód; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🌊 Przygotuj pole na wysoką wodę | Zrób teraz | 1 | Wodowskaz Wodowskaz testowy na rzece Wisła pokazuje 620 cm przy stanie ostrzegawczym 520 cm. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Gleba jest już mokra, a w prognozie jest jeszcze ok. 27 mm deszczu. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s11"></a>
### S11 · Duży nadmiar wody bez alarmu

*Cel:* Nadwyżka ≥ 4 pkt bez przekroczeń na wodowskazie – ocena „flood”, ale bez porady o wysokiej wodzie.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | luty |
| Uprawa | buraki |
| Opady 30 dni vs norma | +50% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | +30 mm |
| Gleba (strefa korzeni) | wet, 36% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | +40% |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `flood` – Nadmiar wody – ryzyko podtopień

**Wnioski z danych:** Opady powyżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Przepływ w zlewni; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🚧 Zatrzymaj nadwyżkę wody na polu | W tym tygodniu | 3 | W ostatnich 30 dniach spadło o 30 mm więcej wody, niż wyparowało, a wilgotność gleby wynosi 36%. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Wilgotność gleby wynosi 36% – to poziom mokrej gleby. |
| 3 | 🌱 Zostaw okrywę roślinną na zimę | W tym sezonie | 5 | Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s12"></a>
### S12 · Susza i jednocześnie stan ostrzegawczy

*Cel:* Sytuacja sprzeczna: lokalna susza, ale rzeka w stanie ostrzegawczym (np. opady w górze zlewni).

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | sierpień |
| Uprawa | zboża |
| Opady 30 dni vs norma | -35% |
| Najdłużej bez deszczu | 14 dni |
| Bilans wodny 30 dni (opad − parowanie) | -35 mm |
| Gleba (strefa korzeni) | dry, 13% |
| Wodowskaz w pobliżu | stan ostrzegawczy |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | -8 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `deficit-high` – Wysokie ryzyko niedoboru wody

**Wnioski z danych:** Opady poniżej normy; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Podwyższone stany wód; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🌊 Przygotuj pole na wysoką wodę | Zrób teraz | 1 | Wodowskaz Wodowskaz testowy na rzece Wisła pokazuje 540 cm przy stanie ostrzegawczym 520 cm. |
| 2 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 2 | W ostatnich 30 dniach wyparowało o 35 mm więcej wody, niż spadło z deszczem. |
| 3 | 💦 Nawadniaj w chłodnych godzinach | Zrób teraz | 2 | Przez 14 dni z rzędu nie spadło więcej niż 1 mm deszczu. |
| 4 | 🚜 Ogranicz uprawę gleby | W tym tygodniu | 3 | Wilgotność w strefie korzeni wynosi tylko 13% – to poziom suchej gleby. |
| 5 | ☀️ Nie czekaj na deszcz | Zrób teraz | 3 | Prognoza na 7 dni: ok. 7 mm deszczu przy 15 mm parowania. |

*Wypadły przez limit 5:* Zostaw resztki roślin na polu (priorytet 4), Sprawdź zastawki i rowy (priorytet 6), Dbaj o próchnicę w glebie (priorytet 7).

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s13"></a>
### S13 · Remis: długi brak deszczu i mokra gleba

*Cel:* 1 pkt deficytu i 1 pkt nadwyżki – ocena wypada „stabilna”, a porady się wzajemnie wykluczają.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | czerwiec |
| Uprawa | warzywa |
| Opady 30 dni vs norma | 0% |
| Najdłużej bez deszczu | 11 dni |
| Bilans wodny 30 dni (opad − parowanie) | 0 mm |
| Gleba (strefa korzeni) | wet, 32% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Wnioski z danych:** Opady w normie; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 💦 Nawadniaj w chłodnych godzinach | Zrób teraz | 2 | Przez 11 dni z rzędu nie spadło więcej niż 1 mm deszczu. |
| 2 | 🚧 Zatrzymaj nadwyżkę wody na polu | W tym tygodniu | 3 | Gleba jest mokra (32% wilgotności). |
| 3 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Wilgotność gleby wynosi 32% – to poziom mokrej gleby. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s14"></a>
### S14 · Słabe NDVI przy normalnej wodzie

*Cel:* Satelita pokazuje słabe rośliny, ale woda w normie – porada „obejrzyj rośliny” bez zmiany oceny.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | czerwiec |
| Uprawa | zboża |
| Opady 30 dni vs norma | 0% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | 0 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | 0.25 (rok do roku 0) |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Wnioski z danych:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Słaba zielona biomasa (NDVI); NDVI zbliżone do ubiegłego roku

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🔍 Obejrzyj rośliny na polu | W tym tygodniu | 4 | Zieleń roślin z satelity (NDVI) wynosi 0.25 – to słabe pokrycie. |
| 2 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 3 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s15"></a>
### S15 · Spadek NDVI wzmacnia niedobór

*Cel:* Lekki deficyt + spadek NDVI rok do roku – satelita dodaje punkt deficytu.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | lipiec |
| Uprawa | zboża |
| Opady 30 dni vs norma | 0% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | -10 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | 0.45 (rok do roku -0.15) |

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Wnioski z danych:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Umiarkowana zielona biomasa (NDVI); Spadek NDVI rok do roku

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | W ostatnich 30 dniach wyparowało o 10 mm więcej wody, niż spadło z deszczem. |
| 2 | 🔍 Obejrzyj rośliny na polu | W tym tygodniu | 3 | Zieleń roślin z satelity (NDVI) spadła z 0.60 rok temu do 0.45. |
| 3 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s16"></a>
### S16 · Słabe NDVI w listopadzie

*Cel:* Poza sezonem wegetacyjnym porada „obejrzyj rośliny” nie powinna się pojawić.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | listopad |
| Uprawa | zboża |
| Opady 30 dni vs norma | 0% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | 0 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | 0.20 (rok do roku -0.1) |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Wnioski z danych:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Słaba zielona biomasa (NDVI); Spadek NDVI rok do roku

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🌱 Zostaw okrywę roślinną na zimę | W tym sezonie | 5 | Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać. |
| 2 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 3 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s17"></a>
### S17 · Niedobór dla „innej uprawy”

*Cel:* Deficyt przy uprawie bez dedykowanej porady ściółkowania.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | czerwiec |
| Uprawa | inna uprawa |
| Opady 30 dni vs norma | -30% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | -15 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Wnioski z danych:** Opady poniżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | W ostatnich 30 dniach wyparowało o 15 mm więcej wody, niż spadło z deszczem. |
| 2 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 3 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s18"></a>
### S18 · Brak danych hydrologicznych

*Cel:* Działa tylko meteorologia (np. awaria API hydro) – porada o zastawkach z ogólnym uzasadnieniem.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | maj |
| Uprawa | zboża |
| Opady 30 dni vs norma | -25% |
| Najdłużej bez deszczu | 5 dni |
| Dane hydrologiczne | brak (null) |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Wnioski z danych:** Opady poniżej normy

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | Wskaźniki pokazują, że wody na działce ubywa. |
| 2 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s19"></a>
### S19 · Gleba szybko przesycha

*Cel:* Gleba jeszcze umiarkowana, ale spadek wilgotności ≥ 3 p.p. i lekko ujemny bilans.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | czerwiec |
| Uprawa | buraki |
| Opady 30 dni vs norma | 0% |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni (opad − parowanie) | -8 mm |
| Gleba (strefa korzeni) | moderate, 16%, zmiana -4 p.p. |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Wnioski z danych:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | W ostatnich 30 dniach wyparowało o 8 mm więcej wody, niż spadło z deszczem. |
| 2 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s20"></a>
### S20 · Wartości tuż poniżej progów

*Cel:* Bilans dokładnie −5 mm, 9 dni bez deszczu, opady −19% – żaden próg nie powinien się uruchomić.

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | lipiec |
| Uprawa | zboża |
| Opady 30 dni vs norma | -19% |
| Najdłużej bez deszczu | 9 dni |
| Bilans wodny 30 dni (opad − parowanie) | -5 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | -5 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Wnioski z danych:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 2 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s21"></a>
### S21 · Wartości dokładnie na progach

*Cel:* Bilans dokładnie −30 mm i 10 dni bez deszczu – progi włączające (≤ −30, ≥ 10).

| Dane wejściowe | Wartość |
| --- | --- |
| Miesiąc | lipiec |
| Uprawa | zboża |
| Opady 30 dni vs norma | -20% |
| Najdłużej bez deszczu | 10 dni |
| Bilans wodny 30 dni (opad − parowanie) | -30 mm |
| Gleba (strefa korzeni) | moderate, 22% |
| Wodowskaz w pobliżu | stan normalny |
| Trend przepływu rzeki | brak danych |
| Prognoza 7 dni (opad − parowanie) | 0 mm |
| Satelita (NDVI) | nie pobrano |

**Werdykt:** `deficit-high` – Wysokie ryzyko niedoboru wody

**Wnioski z danych:** Opady poniżej normy; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |
| --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 2 | W ostatnich 30 dniach wyparowało o 30 mm więcej wody, niż spadło z deszczem. |
| 2 | 💦 Nawadniaj w chłodnych godzinach | Zrób teraz | 2 | Przez 10 dni z rzędu nie spadło więcej niż 1 mm deszczu. |
| 3 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

## 4. Miejsca do szczególnej weryfikacji

- **Sprzeczne porady przy remisie punktów (S13).** Przy 1 pkt deficytu i 1 pkt nadwyżki werdykt jest „stabilny”, a jednocześnie pojawiają się „Nawadniaj” i „Zatrzymaj nadwyżkę” / „Odłóż wjazd ciężkim sprzętem”.
- **Susza przy wysokiej rzece (S12).** Rolnik dostaje jednocześnie „Przygotuj pole na wysoką wodę” i „Zamknij zastawki”. Do oceny, czy to sensowne, gdy wysoka woda pochodzi z góry zlewni.
- **Stałe progi wilgotności gleby (15% / 30%).** Nie zależą od rodzaju gleby – dla piasku 15% to dużo, dla gliny mało.
- **Stały próg NDVI 0,3.** Nie uwzględnia fazy rozwoju roślin (np. wczesna wiosna po siewie zawsze ma niskie NDVI).
- **Porada „Zostaw resztki roślin na polu” przed żniwami (S05 – maj, S19 – czerwiec).** Treść mówi o resztkach pożniwnych, a włącza się w środku sezonu.
- **Nawadnianie zależy tylko od dni bez deszczu.** Nie sprawdza, czy gleba jest mokra (S13).
- **Marzec bez porad sezonowych (S03).** Ani okrywa roślinna, ani porady sezonu wegetacyjnego.
- **Limit 5 porad (S04, S12).** Przy silnej suszy część porad wypada – w S04 wypada jedyna porada dopasowana do uprawy (ziemniaki: „Okryj glebę między rzędami”). Warto ocenić, czy wypadają właściwe.
