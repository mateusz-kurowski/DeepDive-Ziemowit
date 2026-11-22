# Rekomendacje Ziemowita – zestaw do weryfikacji

> Plik generowany automatycznie przez `apps/web/scripts/advice-matrix.mts` (uruchom: `npm run advice:matrix` w `apps/web`).
> Wyniki scenariuszy pochodzą z prawdziwych funkcji `buildSummary` i `collectAdvice`. Progi w sekcji „1. Reguły” są wstawione z `apps/web/app/raport/advice-config.ts`.

Dokument ma trzy części:

1. **Reguły** – kiedy włącza się każda porada i każda ocena ogólna.
2. **Macierz scenariuszy** – które porady pojawiają się w 30 sytuacjach testowych.
3. **Karty scenariuszy** – pełne dane wejściowe, wynik i miejsce na ocenę eksperta.

## 1. Reguły

### 1.1. Skąd biorą się statusy wejściowe

| Wskaźnik | Źródło | Jak jest liczony |
| --- | --- | --- |
| Opady vs norma | Open-Meteo | Suma opadów z 30 dni względem średniej z tych samych dni w poprzednich latach, w %. |
| SPI-1 / SPI-3 | archiwum opadów, gdy jest | SPI-3 < -1 albo SPI-1 < -2 zastępuje próg procentowy. |
| Dni bez deszczu | Open-Meteo | Najdłuższa seria dni z opadem < 1 mm. Próg: 10 dni. Nie otwiera etapu suszy. |
| Anomalia bilansu | opad − ET0 minus norma | Progi -40 / -15 / +20 mm. Bez normy: sezon wegetacyjny -50 / -30 / +15, poza nim -30 / -5 / +15. |
| Gleba | Open-Meteo 9–27 cm i opcjonalnie uziarnienie | Bez tekstury: < 15% sucha, ≥ 30% mokra. Z teksturą: wskaźnik 0–1, sucha poniżej 0.4, mokra od 1. |
| Wodowskaz | IMGW | Liczy się stacja w stanie ostrzegawczym lub alarmowym do 15 km. Dalsza jest tylko wskazówką o niższej pewności. |
| Trend rzeki | GloFAS | Progi -20% / +30%. Poniżej 2000 km² zlewni trend nie daje punktów. |
| Prognoza | Open-Meteo, 7 dni | Sucha, gdy opad − ET0 ≤ -15 mm w sezonie wegetacyjnym i ≤ -5 mm poza nim. |
| NDVI / NDWI | Sentinel-2 L2A | Scena do 10 dni i co najmniej 70% czystych pikseli. Słabe NDVI < 0.4 w miesiącach 5, 6, 7, 8. |

### 1.2. Punkty i etap suszy

Etap rośnie jak w CDI: sam sygnał meteorologiczny to obserwacja, gleba albo gleba z roślinami podnosi ostrzeżenie, gleba i rośliny razem dają alarm suszy na polu. Same dni bez deszczu dodają punkt, ale nie otwierają etapu.

| Warunek | Deficyt | Nadwyżka | Sygnał |
| --- | --- | --- | --- |
| SPI albo opady ≤ -20% | +1 | | meteo |
| SPI-1 > 1 albo opady ≥ +20% | | +1 | |
| Anomalia bilansu ≤ -40 mm | +2 | | meteo |
| Anomalia bilansu w (-40; -15] mm | +1 | | meteo |
| Anomalia bilansu ≥ +20 mm | | +1 | |
| ≥ 10 dni bez deszczu | +1 | | brak |
| Trend rzeki ≤ -20% i zlewnia się liczy | +1 | | meteo |
| Trend rzeki ≥ +30% i zlewnia się liczy | | +1 | |
| Wodowskaz ostrzegawczy lub alarmowy w promieniu 15 km | | +2 | |
| Gleba sucha | +2 | | gleba |
| Gleba mokra | | +1 | |
| Spadek wilgotności ≤ -3 p.p. (gleba nie mokra) | +1 | | gleba |
| Anomalia wilgotności ≤ -1 | +1 | | gleba |
| Anomalia roślin, sezon wegetacyjny, scena użyteczna | +1 | | rośliny |

Werdykt (pierwszy pasujący wygrywa):

| Werdykt | Warunek | Tytuł |
| --- | --- | --- |
| `flood` | stan alarmowy, albo ostrzegawczy przy etapie 0–1 | Nadmiar wody – ryzyko podtopień |
| `drought-high-water` | stan ostrzegawczy i etap ≥ 2 | Susza na polu, wysoka woda w rzece |
| `deficit-high` | etap 3, albo etap 2 i deficyt ≥ 3 | Wysokie ryzyko niedoboru wody |
| `deficit` | etap 2 i deficyt większy od nadwyżki | Umiarkowane ryzyko niedoboru wody |
| `deficit-watch` | etap 1 i deficyt większy od nadwyżki | Mniej wody niż zwykle – obserwuj sytuację |
| `wet` | nadwyżka ≥ 2; przy ≥ 4 dopisek intense | Dobre uwilgotnienie – czas magazynować wodę / Bardzo dużo wody – zatrzymaj ją, ale pilnuj odpływu |
| `stable` | reszta | Sytuacja wodna stabilna |

Sezon wegetacyjny: miesiące 4, 5, 6, 7, 8, 9. Wiosna (roztopy): 2, 3, 4. Okno ustawowe suszy rolniczej: 03-21–09-30. Brak hydrologii albo wilgotności gleby obniża pewność. Brak tekstury, SPI, norm i NDVI pewności nie obniża.

Uziarnienie (orientacyjne PTW / PPW, % obj.):

| Tekstura | PTW | PPW |
| --- | --- | --- |
| `sand` | 4 | 12 |
| `loamy_sand` | 6 | 16 |
| `sandy_loam` | 9 | 23 |
| `loam` | 13 | 30 |
| `silt_loam` | 13 | 33 |
| `clay_loam` | 18 | 36 |
| `clay` | 23 | 40 |

Nawadnianie przy wskaźniku gleby poniżej 0.5. Dla szerokości ≥ 53° start okna z kwietnia i do 5 maja przesuwa się o 10 dni, a z 2.–3. dekady maja o 5 dni.

### 1.3. Porady (maksymalnie 5, najpierw priorytet, potem termin)

| ID | Porada | Kiedy | Priorytet | Termin |
| --- | --- | --- | --- | --- |
| `flood` | Przygotuj pole na wysoką wodę | Wodowskaz ostrzegawczy lub alarmowy. | 1 | Zrób teraz |
| `gates-close` | Zamknij zastawki na rowach | Niedobór, wysoki niedobór, susza przy wysokiej rzece albo obserwacja. Nie przy alarmie. | 2 / 3 | teraz, a przy obserwacji: tydzień |
| `gates-spring` | Zamknij zastawki po roztopach | Miesiące 2, 3, 4, brak alarmu i brak niedoboru. | 3 | W tym tygodniu |
| `gates-hold` | Zatrzymaj nadwyżkę | Brak niedoboru i alarmu, gleba mokra albo anomalia ≥ +20 mm. Odpada w żniwa i gdy jest porada wiosenna. | 3 | W tym tygodniu |
| `irrigation` | Nawadniaj w chłodnych godzinach | Uprawa z okna nawadniania, gleba nie mokra i sucha albo wskaźnik < 0.5. | 2 | teraz przy wysokim niedoborze, inaczej tydzień |
| `tillage` | Ogranicz uprawę gleby | Gleba sucha. | 3 | W tym tygodniu |
| `forecast-dry` | Nie czekaj na deszcz | Prognoza poniżej progu sezonu i gleba nie mokra. Znika, gdy jest nawadnianie. | 3 / 4 | teraz tylko przy niedoborze |
| `heavy-machinery` | Odłóż wjazd ciężkim sprzętem | Gleba mokra. | 3 w żniwa, inaczej 4 | W tym tygodniu |
| `field-check` | Obejrzyj rośliny na polu | Sezon, świeża scena i anomalia roślin albo słabe NDVI. | 3 / 4 | W tym tygodniu |
| `crop` | Ściółka albo resztki wg uprawy | Niedobór, obserwacja albo sucha gleba, i jest wariant na ten miesiąc. Przypięta – nie wypada z limitu. | 4, przed zbiorem 5 | W tym sezonie |
| `cover-crop` | Okrywa roślinna | Miesiące 8, 9, 10, 11, 12, 1, 2, także przy deficycie. | 5 | W tym sezonie |
| `dry-spell-watch` | Obserwuj glebę | Stabilnie, sezon, ≥ 10 dni bez deszczu, gleba nie mokra, bez nawadniania. | 5 | W tym tygodniu |
| `gates-ready` | Sprawdź zastawki i rowy | Zawsze. | 5 w miesiącach 3, 4, 9, 10, inaczej 6 | W tym sezonie |
| `humus` | Dbaj o próchnicę | Zawsze. | 7 | W tym sezonie |

Każde nawadnianie zawiera zdanie o pozwoleniu wodnoprawnym. Zastawki (zamykanie, roztopy, zatrzymanie nadwyżki) zawierają zakaz budowy urządzenia bez zgody Wód Polskich.

Warianty `crop`:

| Uprawa | Ściółka | Kiedy |
| --- | --- | --- |
| ziemniaki | rows | wzrost 4, 5, 6, 7, 8, 9, zbiór 8, 9, 10, nawadnianie 05-20–08-10 |
| warzywa | rows | wzrost 4, 5, 6, 7, 8, 9, zbiór 7, 8, 9, 10, nawadnianie 04-15–09-30 |
| owoce i sad | tree_strips | wzrost 4, 5, 6, 7, 8, 9, zbiór brak, nawadnianie 06-01–08-31 |
| kukurydza | residue | wzrost 5, 6, 7, 8, 9, zbiór 9, 10, 11, nawadnianie 06-10–08-31 |
| buraki | residue | wzrost 4, 5, 6, 7, 8, 9, 10, zbiór 9, 10, 11, nawadnianie 06-20–09-10 |
| zboża | residue | wzrost 3, 4, 5, 6, 7, zbiór 7, 8, nawadnianie nie |
| rzepak | residue | wzrost 3, 4, 5, 6, 7, zbiór 7, 8, nawadnianie nie |
| inna uprawa | generic | wzrost 4, 5, 6, 7, 8, 9, zbiór brak, nawadnianie nie |

## 2. Macierz scenariuszy

● – porada w raporcie, ○ – pasuje, ale wypadła przez limit 5.

| Scenariusz | Werdykt | `flood` | `gates-close` | `gates-spring` | `gates-hold` | `irrigation` | `tillage` | `forecast-dry` | `heavy-machinery` | `field-check` | `crop` | `cover-crop` | `dry-spell-watch` | `gates-ready` | `humus` |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| [S01](#s01) Sytuacja stabilna latem | `stable` |  |  |  |  |  |  |  |  |  |  |  |  | ● | ● |
| [S02](#s02) Sytuacja stabilna jesienią | `stable` |  |  |  |  |  |  |  |  |  |  | ● |  | ● | ● |
| [S03](#s03) Sytuacja stabilna w marcu | `stable` |  |  | ● |  |  |  |  |  |  |  |  |  | ● | ● |
| [S04](#s04) Silna susza w lipcu | `deficit-high` |  | ● |  |  | ● | ● |  |  | ● | ● |  |  | ○ | ○ |
| [S05](#s05) Obserwacja niedoboru w maju | `deficit-watch` |  | ● |  |  |  |  |  |  |  | ● |  |  | ● | ● |
| [S06](#s06) Obserwacja niedoboru w styczniu | `deficit-watch` |  | ● |  |  |  |  |  |  |  | ● | ● |  | ● | ● |
| [S07](#s07) Krótka susza w sierpniu | `stable` |  |  |  |  |  |  |  |  |  |  | ● | ● | ● | ● |
| [S08](#s08) Sucha prognoza przy normalnym stanie | `stable` |  |  |  |  |  |  |  |  |  |  |  |  | ● | ● |
| [S09](#s09) Mokro jesienią, ozimina | `wet` |  |  |  | ● |  |  |  | ● |  |  | ● |  | ● | ● |
| [S10](#s10) Stan alarmowy na rzece | `flood` | ● |  |  |  |  |  |  | ● |  |  |  |  | ● | ● |
| [S11](#s11) Duży nadmiar wody bez alarmu | `wet` (intense) |  |  | ● |  |  |  |  | ● |  |  | ● |  | ● | ● |
| [S12](#s12) Susza i stan ostrzegawczy | `drought-high-water` | ● | ● |  |  |  | ● |  |  |  | ● | ● |  | ○ | ○ |
| [S13](#s13) Dni bez deszczu i mokra gleba | `stable` |  |  |  | ● |  |  |  | ● |  |  |  |  | ● | ● |
| [S14](#s14) Słabe NDVI przy normalnej wodzie | `stable` |  |  |  |  |  |  |  |  | ● |  |  |  | ● | ● |
| [S15](#s15) Spadek NDVI wzmacnia niedobór | `deficit` |  | ● |  |  |  |  |  |  | ● | ● |  |  | ● | ● |
| [S16](#s16) Słabe NDVI w listopadzie | `stable` |  |  |  |  |  |  |  |  |  |  | ● |  | ● | ● |
| [S17](#s17) Obserwacja dla innej uprawy | `deficit-watch` |  | ● |  |  |  |  |  |  |  | ● |  |  | ● | ● |
| [S18](#s18) Brak danych hydrologicznych | `deficit-watch` |  | ● |  |  |  |  |  |  |  | ● |  |  | ● | ● |
| [S19](#s19) Gleba szybko przesycha, buraki przed oknem | `deficit` |  | ● |  |  |  |  |  |  |  | ● |  |  | ● | ● |
| [S20](#s20) Wartości tuż powyżej progów | `stable` |  |  |  |  |  |  |  |  |  |  |  |  | ● | ● |
| [S21](#s21) Wartości dokładnie na progach | `deficit-watch` |  | ● |  |  |  |  |  |  |  | ● |  |  | ● | ● |
| [S22](#s22) Mokro po roztopach | `wet` |  |  | ● |  |  |  |  | ● |  |  |  |  | ● | ● |
| [S23](#s23) Przeciętny lipiec | `stable` |  |  |  |  |  |  |  |  |  |  |  |  | ● | ● |
| [S24](#s24) Susza po żniwach | `deficit-high` |  | ● |  |  |  | ● |  |  |  | ● | ● |  | ● | ○ |
| [S25](#s25) Susza w kukurydzy | `deficit-high` |  | ● |  |  | ● | ● |  |  |  | ● |  |  | ● | ○ |
| [S26](#s26) Mokra jesień, ozimina | `wet` |  |  |  | ● |  |  |  | ● |  |  | ● |  | ● | ● |
| [S27](#s27) Alarm i susza na ziemniakach | `flood` | ● |  |  |  | ● | ● |  |  |  | ● |  |  | ● | ○ |
| [S28](#s28) Te same 22%, różne gleby | `stable` |  |  |  | ● |  |  |  | ● |  |  |  |  | ● | ● |
| [S29](#s29) Susza fizjologiczna | `deficit` |  | ● |  |  |  |  |  |  | ● | ● |  |  | ● | ● |
| [S30](#s30) Mała rzeka i stara scena | `stable` |  |  |  |  |  |  |  |  |  |  |  |  | ● | ● |

Pokrycie: 13/14 porad pokazanych co najmniej raz, werdykty: `stable`, `deficit-high`, `deficit-watch`, `wet`, `flood`, `drought-high-water`, `deficit`.

Kolumna `forecast-dry` jest pusta celowo: w S08 prognoza −10 mm nie schodzi poniżej progu sezonu, a w S04 i S25 zdanie o prognozie dokleja się do nawadniania.

## 3. Karty scenariuszy


<a id="s01"></a>
### S01 · Sytuacja stabilna latem

*Cel:* Lipiec w normie. Zostają porady ogólne.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-07-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | 0 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | NDVI 0.70, rok do roku +0.02 |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Zieleń roślin (NDVI); NDVI rok do roku

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 2 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s02"></a>
### S02 · Sytuacja stabilna jesienią

*Cel:* Listopad w normie – dochodzi okrywa roślinna.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-11-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | 0 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | brak jakościowej sceny |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Brak jakościowego NDVI

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🌱 Zostaw okrywę roślinną na zimę | W tym sezonie | 5 | Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać. | Zostaw okrywę roślinną na zimę. |
| 2 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 3 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s03"></a>
### S03 · Sytuacja stabilna w marcu

*Cel:* Marzec bez deficytu – porada o zamknięciu zastawek po roztopach.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-03-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | 0 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki po roztopach | W tym tygodniu | 3 | Luty, marzec i kwiecień to czas, żeby zatrzymać wodę roztopową, zanim odpłynie rowami. | Zamknij zastawki zaraz po roztopach i wiosennym odwodnieniu pola. Woda roztopowa to najtańszy zapas na wiosnę – jej całkowite odprowadzenie to marnotrawstwo. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. |
| 2 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 5 | Wiosna i jesień to czas konserwacji urządzeń melioracyjnych. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 3 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s04"></a>
### S04 · Silna susza w lipcu

*Cel:* Wszystkie sygnały suszy naraz, ziemniaki w oknie nawadniania. Porada uprawy zostaje w limicie.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-07-15 |
| Uprawa | ziemniaki |
| Oziminy | nie |
| Opady 30 dni vs norma | -45% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 16 dni |
| Bilans wodny 30 dni | -48 mm |
| Anomalia bilansu | -45 mm |
| Gleba | 12%, bez tekstury, zmiana -5 p.p. |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | -18 mm |
| Satelita | NDVI 0.25, rok do roku -0.12 |

**Werdykt:** `deficit-high` – Wysokie ryzyko niedoboru wody

**Punkty:** deficyt 8, nadwyżka 0, etap 3, sygnały meteo, soil, veg, gleba `dry`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady poniżej normy; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Zieleń roślin (NDVI); NDVI rok do roku

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 2 | Bilans wody jest o 45 mm niższy niż zwykle o tej porze. W ostatnich 30 dniach wyparowało o 48 mm więcej wody, niż spadło. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 💦 Nawadniaj w chłodnych godzinach | Zrób teraz | 2 | Wilgotność w strefie korzeni wynosi 12% – gleba jest sucha. Przez 16 dni z rzędu nie spadło więcej niż 1 mm deszczu. Prognoza na 7 dni: ok. 0 mm deszczu przy 18 mm parowania (próg suchej prognozy -15 mm). | Jeśli masz ujęcie z pozwoleniem wodnoprawnym i instalację, nawadniaj rano lub wieczorem. Nie deszczuj przy wietrze powyżej 4 m/s. Przerwij po opadzie powyżej 25–30 mm. Nawadniaj do polowej pojemności, nie do zastoisk – nadmiar wymywa nawozy. Nawadniaj tylko z ujęcia objętego pozwoleniem wodnoprawnym. Bezpłatny limit 5 m³/dobę nie obejmuje nawadniania pól. 1 mm wody na 1 ha to 10 m³. |
| 3 | 🚜 Ogranicz uprawę gleby | W tym tygodniu | 3 | Wilgotność w strefie korzeni wynosi 12% – to poziom suchej gleby. | Zrezygnuj z orki i głębokiego spulchniania – odwracanie gleby przyspiesza jej wysychanie. Zostaw resztki roślin na powierzchni jako ochronę. Na glebach ciężkich z podeszwą płużną rozważ jesienią głęboszowanie, gdy gleba nie jest przesuszona ani mokra. |
| 4 | 🔍 Obejrzyj rośliny na polu | W tym tygodniu | 3 | NDVI spadło z 0,37 rok temu do 0,25. Jeśli rok temu rosła tu inna uprawa, porównanie może mylić. | Sprawdź, czy słabsza zieleń wynika z fazy rozwoju, choroby, szkodników czy braku wody. Zdjęcie z satelity nie wystarcza, żeby zdecydować o nawadnianiu. |
| 5 | 🥔 Okryj glebę między rzędami | W tym sezonie | 4 | Ziemniaki i warzywa szczególnie źle znoszą brak wody w okresie wzrostu bulw i owoców. | Słoma lub inna ściółka między rzędami ogranicza parowanie i utrzymuje wilgoć przy korzeniach. |

*Wypadły przez limit 5:* Sprawdź zastawki i rowy (priorytet 6), Dbaj o próchnicę w glebie (priorytet 7).

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s05"></a>
### S05 · Obserwacja niedoboru w maju

*Cel:* Sam sygnał meteorologiczny – werdykt obserwacji, nie niedoboru. Rzepak bez nawadniania.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-05-15 |
| Uprawa | rzepak |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | -25% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | -10 mm |
| Anomalia bilansu | -15 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `deficit-watch` – Mniej wody niż zwykle – obserwuj sytuację

**Punkty:** deficyt 2, nadwyżka 0, etap 1, sygnały meteo, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady poniżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | W tym tygodniu | 3 | Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 🌾 Po zbiorze zostaw resztki i wysiej międzyplon | W tym sezonie | 5 | Do żniw jeszcze chwila, ale już teraz warto zaplanować okrywę, która ograniczy parowanie po zbiorze. | Po zbiorze zostaw resztki na polu i wysiej międzyplon, żeby gleba nie została odkryta. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s06"></a>
### S06 · Obserwacja niedoboru w styczniu

*Cel:* Sad zimą: zastawki, ściółka pod drzewami i okrywa, bez nawadniania.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-01-15 |
| Uprawa | owoce i sad |
| Oziminy | nie |
| Opady 30 dni vs norma | -30% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | -12 mm |
| Anomalia bilansu | -15 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `deficit-watch` – Mniej wody niż zwykle – obserwuj sytuację

**Punkty:** deficyt 2, nadwyżka 0, etap 1, sygnały meteo, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady poniżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | W tym tygodniu | 3 | Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 🍎 Wyściółkuj pasy pod drzewami | W tym sezonie | 4 | Drzewa owocowe potrzebują stałej wilgoci, a odkryta gleba pod koronami szybko wysycha. | Kora, zrębki lub skoszona trawa pod drzewami zmniejszają parowanie i chronią korzenie przed przesuszeniem. |
| 3 | 🌱 Zostaw okrywę roślinną na zimę | W tym sezonie | 5 | Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać. | Zostaw okrywę roślinną na zimę. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s07"></a>
### S07 · Krótka susza w sierpniu

*Cel:* Same dni bez deszczu nie zmieniają werdyktu. Jest obserwacja gleby i międzyplon.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-08-15 |
| Uprawa | kukurydza |
| Oziminy | nie |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 12 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | 0 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 1, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 👀 Obserwuj glebę | W tym tygodniu | 5 | Seria 12 dni bez istotnego deszczu jeszcze nie oznacza suszy, ale glebę warto sprawdzić na głębokości korzeni. | Od 12 dni nie padało więcej niż 1 mm. Sprawdź glebę łopatą na głębokości korzeni – po krótkim deszczu wierzch bywa wilgotny, a 5 cm niżej sucho. |
| 2 | 🌱 Wysiej międzyplon po zbiorze | W tym sezonie | 5 | Okrywa po żniwach poprawia retencję i ogranicza parowanie z gołej gleby. | Po zbiorze wysiej międzyplon lub mieszankę okrywową. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s08"></a>
### S08 · Sucha prognoza przy normalnym stanie

*Cel:* Prognoza −10 mm w czerwcu nie schodzi poniżej progu sezonu.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-06-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | 0 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | -10 mm |
| Satelita | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 2 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s09"></a>
### S09 · Mokro jesienią, ozimina

*Cel:* Nadwyżka wody w październiku na zbożu ozimym – wariant zastawek dla ozimin.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-10-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | +35% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | +24 mm |
| Anomalia bilansu | +30 mm |
| Gleba | 34%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | +3 mm |
| Satelita | nie pobrano |

**Werdykt:** `wet` – Dobre uwilgotnienie – czas magazynować wodę

**Punkty:** deficyt 0, nadwyżka 3, etap 0, sygnały brak, gleba `wet`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady powyżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zatrzymaj nadwyżkę wody na polu | W tym tygodniu | 3 | Bilans wody jest o 30 mm wyższy niż zwykle o tej porze, a wilgotność gleby wynosi 34%. Nie zalewaj oziminy. | Zatrzymuj wodę w rowach, ale nie dopuść, żeby woda stała przy korzeniach oziminy. Przy zastoiskach uchyl zastawkę. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Wilgotność w strefie korzeni wynosi 34% – to poziom mokrej gleby. | Mokra gleba łatwo się ugniata. Ugnieciona ziemia gorzej przyjmuje wodę i może utrudniać uprawę przez kolejne sezony. |
| 3 | 🌱 Zostaw okrywę roślinną na zimę | W tym sezonie | 5 | Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać. | Zostaw okrywę roślinną na zimę. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 5 | Wiosna i jesień to czas konserwacji urządzeń melioracyjnych. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s10"></a>
### S10 · Stan alarmowy na rzece

*Cel:* Alarm wygrywa z nadwyżką. W tekście jest próg alarmowy, bez podwójnego „Wodowskaz”.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-04-15 |
| Uprawa | kukurydza |
| Oziminy | nie |
| Opady 30 dni vs norma | +40% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | +40 mm |
| Anomalia bilansu | +45 mm |
| Gleba | 38%, bez tekstury |
| Wodowskaz | STAN ALARMOWY |
| Trend rzeki | brak danych |
| Prognoza 7 dni | +12 mm |
| Satelita | nie pobrano |

**Werdykt:** `flood` – Nadmiar wody – ryzyko podtopień

**Punkty:** deficyt 0, nadwyżka 5, etap 0, sygnały brak, gleba `wet`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady powyżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Stan alarmowy na wodowskazie; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🌊 Przygotuj pole na wysoką wodę | Zrób teraz | 1 | Stacja Warszawa na rzece Wisła pokazuje 620 cm przy stanie alarmowym 600 cm. | Udrożnij przepusty i rowy na granicy pola, a sprzęt przenieś wyżej. Wywieź z terenów zalewowych obornik, nawozy i środki ochrony roślin. Przestaw maszyny wyżej i sprawdź na mapach zagrożenia powodziowego, czy działka leży w strefie zalewowej. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Gleba jest już mokra, a w prognozie jest jeszcze ok. 27 mm deszczu. | Mokra gleba łatwo się ugniata. Ugnieciona ziemia gorzej przyjmuje wodę i może utrudniać uprawę przez kolejne sezony. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 5 | Wiosna i jesień to czas konserwacji urządzeń melioracyjnych. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s11"></a>
### S11 · Duży nadmiar wody bez alarmu

*Cel:* Nadwyżka 4 pkt bez wodowskazu to mokro (intense), nie powódź. Luty: zastawki po roztopach.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-02-15 |
| Uprawa | buraki |
| Oziminy | nie |
| Opady 30 dni vs norma | +50% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | +30 mm |
| Anomalia bilansu | +35 mm |
| Gleba | 36%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | +40%, zlewnia 5000 km² |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `wet` (intense) – Bardzo dużo wody – zatrzymaj ją, ale pilnuj odpływu

**Punkty:** deficyt 0, nadwyżka 4, etap 0, sygnały brak, gleba `wet`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady powyżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Przepływ w zlewni; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki po roztopach | W tym tygodniu | 3 | Luty, marzec i kwiecień to czas, żeby zatrzymać wodę roztopową, zanim odpłynie rowami. | Zamknij zastawki zaraz po roztopach i wiosennym odwodnieniu pola. Woda roztopowa to najtańszy zapas na wiosnę – jej całkowite odprowadzenie to marnotrawstwo. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Wilgotność w strefie korzeni wynosi 36% – to poziom mokrej gleby. | Mokra gleba łatwo się ugniata. Ugnieciona ziemia gorzej przyjmuje wodę i może utrudniać uprawę przez kolejne sezony. |
| 3 | 🌱 Nie zaoruj okrywy przed wiosną | W tym sezonie | 5 | Okrywa zimowa trzyma wodę do startu wegetacji. Zaoranie jej teraz zwiększa parowanie. | Nie zaoruj okrywy przed wiosną. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s12"></a>
### S12 · Susza i stan ostrzegawczy

*Cel:* Ostrzeżenie przy etapie 2 daje suszę na polu i wysoką wodę. Zbóż się nie nawadnia.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-08-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | -35% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 14 dni |
| Bilans wodny 30 dni | -35 mm |
| Anomalia bilansu | -40 mm |
| Gleba | 13%, bez tekstury |
| Wodowskaz | stan ostrzegawczy |
| Trend rzeki | brak danych |
| Prognoza 7 dni | -8 mm |
| Satelita | nie pobrano |

**Werdykt:** `drought-high-water` – Susza na polu, wysoka woda w rzece

**Punkty:** deficyt 6, nadwyżka 2, etap 2, sygnały meteo, soil, gleba `dry`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady poniżej normy; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Stan ostrzegawczy na wodowskazie; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🌊 Przygotuj pole na wysoką wodę | Zrób teraz | 1 | Stacja Warszawa na rzece Wisła pokazuje 540 cm przy stanie ostrzegawczym 520 cm. | Udrożnij przepusty i rowy na granicy pola, a sprzęt przenieś wyżej. Wywieź z terenów zalewowych obornik, nawozy i środki ochrony roślin. Przestaw maszyny wyżej i sprawdź na mapach zagrożenia powodziowego, czy działka leży w strefie zalewowej. |
| 2 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 2 | Bilans wody jest o 40 mm niższy niż zwykle o tej porze. W ostatnich 30 dniach wyparowało o 35 mm więcej wody, niż spadło. Obserwuj stan rzeki – przy dalszym wzroście bądź gotów otworzyć zastawki. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Obserwuj stan rzeki – przy dalszym wzroście bądź gotów otworzyć zastawki. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 3 | 🚜 Ogranicz uprawę gleby | W tym tygodniu | 3 | Wilgotność w strefie korzeni wynosi 13% – to poziom suchej gleby. | Zrezygnuj z orki i głębokiego spulchniania – odwracanie gleby przyspiesza jej wysychanie. Zostaw resztki roślin na powierzchni jako ochronę. Na glebach ciężkich z podeszwą płużną rozważ jesienią głęboszowanie, gdy gleba nie jest przesuszona ani mokra. |
| 4 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. | Słoma i resztki pożniwne zostawione na powierzchni działają jak ściółka i zmniejszają parowanie z odkrytej gleby. |
| 5 | 🌱 Wysiej międzyplon po zbiorze | W tym sezonie | 5 | Okrywa po żniwach poprawia retencję i ogranicza parowanie z gołej gleby. | Po zbiorze wysiej międzyplon lub mieszankę okrywową. |

*Wypadły przez limit 5:* Sprawdź zastawki i rowy (priorytet 6), Dbaj o próchnicę w glebie (priorytet 7).

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s13"></a>
### S13 · Dni bez deszczu i mokra gleba

*Cel:* Remis nie daje niedoboru. Mokra gleba blokuje nawadnianie warzyw.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-06-15 |
| Uprawa | warzywa |
| Oziminy | nie |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 11 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | 0 mm |
| Gleba | 32%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 1, nadwyżka 1, etap 0, sygnały brak, gleba `wet`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zatrzymaj nadwyżkę wody na polu | W tym tygodniu | 3 | Gleba jest mokra (32% wilgotności). | Podnieś zastawki, żeby woda wsiąkała w glebę zamiast odpływać rowami. Ta woda przyda się w suchym okresie. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Wilgotność w strefie korzeni wynosi 32% – to poziom mokrej gleby. | Mokra gleba łatwo się ugniata. Ugnieciona ziemia gorzej przyjmuje wodę i może utrudniać uprawę przez kolejne sezony. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s14"></a>
### S14 · Słabe NDVI przy normalnej wodzie

*Cel:* NDVI 0,25 w czerwcu daje obejrzenie pola, bez punktów suszy.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-06-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | 0 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | NDVI 0.25, rok do roku 0 |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Zieleń roślin (NDVI); NDVI rok do roku

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🔍 Obejrzyj rośliny na polu | W tym tygodniu | 4 | NDVI 0,25 to słaba kondycja roślin (0,2–0,4). | Sprawdź, czy słabsza zieleń wynika z fazy rozwoju, choroby, szkodników czy braku wody. Zdjęcie z satelity nie wystarcza, żeby zdecydować o nawadnianiu. |
| 2 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 3 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s15"></a>
### S15 · Spadek NDVI wzmacnia niedobór

*Cel:* Anomalia bilansu i spadek rok do roku. Uzasadnienie wspomina płodozmian.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-07-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | -10 mm |
| Anomalia bilansu | -15 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | NDVI 0.45, rok do roku -0.15 |

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Punkty:** deficyt 2, nadwyżka 0, etap 2, sygnały meteo, veg, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Zieleń roślin (NDVI); NDVI rok do roku

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | Bilans wody jest o 15 mm niższy niż zwykle o tej porze. W ostatnich 30 dniach wyparowało o 10 mm więcej wody, niż spadło. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 🔍 Obejrzyj rośliny na polu | W tym tygodniu | 3 | NDVI spadło z 0,60 rok temu do 0,45. Jeśli rok temu rosła tu inna uprawa, porównanie może mylić. | Sprawdź, czy słabsza zieleń wynika z fazy rozwoju, choroby, szkodników czy braku wody. Zdjęcie z satelity nie wystarcza, żeby zdecydować o nawadnianiu. |
| 3 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. | Słoma i resztki pożniwne zostawione na powierzchni działają jak ściółka i zmniejszają parowanie z odkrytej gleby. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s16"></a>
### S16 · Słabe NDVI w listopadzie

*Cel:* Poza sezonem wegetacyjnym nie ma porady o oględzinach roślin.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-11-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | 0 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | NDVI 0.20, rok do roku -0.1 |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Zieleń roślin (NDVI); NDVI rok do roku

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🌱 Zostaw okrywę roślinną na zimę | W tym sezonie | 5 | Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać. | Zostaw okrywę roślinną na zimę. |
| 2 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 3 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s17"></a>
### S17 · Obserwacja dla innej uprawy

*Cel:* Sam sygnał meteo to obserwacja, a uprawa bez własnej ściółki dostaje poradę ogólną.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-06-15 |
| Uprawa | inna uprawa |
| Oziminy | nie |
| Opady 30 dni vs norma | -30% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | -15 mm |
| Anomalia bilansu | -20 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `deficit-watch` – Mniej wody niż zwykle – obserwuj sytuację

**Punkty:** deficyt 2, nadwyżka 0, etap 1, sygnały meteo, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady poniżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | W tym tygodniu | 3 | Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 🪴 Nie zostawiaj gleby odkrytej | W tym sezonie | 4 | Odkryta gleba traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. | Nie zostawiaj gleby odkrytej – mulcz lub okrywa ogranicza parowanie. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s18"></a>
### S18 · Brak danych hydrologicznych

*Cel:* Sama meteorologia obniża pewność. Termin porad schodzi z „teraz” na ten tydzień.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-05-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | -25% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 5 dni |
| Dane hydrologiczne | brak (null) |
| Satelita | nie pobrano |

**Werdykt:** `deficit-watch` – Mniej wody niż zwykle – obserwuj sytuację (ocena wstępna – brak części danych)

**Punkty:** deficyt 1, nadwyżka 0, etap 1, sygnały meteo, gleba `unknown`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady poniżej normy; Niepełne dane

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | W tym tygodniu | 3 | Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 🌾 Po zbiorze zostaw resztki i wysiej międzyplon | W tym sezonie | 5 | Do żniw jeszcze chwila, ale już teraz warto zaplanować okrywę, która ograniczy parowanie po zbiorze. | Po zbiorze zostaw resztki na polu i wysiej międzyplon, żeby gleba nie została odkryta. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s19"></a>
### S19 · Gleba szybko przesycha, buraki przed oknem

*Cel:* 15 czerwca jest przed oknem nawadniania buraków. Nie ma jeszcze „zostaw resztki”.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-06-15 |
| Uprawa | buraki |
| Oziminy | nie |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | -8 mm |
| Anomalia bilansu | -15 mm |
| Gleba | 16%, bez tekstury, zmiana -4 p.p. |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Punkty:** deficyt 2, nadwyżka 0, etap 2, sygnały meteo, soil, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | Bilans wody jest o 15 mm niższy niż zwykle o tej porze. W ostatnich 30 dniach wyparowało o 8 mm więcej wody, niż spadło. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 🌾 Po zbiorze zostaw resztki i wysiej międzyplon | W tym sezonie | 5 | Do żniw jeszcze chwila, ale już teraz warto zaplanować okrywę, która ograniczy parowanie po zbiorze. | Po zbiorze zostaw resztki na polu i wysiej międzyplon, żeby gleba nie została odkryta. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s20"></a>
### S20 · Wartości tuż powyżej progów

*Cel:* Anomalia −14 mm, opady −19% i 9 dni bez deszczu nie włączają sygnału.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-07-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | -19% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 9 dni |
| Bilans wodny 30 dni | -5 mm |
| Anomalia bilansu | -14 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | -5 mm |
| Satelita | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 2 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s21"></a>
### S21 · Wartości dokładnie na progach

*Cel:* Progi dają 4 pkt deficytu, ale bez gleby i roślin zostaje obserwacja. Zbóż się nie nawadnia.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-07-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | -20% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 10 dni |
| Bilans wodny 30 dni | -30 mm |
| Anomalia bilansu | -40 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `deficit-watch` – Mniej wody niż zwykle – obserwuj sytuację

**Punkty:** deficyt 4, nadwyżka 0, etap 1, sygnały meteo, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady poniżej normy; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | W tym tygodniu | 3 | Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. | Słoma i resztki pożniwne zostawione na powierzchni działają jak ściółka i zmniejszają parowanie z odkrytej gleby. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s22"></a>
### S22 · Mokro po roztopach

*Cel:* Marzec, nadwyżka i mokra gleba. Najpierw zastawki po roztopach, bez powodzi i bez zatrzymywania nadwyżki.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-03-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | +25% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | +25 mm |
| Gleba | 33%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `wet` – Dobre uwilgotnienie – czas magazynować wodę

**Punkty:** deficyt 0, nadwyżka 3, etap 0, sygnały brak, gleba `wet`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady powyżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki po roztopach | W tym tygodniu | 3 | Luty, marzec i kwiecień to czas, żeby zatrzymać wodę roztopową, zanim odpłynie rowami. | Zamknij zastawki zaraz po roztopach i wiosennym odwodnieniu pola. Woda roztopowa to najtańszy zapas na wiosnę – jej całkowite odprowadzenie to marnotrawstwo. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Wilgotność w strefie korzeni wynosi 33% – to poziom mokrej gleby. | Mokra gleba łatwo się ugniata. Ugnieciona ziemia gorzej przyjmuje wodę i może utrudniać uprawę przez kolejne sezony. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 5 | Wiosna i jesień to czas konserwacji urządzeń melioracyjnych. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s23"></a>
### S23 · Przeciętny lipiec

*Cel:* Bilans −35 mm przy normie −30 mm (anomalia −5) nie daje punktów.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-07-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | -35 mm |
| Anomalia bilansu | -5 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 2 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s24"></a>
### S24 · Susza po żniwach

*Cel:* Sierpień, zboża, sucha gleba. Brak nawadniania, resztki pożniwne, uprawa uproszczona i międzyplon.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-08-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | -30% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 14 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | -30 mm |
| Gleba | 12%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `deficit-high` – Wysokie ryzyko niedoboru wody

**Punkty:** deficyt 5, nadwyżka 0, etap 2, sygnały meteo, soil, gleba `dry`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady poniżej normy; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 2 | Bilans wody jest o 30 mm niższy niż zwykle o tej porze. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 🚜 Ogranicz uprawę gleby | W tym tygodniu | 3 | Wilgotność w strefie korzeni wynosi 12% – to poziom suchej gleby. | Zrezygnuj z orki i głębokiego spulchniania – odwracanie gleby przyspiesza jej wysychanie. Zostaw resztki roślin na powierzchni jako ochronę. Na glebach ciężkich z podeszwą płużną rozważ jesienią głęboszowanie, gdy gleba nie jest przesuszona ani mokra. |
| 3 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. | Słoma i resztki pożniwne zostawione na powierzchni działają jak ściółka i zmniejszają parowanie z odkrytej gleby. |
| 4 | 🌱 Wysiej międzyplon po zbiorze | W tym sezonie | 5 | Okrywa po żniwach poprawia retencję i ogranicza parowanie z gołej gleby. | Po zbiorze wysiej międzyplon lub mieszankę okrywową. |
| 5 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |

*Wypadły przez limit 5:* Dbaj o próchnicę w glebie (priorytet 7).

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s25"></a>
### S25 · Susza w kukurydzy

*Cel:* Nawadnianie z dopiskiem prawnym i o wietrze. Prognoza dokleja się do nawadniania. Porada przed zbiorem zostaje w piątce.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-07-15 |
| Uprawa | kukurydza |
| Oziminy | nie |
| Opady 30 dni vs norma | -30% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 12 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | -30 mm |
| Gleba | 12%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | -20 mm |
| Satelita | nie pobrano |

**Werdykt:** `deficit-high` – Wysokie ryzyko niedoboru wody

**Punkty:** deficyt 5, nadwyżka 0, etap 2, sygnały meteo, soil, gleba `dry`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady poniżej normy; Długi okres bez opadów; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 2 | Bilans wody jest o 30 mm niższy niż zwykle o tej porze. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 💦 Nawadniaj w chłodnych godzinach | Zrób teraz | 2 | Wilgotność w strefie korzeni wynosi 12% – gleba jest sucha. Przez 12 dni z rzędu nie spadło więcej niż 1 mm deszczu. Prognoza na 7 dni: ok. 0 mm deszczu przy 20 mm parowania (próg suchej prognozy -15 mm). | Jeśli masz ujęcie z pozwoleniem wodnoprawnym i instalację, nawadniaj rano lub wieczorem. Nie deszczuj przy wietrze powyżej 4 m/s. Przerwij po opadzie powyżej 25–30 mm. Nawadniaj do polowej pojemności, nie do zastoisk – nadmiar wymywa nawozy. Nawadniaj tylko z ujęcia objętego pozwoleniem wodnoprawnym. Bezpłatny limit 5 m³/dobę nie obejmuje nawadniania pól. 1 mm wody na 1 ha to 10 m³. |
| 3 | 🚜 Ogranicz uprawę gleby | W tym tygodniu | 3 | Wilgotność w strefie korzeni wynosi 12% – to poziom suchej gleby. | Zrezygnuj z orki i głębokiego spulchniania – odwracanie gleby przyspiesza jej wysychanie. Zostaw resztki roślin na powierzchni jako ochronę. Na glebach ciężkich z podeszwą płużną rozważ jesienią głęboszowanie, gdy gleba nie jest przesuszona ani mokra. |
| 4 | 🌾 Po zbiorze zostaw resztki i wysiej międzyplon | W tym sezonie | 5 | Do żniw jeszcze chwila, ale już teraz warto zaplanować okrywę, która ograniczy parowanie po zbiorze. | Po zbiorze zostaw resztki na polu i wysiej międzyplon, żeby gleba nie została odkryta. |
| 5 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |

*Wypadły przez limit 5:* Dbaj o próchnicę w glebie (priorytet 7).

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s26"></a>
### S26 · Mokra jesień, ozimina

*Cel:* Październik i ozimina: zatrzymanie wody z zastrzeżeniem, żeby nie stała przy korzeniach. Kontrola bez oziminy ma tekst standardowy.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-10-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | +30% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | +25 mm |
| Gleba | 34%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `wet` – Dobre uwilgotnienie – czas magazynować wodę

**Punkty:** deficyt 0, nadwyżka 3, etap 0, sygnały brak, gleba `wet`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady powyżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zatrzymaj nadwyżkę wody na polu | W tym tygodniu | 3 | Bilans wody jest o 25 mm wyższy niż zwykle o tej porze, a wilgotność gleby wynosi 34%. Nie zalewaj oziminy. | Zatrzymuj wodę w rowach, ale nie dopuść, żeby woda stała przy korzeniach oziminy. Przy zastoiskach uchyl zastawkę. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Wilgotność w strefie korzeni wynosi 34% – to poziom mokrej gleby. | Mokra gleba łatwo się ugniata. Ugnieciona ziemia gorzej przyjmuje wodę i może utrudniać uprawę przez kolejne sezony. |
| 3 | 🌱 Zostaw okrywę roślinną na zimę | W tym sezonie | 5 | Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać. | Zostaw okrywę roślinną na zimę. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 5 | Wiosna i jesień to czas konserwacji urządzeń melioracyjnych. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

#### kontrola bez oziminy

**Werdykt:** `wet` – Dobre uwilgotnienie – czas magazynować wodę

**Punkty:** deficyt 0, nadwyżka 3, etap 0, sygnały brak, gleba `wet`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady powyżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zatrzymaj nadwyżkę wody na polu | W tym tygodniu | 3 | Bilans wody jest o 25 mm wyższy niż zwykle o tej porze, a wilgotność gleby wynosi 34%. | Podnieś zastawki, żeby woda wsiąkała w glebę zamiast odpływać rowami. Ta woda przyda się w suchym okresie. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Wilgotność w strefie korzeni wynosi 34% – to poziom mokrej gleby. | Mokra gleba łatwo się ugniata. Ugnieciona ziemia gorzej przyjmuje wodę i może utrudniać uprawę przez kolejne sezony. |
| 3 | 🌱 Zostaw okrywę roślinną na zimę | W tym sezonie | 5 | Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać. | Zostaw okrywę roślinną na zimę. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 5 | Wiosna i jesień to czas konserwacji urządzeń melioracyjnych. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s27"></a>
### S27 · Alarm i susza na ziemniakach

*Cel:* Alarm zawsze daje powódź. Nie ma zamykania zastawek. Nawadnianie zostaje, ale na ten tydzień.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-07-15 |
| Uprawa | ziemniaki |
| Oziminy | nie |
| Opady 30 dni vs norma | -40% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | -45 mm |
| Gleba | 12%, bez tekstury |
| Wodowskaz | STAN ALARMOWY |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `flood` – Nadmiar wody – ryzyko podtopień

**Punkty:** deficyt 5, nadwyżka 2, etap 2, sygnały meteo, soil, gleba `dry`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady poniżej normy; Klimatyczny bilans wodny; Wilgotność gleby; Stan alarmowy na wodowskazie; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🌊 Przygotuj pole na wysoką wodę | Zrób teraz | 1 | Stacja Warszawa na rzece Wisła pokazuje 620 cm przy stanie alarmowym 600 cm. | Udrożnij przepusty i rowy na granicy pola, a sprzęt przenieś wyżej. Wywieź z terenów zalewowych obornik, nawozy i środki ochrony roślin. Przestaw maszyny wyżej i sprawdź na mapach zagrożenia powodziowego, czy działka leży w strefie zalewowej. |
| 2 | 💦 Nawadniaj w chłodnych godzinach | W tym tygodniu | 2 | Wilgotność w strefie korzeni wynosi 12% – gleba jest sucha. | Jeśli masz ujęcie z pozwoleniem wodnoprawnym i instalację, nawadniaj rano lub wieczorem. Nie deszczuj przy wietrze powyżej 4 m/s. Przerwij po opadzie powyżej 25–30 mm. Nawadniaj do polowej pojemności, nie do zastoisk – nadmiar wymywa nawozy. Nawadniaj tylko z ujęcia objętego pozwoleniem wodnoprawnym. Bezpłatny limit 5 m³/dobę nie obejmuje nawadniania pól. 1 mm wody na 1 ha to 10 m³. |
| 3 | 🚜 Ogranicz uprawę gleby | W tym tygodniu | 3 | Wilgotność w strefie korzeni wynosi 12% – to poziom suchej gleby. | Zrezygnuj z orki i głębokiego spulchniania – odwracanie gleby przyspiesza jej wysychanie. Zostaw resztki roślin na powierzchni jako ochronę. Na glebach ciężkich z podeszwą płużną rozważ jesienią głęboszowanie, gdy gleba nie jest przesuszona ani mokra. |
| 4 | 🥔 Okryj glebę między rzędami | W tym sezonie | 4 | Ziemniaki i warzywa szczególnie źle znoszą brak wody w okresie wzrostu bulw i owoców. | Słoma lub inna ściółka między rzędami ogranicza parowanie i utrzymuje wilgoć przy korzeniach. |
| 5 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |

*Wypadły przez limit 5:* Dbaj o próchnicę w glebie (priorytet 7).

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s28"></a>
### S28 · Te same 22%, różne gleby

*Cel:* Piasek przy 22% jest mokry, ił suchy. Bez tekstury zostają progi orientacyjne.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-06-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | 0 mm |
| Gleba | 22%, sand |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | nie pobrano |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 1, etap 0, sygnały brak, gleba `wet` (wskaźnik 2.25).

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zatrzymaj nadwyżkę wody na polu | W tym tygodniu | 3 | Gleba jest mokra (22% wilgotności). | Podnieś zastawki, żeby woda wsiąkała w glebę zamiast odpływać rowami. Ta woda przyda się w suchym okresie. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. |
| 2 | 🛞 Odłóż wjazd ciężkim sprzętem | W tym tygodniu | 4 | Przy tej glebie 22% obj. daje wskaźnik 2,25 (0 = więdnięcie, 1 = polowa pojemność) – gleba jest mokra. | Mokra gleba łatwo się ugniata. Ugnieciona ziemia gorzej przyjmuje wodę i może utrudniać uprawę przez kolejne sezony. |
| 3 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 4 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

#### B: ił

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Punkty:** deficyt 2, nadwyżka 0, etap 2, sygnały soil, gleba `dry` (wskaźnik -0.06).

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | Przy tej glebie 22% obj. daje wskaźnik -0,06 (0 = więdnięcie, 1 = polowa pojemność) – gleba jest sucha. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 🚜 Ogranicz uprawę gleby | W tym tygodniu | 3 | Przy tej glebie 22% obj. daje wskaźnik -0,06 (0 = więdnięcie, 1 = polowa pojemność) – gleba jest sucha. | Zrezygnuj z orki i głębokiego spulchniania – odwracanie gleby przyspiesza jej wysychanie. Zostaw resztki roślin na powierzchni jako ochronę. Na glebach ciężkich z podeszwą płużną rozważ jesienią głęboszowanie, gdy gleba nie jest przesuszona ani mokra. |
| 3 | 🌾 Po zbiorze zostaw resztki i wysiej międzyplon | W tym sezonie | 5 | Do żniw jeszcze chwila, ale już teraz warto zaplanować okrywę, która ograniczy parowanie po zbiorze. | Po zbiorze zostaw resztki na polu i wysiej międzyplon, żeby gleba nie została odkryta. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

#### bez tekstury

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 2 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s29"></a>
### S29 · Susza fizjologiczna

*Cel:* NDWI 0,25 przy NDVI 0,45 podnosi etap do ostrzeżenia. Zbóż się nie nawadnia.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-07-15 |
| Uprawa | zboża |
| Oziminy | tak (domyślnie) |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | -20 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | brak danych |
| Prognoza 7 dni | 0 mm |
| Satelita | NDVI 0.45, NDWI 0.25, scena 3 dni |

**Werdykt:** `deficit` – Umiarkowane ryzyko niedoboru wody

**Punkty:** deficyt 2, nadwyżka 0, etap 2, sygnały meteo, veg, gleba `moderate`.

**Scena:** użyta albo brak zdjęcia.

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Prognoza na 7 dni; Zieleń roślin (NDVI); Woda w roślinach (NDWI)

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 Zamknij zastawki na rowach | Zrób teraz | 3 | Bilans wody jest o 20 mm niższy niż zwykle o tej porze. | Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką. Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich. Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący. |
| 2 | 🔍 Obejrzyj rośliny na polu | W tym tygodniu | 3 | Rośliny tracą wodę (NDWI 0,25 przy NDVI 0,45) – sprawdź, czy liście więdną. | Sprawdź, czy słabsza zieleń wynika z fazy rozwoju, choroby, szkodników czy braku wody. Zdjęcie z satelity nie wystarcza, żeby zdecydować o nawadnianiu. |
| 3 | 🌾 Zostaw resztki roślin na polu | W tym sezonie | 4 | Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni. | Słoma i resztki pożniwne zostawione na powierzchni działają jak ściółka i zmniejszają parowanie z odkrytej gleby. |
| 4 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 5 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

<a id="s30"></a>
### S30 · Mała rzeka i stara scena

*Cel:* Zlewnia 300 km² i scena sprzed 14 dni nie dają punktów. W raporcie jest informacja o braku aktualnej sceny.

| Dane wejściowe | Wartość |
| --- | --- |
| Data | 2026-06-15 |
| Uprawa | warzywa |
| Oziminy | nie |
| Opady 30 dni vs norma | 0% |
| SPI-1 / SPI-3 | brak (fallback procentowy) |
| Najdłużej bez deszczu | 4 dni |
| Bilans wodny 30 dni | 0 mm |
| Anomalia bilansu | 0 mm |
| Gleba | 22%, bez tekstury |
| Wodowskaz | stan normalny |
| Trend rzeki | -30%, zlewnia 300 km² |
| Prognoza 7 dni | 0 mm |
| Satelita | NDVI 0.20, rok do roku -0.2, scena 14 dni |

**Werdykt:** `stable` – Sytuacja wodna stabilna

**Punkty:** deficyt 0, nadwyżka 0, etap 0, sygnały brak, gleba `moderate`.

**Scena:** Brak aktualnej, bezchmurnej sceny (ostatnia: 01.06).

**Wnioski:** Opady w normie; Klimatyczny bilans wodny; Wilgotność gleby; Przepływ w zlewni; Prognoza na 7 dni; Jakość sceny Sentinel-2

| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |
| --- | --- | --- | --- | --- | --- |
| 1 | 🔧 Sprawdź zastawki i rowy | W tym sezonie | 6 | Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody. | Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich. Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej. |
| 2 | 🌿 Dbaj o próchnicę w glebie | W tym sezonie | 7 | To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody. | Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody. |

**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………

## 4. Miejsca do szczególnej weryfikacji

- Progi anomalii bilansu (-15 / -40 / +20 mm) – kalibracja na latach 2015, 2018, 2019 i na roku mokrym.
- Fallback opadów -20% jest czulszy niż standard EDO (SPI-3 < -1 lub SPI-1 < -2).
- PTW i PPW oraz progi wskaźnika gleby 0.4 (sucha) i 0.5 (nawadnianie) – potrzebny gleboznawca.
- Odstępstwo od CDI: deficyt opadów razem ze spadkiem NDVI to tu ostrzeżenie, a nie alarm.
- Progi NDVI 0.4 i NDWI 0.3 / 0.2 pochodzą z literatury ogólnej, nie z kalibracji dla polskich upraw.
- Porównanie NDVI rok do roku myli się przy zmianie uprawy. Anomalia wieloletnia jest stabilniejsza i włącza się, gdy są norma i odchylenie.
- Jakość sceny (10 dni, 70% czystych pikseli) i próg zlewni 2000 km² dla GloFAS.
- Miesiące zbioru upraw i heurystyka północy (szerokość ≥ 53).
- Promień filtra stacji wodowskazowych (15 km).
- Stan prawny piętrzenia wody w rowach melioracyjnych.
- Bezpieczeństwo zamykania zastawek przy wysokiej rzece i suchym polu.

