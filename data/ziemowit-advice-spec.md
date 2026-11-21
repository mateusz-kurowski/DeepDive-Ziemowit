# Ziemowit – specyfikacja zmian w logice rekomendacji (dla Cursora) · v2

> **Cel:** poprawić `buildSummary` i `collectAdvice` (apps/web), żeby werdykty i porady były zgodne z poradnikami MRiRW, CDR 2025, Wód Polskich i podręcznikiem PAK o danych satelitarnych. Potem przebudować fixture'y i wygenerować `rekomendacje-weryfikacja.md` (`npm run advice:matrix`).
>
> **Zmiany względem v1:** etapowa ocena suszy wzorowana na wskaźniku CDI Europejskiego Obserwatorium Suszy (obserwacja → ostrzeżenie → alarm) i nowy werdykt `deficit-watch` (§3). Wskaźnik wody w roślinach NDWI i progi NDVI z podręcznika PAK (§2.6). Wilgotność gleby jako wskaźnik 0–1 i jej anomalia (§2.4). SPI zamiast samego procentu opadów (§2.2). Ograniczenia GloFAS i jakość scen Sentinel-2 (§2.5, §2.7). Przeliczone oczekiwane wyniki S01–S30 (§8).
>
> **Zasada dla Cursora:** nazwy funkcji, typów i plików dopasuj do istniejącego kodu. Pseudokod opisuje *zachowanie*, nie wymusza struktury. Wszystkie progi trzymaj w jednym pliku konfiguracyjnym (np. `advice-config.ts`), a generator raportu ma czytać je stamtąd.

---

## 0. Kolejność wdrażania

1. Nawadnianie: okna per uprawa, blokada przy mokrej glebie, brak zbóż i rzepaku, dopisek prawny (§5.5).
2. Etapowa ocena suszy i werdykt `deficit-watch` (§3).
3. Bilans wodny jako anomalia (§2.3).
4. Kolejność werdyktów, werdykt mieszany, `flood` tylko z wodowskazu (§3.2).
5. Blokady sprzecznych porad i deduplikacja (§6).
6. Porada wiosenna `gates-spring` i okres II–IV (§5.3).
7. `gates-close` / `gates-hold`: warunki i teksty (oziminy, zbiory, rzeka) (§5.2, §5.4).
8. `crop` i `cover-crop` wg kalendarza (§5.9, §5.10).
9. NDVI: nowe progi, anomalia wieloletnia, NDWI, jakość sceny (§2.6, §2.7, §5.8).
10. `forecast-dry`: próg sezonowy (§5.6).
11. Limit 5 porad z przypiętą poradą dla uprawy (§6.3).
12. Teksty `flood` i filtr stacji (§5.1); ograniczenie trendu GloFAS (§2.5).
13. Niska pewność przy brakach danych (§3.4).
14. Wilgotność gleby jako wskaźnik 0–1 wg uziarnienia i anomalia wilgotności (§2.4); wymaga nowego źródła danych.
15. SPI-1 / SPI-3 (§2.2); wymaga ≥ 30 lat danych opadowych.
16. Dopiski prawne we wszystkich tekstach (§7).

---

## 1. Dane wejściowe – nowe i zmienione

| Pole | Typ | Skąd | Po co |
| --- | --- | --- | --- |
| `date` | `Date` | kontekst raportu | okna nawadniania mają granice dzienne |
| `precip30Pct` | `number` | jest | fallback dla SPI |
| `spi1`, `spi3` | `number \| null` | **nowe** – z archiwum opadów Open-Meteo (30 i 90 dni, ≥ 30 lat historii) | sygnał suszy meteorologicznej (§2.2) |
| `waterBalance30Mm` | `number` | jest | tekst uzasadnienia |
| `waterBalanceNormal30Mm` | `number \| null` | **nowe** – średnia (opad − ET0) dla tych samych dni w latach poprzednich | anomalia |
| `waterBalanceAnomalyMm` | `number \| null` | wyliczane | scoring (§2.3) |
| `winterPrecipAnomalyPct` | `number \| null` | opcjonalne – opady X–II vs norma | tekst `gates-spring` |
| `soilMoisturePct` | `number` | jest (Open-Meteo, 9–27 cm) | status gleby |
| `soilMoistureNormalPct`, `soilMoistureSdPct` | `number \| null` | **nowe** – średnia i odchylenie standardowe dla tego dnia roku z archiwum | anomalia wilgotności (SMA) |
| `soilTexture` | enum \| `null` | **nowe** – europejska baza gleb (ESDAC/EUSIS, z niej korzysta EFAS [PAK s. 314]) albo SoilGrids | wskaźnik wilgotności 0–1 (§2.4) |
| `isWinterCrop` | `boolean` | **nowe** – domyślnie `true` dla zbóż i rzepaku; użytkownik może przełączyć na jare | `gates-hold` jesienią i zimą |
| `ndvi`, `ndviYoY` | jest | Sentinel-2 | |
| `ndviNormal`, `ndviSd` | `number \| null` | **nowe** – średnia i odchylenie NDVI działki dla tej samej dekady z lat 2017–(bieżący − 1) | anomalia NDVI (§2.6) |
| `ndwi` | `number \| null` | **nowe** – Sentinel-2 L2A: (B8A − B12)/(B8A + B12), oba kanały 20 m [PAK s. 92] | stres wodny roślin |
| `sceneDate`, `sceneClearPct` | | **nowe** – data sceny i udział czystych pikseli działki wg maski SCL | jakość NDVI (§2.7) |
| `gaugeStations[]` | | IMGW: `distanceKm`, `river`, `level`, `warningLevelCm`, `alarmLevelCm` | filtr stacji, poprawne teksty |
| `riverCatchmentKm2` | `number \| null` | **nowe** – powierzchnia zlewni punktu GloFAS | waga trendu rzeki (§2.5) |
| `latitude` | `number` | jest | przesunięcie okien nawadniania |

Fixture'y w `advice-matrix.mts` muszą dostać `date` (15. dzień miesiąca, jeśli scenariusz nie mówi inaczej) i `waterBalanceAnomalyMm` (§8.1). Pola SPI, normy wilgotności, normy NDVI i NDWI są opcjonalne – logika ma działać na fallbackach, gdy ich brak.

---

## 2. Sygnały i punkty

### 2.1. Sezony

```ts
const SEASON = {
  spring: [2, 3, 4],              // roztopy, wczesne zamykanie zastawek [MRiRW]
  vegetation: [4, 5, 6, 7, 8, 9],
  cold: [10, 11, 12, 1, 2],
  droughtWindow: { from: '03-21', to: '09-30' }, // ustawowe okno suszy rolniczej [E-poradnik s. 66]
};
```

Marzec należy do `spring`. Luty i kwiecień należą do dwóch sezonów naraz (zamierzone).

### 2.2. Opady: SPI zamiast samego procentu normy

EDO uznaje SPI za referencyjny wskaźnik suszy meteorologicznej; SPI-3 najlepiej opisuje suszę rolniczą [PAK s. 288]. Etap „Obserwacja” w CDI to SPI-3 < −1 lub SPI-1 < −2 [PAK s. 290].

```ts
const meteoPrecipSignal =
  (spi3 != null && spi3 < -1) || (spi1 != null && spi1 < -2)
  || (spi1 == null && spi3 == null && precip30Pct <= -20);  // fallback = dzisiejszy próg
const surplusPrecip =
  (spi1 != null ? spi1 > 1 : precip30Pct >= 20);            // DO KALIBRACJI
```

Fallback −20% jest czulszy niż standard EDO. Dopóki SPI nie jest liczone, raport tego nie zmienia, ale warto to zapisać w sekcji „do weryfikacji”.

### 2.3. Bilans wodny jako anomalia

Latem parowanie to ok. 3,5 mm/dobę, w upały ponad 5 mm [MRiRW], więc 30-dniowy bilans −30 mm jest w lipcu typowy. Wskaźniki EDO też liczy się jako odchylenia od wielolecia [PAK s. 288–289].

```ts
const BALANCE = { deficit1: -15, deficit2: -40, surplus1: +20 };  // anomalia, mm; DO KALIBRACJI
const BALANCE_FALLBACK = {                                         // gdy brak normy
  vegetation: { deficit1: -30, deficit2: -50, surplus1: +15 },
  other:      { deficit1:  -5, deficit2: -30, surplus1: +15 },
};
```

Kalibracja na latach suszy 2015, 2018 i 2019 oraz na roku mokrym (np. 2010).

### 2.4. Gleba: wskaźnik 0–1, status i anomalia

EDO normalizuje wilgotność gleby między punktem trwałego więdnięcia (0) a polową pojemnością wodną (1) – wskaźnik SMI [PAK s. 289]. Stałe 15% obj. to dla piasku polowa pojemność wodna, a dla glin poziom poniżej punktu więdnięcia [MRiRW].

Wartości PTW i PPW poniżej to **orientacyjne wartości literaturowe, nie z dostarczonych źródeł** – do zatwierdzenia przez gleboznawcę.

```ts
const SOIL_WATER = {          // % obj.
  sand:       { ptw: 4,  ppw: 12 },
  loamy_sand: { ptw: 6,  ppw: 16 },
  sandy_loam: { ptw: 9,  ppw: 23 },
  loam:       { ptw: 13, ppw: 30 },
  silt_loam:  { ptw: 13, ppw: 33 },
  clay_loam:  { ptw: 18, ppw: 36 },
  clay:       { ptw: 23, ppw: 40 },
};

function soil(theta, texture) {
  if (!texture) {   // fallback = dzisiejsze progi + zdanie, że progi są orientacyjne
    return { status: theta < 15 ? 'dry' : theta >= 30 ? 'wet' : 'moderate', smi: null };
  }
  const { ptw, ppw } = SOIL_WATER[texture];
  const smi = (theta - ptw) / (ppw - ptw);       // 0 = więdnięcie, 1 = polowa pojemność
  return { status: smi < 0.4 ? 'dry' : smi >= 1 ? 'wet' : 'moderate', smi };  // 0.4 DO KALIBRACJI
}

// Anomalia wilgotności (odpowiednik SMA; CDI: „Ostrzeżenie” przy SMA < −1) [PAK s. 290]
const soilAnomalyZ = (soilMoistureNormalPct != null && soilMoistureSdPct)
  ? (soilMoisturePct - soilMoistureNormalPct) / soilMoistureSdPct : null;
```

Bez tekstury: alternatywa to wskaźnik wilgotności 0–100% IMGW-PIB dla powiatu [E-poradnik s. 62].

### 2.5. Rzeka (GloFAS)

GloFAS ma niższą rozdzielczość niż europejski EFAS, a produkty EFAS są przeznaczone dla zlewni powyżej 2000 km² [PAK s. 312]. Trend przepływu dla małego cieku z GloFAS jest więc mało wiarygodny.

```ts
const RIVER = { deficit: -20, surplus: +30, minCatchmentKm2: 2000 };   // DO KALIBRACJI
const riverUsable = riverCatchmentKm2 == null || riverCatchmentKm2 >= RIVER.minCatchmentKm2;
```

Gdy `riverUsable === false`, trend rzeki nie daje punktów, a raport pokazuje go tylko jako informację.

### 2.6. Roślinność: NDVI i NDWI

Według podręcznika PAK:
- NDVI roślin zwykle 0,2–1,0: **0,2–0,4 słaba kondycja, 0,4–0,6 umiarkowana, > 0,6 dobra**; gleba −0,1 do +0,1 [PAK s. 293].
- NDVI słabiej reaguje na biomasę w późnych fazach, a przy małym zwarciu przeszkadza mu tło glebowe (wtedy lepszy SAVI) [PAK s. 91].
- NDWI (B8A, B12) reaguje na więdnięcie i jest czulszym wskaźnikiem suszy niż NDVI. Susza fizjologiczna zwykle przy **NDVI < 0,5 i NDWI < 0,3**. Klasy NDWI: > 0,4 brak suszy, 0,3–0,4 lekko sucho, 0,2–0,3 umiarkowanie sucho, 0,0–0,2 bardzo sucho, < 0 ekstremalnie sucho [PAK s. 92].
- EDO ocenia roślinność przez anomalię względem wielolecia (ΔFAPAR < −1) [PAK s. 289–290].

```ts
const VEG = {
  ndviWeak: 0.4,              // było 0.3; granica „słabej kondycji” [PAK s. 293]
  ndviWeakMonths: [5, 6, 7, 8],
  ndviAnomalyZ: -1,           // anomalia wieloletnia, wzorem ΔFAPAR
  ndviYoYDrop: -0.08,         // fallback, gdy brak normy (patrz uwaga niżej)
  physioNdvi: 0.5, physioNdwi: 0.3,
};

const ndviZ = (ndviNormal != null && ndviSd) ? (ndvi - ndviNormal) / ndviSd : null;
const vegAnomaly =
     (ndviZ != null ? ndviZ <= VEG.ndviAnomalyZ : (ndviYoY != null && ndviYoY <= VEG.ndviYoYDrop))
  || (ndwi != null && ndvi < VEG.physioNdvi && ndwi < VEG.physioNdwi);
const vegWeak = ndvi < VEG.ndviWeak && VEG.ndviWeakMonths.includes(month);
```

**Uwaga do porównania rok do roku:** płodozmian sprawia, że rok temu na działce mogła być inna uprawa o innym przebiegu NDVI. Profile NDVI upraw o podobnej fenologii też bywają podobne [PAK s. 282]. Anomalia wieloletnia jest stabilniejsza. Rok do roku zostaje tylko jako fallback.

### 2.7. Jakość sceny Sentinel-2

- Wskaźniki liczyć z produktu L2A (po korekcji atmosferycznej). Przed obliczeniem wskaźników zaleca się korekcję radiometryczną, a kanały muszą mieć ten sam rozmiar piksela (NDWI: B8A i B12 po 20 m) [PAK s. 92–93].
- Maskować piksele warstwą SCL (chmury, cienie, śnieg) [PAK s. 140].
- Rewizyta dwóch satelitów to 2–3 dni na naszych szerokościach [PAK s. 138], ale zachmurzenie może trwać kilkanaście dni [PAK s. 326].

```ts
const SCENE = { maxAgeDays: 10, minClearPct: 70 };  // DO KALIBRACJI
const ndviUsable = sceneAgeDays <= SCENE.maxAgeDays && sceneClearPct >= SCENE.minClearPct;
```

Gdy `!ndviUsable`, pokazuj „Brak aktualnej, bezchmurnej sceny (ostatnia: DD.MM)” i nie licz sygnału roślinności. Na przyszłość: radar Sentinel-1 działa przez chmury, co 6 dni [PAK s. 326]; nadaje się do wykrywania zalanych i podtopionych pól.

### 2.8. Tabela punktów

| Grupa | Warunek | Deficyt | Nadwyżka | Sygnał |
| --- | --- | --- | --- | --- |
| Meteo | `meteoPrecipSignal` (§2.2) | +1 | | meteo |
| Meteo | `surplusPrecip` | | +1 | |
| Meteo | anomalia bilansu ≤ −40 mm | +2 | | meteo |
| Meteo | anomalia bilansu w (−40; −15] | +1 | | meteo |
| Meteo | anomalia bilansu ≥ +20 mm | | +1 | |
| Meteo | ≥ 10 dni bez deszczu | +1 | | **brak** (tylko wzmacnia) |
| Hydro | trend rzeki ≤ −20% i `riverUsable` | +1 | | meteo |
| Hydro | trend rzeki ≥ +30% i `riverUsable` | | +1 | |
| Hydro | wodowskaz ostrzegawczy/alarmowy (po filtrze §5.1) | | +2 | |
| Gleba | status `dry` | +2 | | soil |
| Gleba | status `wet` | | +1 | |
| Gleba | spadek ≤ −3 p.p. (gleba nie `wet`) | +1 | | soil |
| Gleba | `soilAnomalyZ` ≤ −1 | +1 | | soil |
| Roślinność | `vegAnomaly`, sezon wegetacyjny, `ndviUsable` | +1 | | veg |

---

## 3. Werdykt

### 3.1. Etapy suszy (wzorem CDI)

CDI według EDO: deficyt opadów to **Obserwacja**; gdy dochodzi anomalia wilgotności gleby – **Ostrzeżenie**; gdy rośliny słabną lub przestają rosnąć – **Alarm** [PAK s. 287, 290].

```ts
const meteo = meteoPrecipSignal || balanceSignal || riverLowSignal;
const soilS = soilDry || soilDrop || soilAnomaly;
const veg   = vegAnomaly && ndviUsable && inVegetationSeason;

let stage = 0;
if (meteo) stage = 1;                       // Obserwacja
if (soilS || (meteo && veg)) stage = 2;     // Ostrzeżenie
if (soilS && veg) stage = 3;                // Alarm
```

Odstępstwo od CDI: sam spadek NDVI z deficytem opadów daje tu „Ostrzeżenie”, a nie „Alarm”. Powód: NDVI na pojedynczej działce jest bardziej zaszumiony (płodozmian, chmury) niż FAPAR z wielolecia w EDO.

### 3.2. Kolejność werdyktów (pierwszy pasujący wygrywa)

```ts
if (gauge === 'alarm')                     return 'flood';
if (gauge === 'warning' && stage >= 2)     return 'drought-high-water';
if (gauge === 'warning')                   return 'flood';
if (stage === 3)                           return 'deficit-high';
if (stage === 2 && deficit >= 3)           return 'deficit-high';
if (stage === 2 && deficit > surplus)      return 'deficit';
if (stage === 1 && deficit > surplus)      return 'deficit-watch';   // NOWY
if (surplus >= 2)                          return 'wet';             // ≥ 4 → intense
return 'stable';
```

- Stan alarmowy oznacza zagrożenie dla infrastruktury, zabudowań, życia i zdrowia, więc wygrywa zawsze [E-poradnik s. 16].
- `flood` z samej nadwyżki ≥ 4 **usunięty**. Zimowe i wczesnowiosenne zalewy łąk nie przynoszą większych szkód [E-poradnik s. 174]; jesienią i zimą można dopuścić okresowe nadmierne uwilgotnienie [MRiRW].

### 3.3. Tytuły

| Werdykt | Tytuł |
| --- | --- |
| `deficit-high` | Wysokie ryzyko niedoboru wody |
| `deficit` | Umiarkowane ryzyko niedoboru wody |
| `deficit-watch` | Mniej wody niż zwykle – obserwuj sytuację |
| `drought-high-water` | Susza na polu, wysoka woda w rzece |
| `flood` | Nadmiar wody – ryzyko podtopień |
| `wet` | Dobre uwilgotnienie – czas magazynować wodę |
| `wet` + `intense` | Bardzo dużo wody – zatrzymaj ją, ale pilnuj odpływu |
| `stable` | Sytuacja wodna stabilna |

Zbiory pomocnicze używane dalej:

```ts
const DEF   = ['deficit', 'deficit-high', 'drought-high-water'];
const WATCH = ['deficit-watch'];
```

### 3.4. Pewność oceny

```ts
confidence = (hydro == null || soilMoisturePct == null) ? 'low' : 'normal';
// brak tekstury, SPI, norm albo NDVI NIE obniża confidence – dodaje tylko zdanie informacyjne
```

Przy `low` dopisz do tytułu „(ocena wstępna – brak części danych)” i zmień termin „Zrób teraz” na „W tym tygodniu” we wszystkich poradach **oprócz `flood`**.

### 3.5. Regeneracja po suszy (opcjonalnie, później)

CDI ma też klasy „Częściowa regeneracja” (opady wróciły, rośliny nadal słabe) i „Całkowita regeneracja” [PAK s. 290]. Wymaga zapamiętania etapu z poprzedniego raportu. Propozycja tytułu: „Deszcz wrócił, ale rośliny jeszcze się nie odbudowały”.

---

## 4. Kalendarz upraw

```ts
const CROPS = {
  ziemniaki: { irrigable: true,  window: ['05-20','08-10'], harvest: [8,9,10],  growing: [4,5,6,7,8,9],    mulch: 'rows' },
  warzywa:   { irrigable: true,  window: ['04-15','09-30'], harvest: [7,8,9,10], growing: [4,5,6,7,8,9],   mulch: 'rows' },
  owoce_sad: { irrigable: true,  window: ['06-01','08-31'], harvest: [],         growing: [4,5,6,7,8,9],   mulch: 'tree_strips' },
  kukurydza: { irrigable: true,  window: ['06-10','08-31'], harvest: [9,10,11],  growing: [5,6,7,8,9],     mulch: 'residue' },
  buraki:    { irrigable: true,  window: ['06-20','09-10'], harvest: [9,10,11],  growing: [4,5,6,7,8,9,10], mulch: 'residue' },
  zboza:     { irrigable: false,                            harvest: [7,8],      growing: [3,4,5,6,7],     mulch: 'residue' },
  rzepak:    { irrigable: false,                            harvest: [7,8],      growing: [3,4,5,6,7],     mulch: 'residue' },
  inna:      { irrigable: false,                            harvest: [],         growing: [4,5,6,7,8,9],   mulch: 'generic' },
};
```

- Okna nawadniania z tabeli 8 [E-poradnik s. 239]. Ziemniaki: wczesne 20 V–5 VII plus późne 10 VI–10 VIII, połączone. Kukurydza: tabela podaje 10 VI–31 VIII, tekst – od 3. dekady VI do początku IX [E-poradnik s. 230]. Sady: 1 VI–31 VIII (truskawki 5 V–25 VIII, jagodowe 15 V–15 VIII – jeśli kiedyś rozdzielicie owoce).
- **Zboża:** z wyjątkiem kukurydzy w Polsce się ich nie nawadnia [E-poradnik s. 229]. **Rzepak:** obecnie nienawadniany [E-poradnik s. 234].
- **Północ i północny wschód:** okna zaczynające się w kwietniu lub do 5 V przesuń o ok. 10 dni, w 2.–3. dekadzie maja o ok. 5 dni; od 25 V bez zmian [E-poradnik s. 239]. Heurystyka `latitude >= 53.0` do potwierdzenia (lepiej po województwie).
- `harvest` to przybliżenie – do potwierdzenia przez agronoma.

---

## 5. Porady

`priority`: mniejszy = ważniejszy. `term`: `now` = „Zrób teraz”, `week` = „W tym tygodniu”, `season` = „W tym sezonie”.

### 5.1. `flood` – Przygotuj pole na wysoką wodę

- **Warunek:** ≥ 1 stacja w stanie ostrzegawczym lub alarmowym po filtrze: `distanceKm <= 15` (DO KALIBRACJI) i, jeśli wiadomo, ta sama rzeka lub zlewnia. Gdy po filtrze nie ma stacji, użyj najbliższej z `confidence: 'low'`.
- **Priorytet / termin:** 1 / `now`.
- **Szablon (naprawia dwa błędy):** usuń prefiks „Wodowskaz” z nazwy stacji; przy alarmie podawaj próg **alarmowy**, przy ostrzeżeniu – ostrzegawczy.
- **Dopisz:** „Wywieź z terenów zalewowych obornik, nawozy i środki ochrony roślin, przestaw maszyny wyżej. Sprawdź na mapach zagrożenia powodziowego, czy działka leży w strefie zalewowej.” [Pobór wód]
- **Na przyszłość:** zasięg zalania pola można potwierdzić radarem Sentinel-1, także przez chmury [PAK s. 316, 326].

### 5.2. `gates-close` – Zamknij zastawki na rowach

- **Warunek:** werdykt ∈ `DEF` ∪ `WATCH`.
- **Priorytet / termin:**

| Werdykt | Priorytet | Termin |
| --- | --- | --- |
| `deficit-high`, `drought-high-water` | 2 | `now` |
| `deficit` | 3 | `now` |
| `deficit-watch` | 3 | `week` |

- **Treść:** „Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką.” Uzasadnienie: piętrzenie w rowach działa 2 tygodnie–1 miesiąc; wody z marca nie da się utrzymać do lata, gdy susza trwa od IV–V; w głębokiej suszy rowy są suche [MRiRW].
- **Przy `deficit-watch`:** „Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie.”
- **Przy `drought-high-water`:** „Obserwuj stan rzeki – przy dalszym wzroście bądź gotów otworzyć zastawki” [E-poradnik s. 119, 125].
- **W miesiącach `spring`:** „Wczesna wiosna to najlepszy moment – zatrzymaj wody roztopowe.”
- **Dopisek prawny:** §7.

### 5.3. `gates-spring` – NOWA: Zamknij zastawki po roztopach

- **Warunek:** miesiąc ∈ {2, 3, 4}, brak stanu alarmowego, werdykt ∉ `DEF` ∪ `WATCH`.
- **Priorytet / termin:** 3 / `week`.
- **Treść:** „Zamknij zastawki zaraz po roztopach i wiosennym odwodnieniu pola. Woda roztopowa to najtańszy zapas na wiosnę – jej całkowite odprowadzenie to marnotrawstwo” [MRiRW].
- Gdy `winterPrecipAnomalyPct <= -20`: „Po bezśnieżnej zimie zamiast odwadniać rozważ wiosenne nawodnienie podsiąkowe, jeśli masz taki system” [E-poradnik s. 125].

### 5.4. `gates-hold` – Zatrzymaj nadwyżkę wody na polu

- **Warunek:** werdykt ∉ `DEF` ∪ `WATCH`, brak ostrzeżenia i alarmu, gleba `wet` lub anomalia bilansu ≥ +20 mm.
- **Pomiń, gdy:** `gates-spring` jest aktywne (jego uzasadnienie liczbowe przejmuje `gates-spring`) albo miesiąc ∈ `harvest` uprawy. Na użytkach zielonych zastawki otwiera się ok. 2 tygodnie przed zbiorem [E-poradnik s. 125].
- **Wariant ozimin** (`isWinterCrop` i miesiąc ∈ IX–III): „Zatrzymuj wodę w rowach, ale nie dopuść, żeby woda stała przy korzeniach oziminy. Przy zastoiskach uchyl zastawkę.” Jesienią nadmierne uwilgotnienie można dopuścić tylko na polach bez ozimin [MRiRW].
- **Priorytet / termin:** 3 / `week`.

### 5.5. `irrigation` – Nawadniaj w chłodnych godzinach

```ts
const c = CROPS[crop];
const inWindow = c.irrigable && isWithin(date, shiftNorth(c.window, latitude));
const soilDeficit = soil.status === 'dry'
  || (soil.smi != null && soil.smi < 0.5)                       // ~połowa wody łatwo dostępnej [E-poradnik s. 255]
  || (soilDrop && (balanceAnomaly ?? -Infinity) <= BALANCE.deficit1)
  || (ndwi != null && ndwi < 0.2 && ndviUsable);                // „bardzo sucho” wg NDWI [PAK s. 92], tylko jako wzmocnienie
const trigger = inWindow && soil.status !== 'wet' && soilDeficit;
```

- Dni bez deszczu **nie są warunkiem**, tylko drugim zdaniem uzasadnienia. Termin nawadniania wyznacza się z bilansu lub wilgotności gleby [MRiRW; E-poradnik s. 251, 255].
- **Priorytet:** 2. **Termin:** `now` przy `deficit-high` i `drought-high-water`, inaczej `week`.
- **Treść:** „Jeśli masz ujęcie z pozwoleniem wodnoprawnym i instalację, nawadniaj rano lub wieczorem [Dobre praktyki]. Nie deszczuj przy wietrze powyżej 4 m/s [E-poradnik s. 258]. Przerwij po opadzie powyżej 25–30 mm [E-poradnik s. 251]. Nawadniaj do polowej pojemności, nie do zastoisk – nadmiar wymywa nawozy [MRiRW].”

### 5.6. `forecast-dry` – Nie czekaj na deszcz

- **Warunek:** prognoza 7 dni (opad − ET0) ≤ próg i gleba nie `wet`. Progi: `{ vegetation: -15, other: -5 }` mm/7 dni (DO KALIBRACJI). Latem tygodniowe parowanie to ok. 25 mm [MRiRW], a prognozy opadów są najmniej sprawdzalne [E-poradnik s. 60].
- **Priorytet:** 3 przy `DEF` ∪ `WATCH`, inaczej 4. **Termin:** `now` tylko przy `DEF`, inaczej `week`.
- Gdy aktywne jest `irrigation`: nie pokazuj, a zdanie o prognozie dopisz do uzasadnienia `irrigation`.

### 5.7. `heavy-machinery` – Odłóż wjazd ciężkim sprzętem

- **Warunek:** gleba `wet`. **Priorytet:** 3 w miesiącach `harvest`, inaczej 4. **Termin:** `week`.
- Kierunek zgodny ze źródłami (zagęszczanie gleby przez maszyny [E-poradnik s. 103], obniżanie wilgotności na czas koszenia [E-poradnik s. 232]). Progu liczbowego źródła nie podają.

### 5.8. `field-check` – Obejrzyj rośliny na polu

- **Warunek:** sezon wegetacyjny, `ndviUsable` i (`vegAnomaly` lub `vegWeak`).
- **Priorytet / termin:** 3 przy `DEF` ∪ `WATCH`, inaczej 4 / `week`.
- **Uzasadnienie – wybierz jeden wariant:**
  - Anomalia: „Zieleń roślin (NDVI 0,45) jest wyraźnie niższa niż zwykle o tej porze na tej działce.”
  - Rok do roku: „NDVI spadło z 0,60 rok temu do 0,45.” Dopisz: „Jeśli rok temu rosła tu inna uprawa, porównanie może mylić.”
  - Susza fizjologiczna: „Rośliny tracą wodę (NDWI 0,25 przy NDVI 0,45) – sprawdź, czy liście więdną.”
  - Słaba kondycja: „NDVI 0,25 to słaba kondycja roślin (0,2–0,4)” [PAK s. 293].
- Porada nie może być podstawą do nawadniania – ocena wzrokowa bywa myląca [MRiRW].

### 5.9. `crop` – ściółkowanie / resztki wg uprawy

- **Warunek:** werdykt ∈ `DEF` ∪ `WATCH` lub gleba `dry`, oraz istnieje wariant dla danego miesiąca.
- **Priorytet / termin:** 4 / `season` (wariant „przed zbiorem”: 5 / `season`). **Przypięta** – nie wypada przez limit (§6.3).

| `mulch` | Miesiące | Porada |
| --- | --- | --- |
| `rows` | `growing` | Okryj glebę między rzędami [E-poradnik s. 101] |
| `tree_strips` | cały rok | Wyściółkuj pasy pod drzewami [MRiRW] |
| `residue` | `harvest` | Zostaw resztki roślin na polu [MRiRW; E-poradnik s. 100] |
| `residue` | `growing` przed `harvest` | Po zbiorze zostaw resztki na polu i wysiej międzyplon |
| `generic` | `growing` | Nie zostawiaj gleby odkrytej – mulcz lub okrywa ogranicza parowanie |
| pozostałe | – | brak (działa `cover-crop`) |

### 5.10. `cover-crop` – okrywa roślinna

- **Warunek:** miesiąc ∈ VIII–II, **niezależnie od deficytu**. Okrywa poprawia retencję i ogranicza parowanie [E-poradnik s. 101, 112].
- **Priorytet / termin:** 5 / `season`.
- **Treść wg miesiąca:**
  - VIII–IX: „Po zbiorze wysiej międzyplon lub mieszankę okrywową” [E-poradnik s. 112].
  - X–I: „Zostaw okrywę roślinną na zimę.”
  - II: „Nie zaoruj okrywy przed wiosną.”
- Na piaskach dopisz: „Unikaj orki zimowej – skiby zwiększają parowanie” [MRiRW].

### 5.11. `dry-spell-watch` – NOWA: Obserwuj glebę

- **Warunek:** werdykt `stable`, sezon wegetacyjny, ≥ 10 dni bez deszczu, gleba nie `wet`, `irrigation` nieaktywne.
- **Priorytet / termin:** 5 / `week`.
- **Treść:** „Od X dni nie padało więcej niż 1 mm. Sprawdź glebę łopatą na głębokości korzeni – po krótkim deszczu wierzch bywa wilgotny, a 5 cm niżej sucho” [MRiRW].

### 5.12. `tillage` – Ogranicz uprawę gleby

- Warunek bez zmian (gleba `dry`). Priorytet 3, termin `week`.
- Dopisek: „Na glebach ciężkich z podeszwą płużną rozważ jesienią głęboszowanie, gdy gleba nie jest przesuszona ani mokra” [E-poradnik s. 102–104].

### 5.13. `gates-ready` – Sprawdź zastawki i rowy

- Zawsze. Priorytet 5 w miesiącach III, IV, IX i X (konserwacja wiosną i jesienią [E-poradnik s. 155]), w pozostałych 6. Termin `season`.
- Dopisek prawny: §7.

### 5.14. `humus` – Dbaj o próchnicę

- Bez zmian. Priorytet 7, termin `season`.

---

## 6. Składanie listy porad

### 6.1. Blokady

| Gdy | Usuń |
| --- | --- |
| gleba `wet` | `irrigation`, `forecast-dry`, `dry-spell-watch` |
| `irrigation` aktywne | `forecast-dry` (zdanie przenieś do uzasadnienia), `dry-spell-watch` |
| `gates-spring` aktywne | `gates-hold` |
| werdykt ∈ `DEF` ∪ `WATCH` | `gates-spring`, `gates-hold` |
| stan alarmowy | `gates-spring`, `gates-hold`, `gates-close` |

### 6.2. Sortowanie

```ts
const TERM_RANK = { now: 0, week: 1, season: 2 };
advice.sort((a, b) =>
  a.priority - b.priority || TERM_RANK[a.term] - TERM_RANK[b.term] || ID_ORDER.indexOf(a.id) - ID_ORDER.indexOf(b.id));
```

### 6.3. Limit 5 z przypiętą poradą dla uprawy

```ts
let top = advice.slice(0, 5);
const crop = advice.find(a => a.id === 'crop');
if (crop && !top.includes(crop)) top[top.length - 1] = crop;
const dropped = advice.filter(a => !top.includes(a));
```

---

## 7. Prawo wodne – teksty obowiązkowe

| Gdzie | Tekst | Podstawa |
| --- | --- | --- |
| `irrigation` | „Nawadniaj tylko z ujęcia objętego pozwoleniem wodnoprawnym.” | Pobór wód to usługa wodna; nawadnianie powyżej średnio 5 m³/dobę to szczególne korzystanie z wód. Oba wymagają pozwolenia przed rozpoczęciem (art. 34 pkt 12, art. 35 ust. 3 pkt 1 Prawa wodnego) [Pobór wód] |
| `irrigation` (więcej informacji) | „Bezpłatny limit 5 m³/dobę nie obejmuje nawadniania pól. 1 mm wody na 1 ha to 10 m³.” | [MRiRW] |
| `gates-close`, `gates-spring`, `gates-hold` | „Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich.” | [Melioracje PW; Pobór wód]. Broszura z 2020 r. opisuje zniesienie pozwolenia na samo piętrzenie w rowie jako „przewidziane”; pozwolenie na budowę urządzeń zostaje [MRiRW] – **stan prawny do potwierdzenia** |
| `gates-close` (opcjonalnie) | „Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący.” | Opisany jako niewymagający pozwolenia na budowę urządzenia [MRiRW] |
| `gates-ready` | „Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich.” | Opłata legalizacyjna 5720,17 zł (2024); bez wniosku – decyzja o likwidacji i kara [Legalizacja] |
| `gates-ready` | „Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej.” | [Melioracje PW] |
| `flood` | „Wywieź z terenu zalewowego obornik, nawozy i środki ochrony roślin.” | Na obszarach szczególnego zagrożenia powodzią gromadzenie tych materiałów wymaga pozwolenia [Pobór wód] |

Nie wskazuj programów dopłat bez sprawdzenia – broszura MRiRW opisuje PROW 2014–2020.

---

## 8. Fixture'y i oczekiwane wyniki

### 8.1. Zmiany w fixture'ach S01–S21

Dodaj `date` (15. dzień miesiąca) i `waterBalanceAnomalyMm`. SPI, normy wilgotności, NDWI i normy NDVI zostaw `null` – testują fallbacki. Wyjątek: S29.

| ID | Mies. | Uprawa | Anomalia bilansu | Uwagi |
| --- | --- | --- | --- | --- |
| S01 | VII | zboża | 0 | |
| S02 | XI | zboża | 0 | |
| S03 | III | zboża | 0 | |
| S04 | VII | ziemniaki | −45 | |
| S05 | V | rzepak | −15 | |
| S06 | I | sad | −15 | |
| S07 | VIII | kukurydza | 0 | |
| S08 | VI | zboża | 0 | prognoza −10 |
| S09 | X | zboża (ozime) | +30 | |
| S10 | IV | kukurydza | +45 | alarm |
| S11 | II | buraki | +35 | `riverCatchmentKm2: 5000` |
| S12 | VIII | zboża | −40 | ostrzeżenie |
| S13 | VI | warzywa | 0 | |
| S14 | VI | zboża | 0 | |
| S15 | VII | zboża | −15 | |
| S16 | XI | zboża | 0 | |
| S17 | VI | inna | −20 | |
| S18 | V | zboża | null | hydro = null |
| S19 | VI | buraki | −15 | 15 VI = przed oknem buraków (20 VI) |
| S20 | VII | zboża | −14 | tuż nad progiem |
| S21 | VII | zboża | −40 | dokładnie na progach |

### 8.2. Oczekiwane wyniki S01–S21

Kolumna „Sygnały”: M = meteo, G = gleba, R = roślinność; `d` = punkty deficytu, `s` = nadwyżki.

| ID | Sygnały / punkty | Etap | Werdykt | Porady (top 5, w kolejności) | Zmiana vs obecny raport |
| --- | --- | --- | --- | --- | --- |
| S01 | – | 0 | `stable` | gates-ready, humus | – |
| S02 | – | 0 | `stable` | cover-crop, gates-ready, humus | – |
| S03 | – | 0 | `stable` | **gates-spring**, gates-ready (5), humus | porada wiosenna |
| S04 | M G R, d8 | 3 | `deficit-high` | gates-close, irrigation, tillage, field-check, **crop** („Okryj glebę między rzędami”) | forecast-dry scalone, crop nie wypada |
| S05 | M, d2 | 1 | **`deficit-watch`** | gates-close (`week`), crop „przed zbiorem”, gates-ready, humus | obserwacja zamiast niedoboru |
| S06 | M, d2 | 1 | **`deficit-watch`** | gates-close (`week`), crop (pasy pod drzewami), **cover-crop**, gates-ready, humus | okrywa także przy deficycie |
| S07 | d1 (dni bez deszczu) | 0 | **`stable`** | **dry-spell-watch**, cover-crop („Po zbiorze…”), gates-ready, humus | bez werdyktu niedoboru |
| S08 | – | 0 | `stable` | gates-ready, humus | forecast-dry nie działa przy −10 |
| S09 | s3 | 0 | `wet` | gates-hold (**wariant ozimin**), heavy-machinery, cover-crop, gates-ready (5), humus | tekst dla ozimin |
| S10 | s5 + alarm | – | `flood` | flood (próg alarmowy w tekście), heavy-machinery, gates-ready (5), humus | błędy tekstu |
| S11 | s4 | 0 | **`wet` (intense)** | **gates-spring**, heavy-machinery, cover-crop („Nie zaoruj”), gates-ready, humus | nie `flood` |
| S12 | M G, d6 + ostrzeżenie | 2 | **`drought-high-water`** | flood, gates-close (+rzeka), tillage, **crop** („Zostaw resztki”), cover-crop | bez nawadniania zbóż |
| S13 | d1 (dni), s1 | 0 | `stable` | gates-hold, heavy-machinery, gates-ready, humus | **bez nawadniania** |
| S14 | R słaba (0,25 < 0,4) | 0 | `stable` | field-check (4), gates-ready, humus | – |
| S15 | M R, d2 | 2 | `deficit` | gates-close, field-check, crop („Zostaw resztki”), gates-ready, humus | field-check z dopiskiem o płodozmianie |
| S16 | – | 0 | `stable` | cover-crop, gates-ready, humus | – |
| S17 | M, d2 | 1 | **`deficit-watch`** | gates-close (`week`), **crop generic**, gates-ready, humus | obserwacja + porada dla „innej uprawy” |
| S18 | M, d1, low | 1 | **`deficit-watch`** „(ocena wstępna)” | gates-close (`week`), crop „przed zbiorem”, gates-ready, humus | niższa pilność |
| S19 | M G, d2 | 2 | `deficit` | gates-close, crop „przed zbiorem”, gates-ready, humus | brak „Zostaw resztki” w czerwcu |
| S20 | – | 0 | `stable` | gates-ready, humus | – |
| S21 | M, d4 | 1 | **`deficit-watch`** | gates-close (`week`), crop („Zostaw resztki”), gates-ready, humus | **bez nawadniania zbóż**; progi zadziałały (d4), ale bez sygnału z gleby to obserwacja |

### 8.3. Nowe scenariusze S22–S30

| ID | Wejście | Werdykt | Asercje |
| --- | --- | --- | --- |
| S22 Mokro po roztopach | 15 III, zboża, opady +25%, anomalia +25, gleba 33% | `wet` | `gates-spring` 1.; brak `flood` i `gates-hold`; heavy-machinery; gates-ready prio 5 |
| S23 Przeciętny lipiec | 15 VII, zboża, bilans −35 przy normie −30 (anomalia −5), opady 0%, gleba 22% | `stable` | bilans bezwzględny nie daje punktów |
| S24 Susza po żniwach | 15 VIII, zboża, opady −30%, 14 dni, anomalia −30, gleba 12% | `deficit-high` | brak `irrigation`; `crop` = „Zostaw resztki”; tillage; cover-crop |
| S25 Susza w kukurydzy | 15 VII, kukurydza, opady −30%, 12 dni, anomalia −30, gleba 12%, prognoza −20 | `deficit-high` | `irrigation` z dopiskiem prawnym i o wietrze; brak `forecast-dry`; crop „przed zbiorem” w top 5 |
| S26 Mokra jesień, ozimina | 15 X, zboża, `isWinterCrop: true`, opady +30%, anomalia +25, gleba 34% | `wet` | `gates-hold` w wariancie ozimin; kontrola z `isWinterCrop: false` → wariant standardowy |
| S27 Alarm + susza | 15 VII, ziemniaki, alarm, opady −40%, anomalia −45, gleba 12% | `flood` | `flood` 1.; brak `gates-close`; `irrigation` obecne (`week`) |
| S28 Te same 22%, różne gleby | 15 VI, zboża; A: `sand`, B: `clay` | A `stable`, B `deficit` | A: gleba `wet`, heavy-machinery; B: gleba `dry`, tillage. Bez tekstury: `moderate` i zdanie o orientacyjnych progach |
| S29 Susza fizjologiczna | 15 VII, zboża, anomalia −20, gleba 22%, NDVI 0,45, **NDWI 0,25**, scena 3 dni, 90% czysta | `deficit` (M + R, etap 2) | field-check z wariantem „Rośliny tracą wodę (NDWI…)”; brak `irrigation` (zboża) |
| S30 Mała rzeka i stara scena | 15 VI, warzywa, trend rzeki −30% przy `riverCatchmentKm2: 300`, scena sprzed 14 dni, NDVI 0,2 | `stable` | rzeka bez punktów; NDVI pominięte, w raporcie „Brak aktualnej, bezchmurnej sceny” |

### 8.4. Kryteria akceptacji

- [ ] `npm run advice:matrix` generuje plik z S01–S30 bez błędów.
- [ ] Żadne `irrigation` dla `zboża`, `rzepak` i `inna`; żadne przy glebie `wet`.
- [ ] Każde `irrigation` zawiera zdanie o pozwoleniu wodnoprawnym.
- [ ] Każde `gates-close`, `gates-spring` i `gates-hold` zawiera dopisek o legalnych urządzeniach.
- [ ] Werdykt `flood` tylko przy stanie ostrzegawczym lub alarmowym; przy alarmie zawsze `flood`.
- [ ] Sam deficyt opadów lub bilansu (bez sygnału z gleby i roślin) daje co najwyżej `deficit-watch`.
- [ ] Same dni bez deszczu nigdy nie zmieniają werdyktu.
- [ ] Brak ciągu „Wodowskaz Wodowskaz”; przy alarmie podany próg alarmowy.
- [ ] `crop` nigdy nie wypada przez limit 5.
- [ ] Marzec ma co najmniej jedną poradę sezonową.
- [ ] NDVI ze sceny starszej niż `SCENE.maxAgeDays` albo z udziałem czystych pikseli poniżej `SCENE.minClearPct` nie daje punktów.
- [ ] Trend rzeki dla zlewni < `RIVER.minCatchmentKm2` nie daje punktów.
- [ ] Wszystkie progi są w jednym pliku konfiguracyjnym, a sekcja „1. Reguły” w raporcie czyta je stamtąd.

---

## 9. Nowa lista „Miejsca do szczególnej weryfikacji” w generatorze

- Progi anomalii bilansu (−15 / −40 / +20 mm) – kalibracja na latach 2015, 2018, 2019.
- Fallback opadów −20% jest czulszy niż standard EDO (SPI-3 < −1 lub SPI-1 < −2).
- PTW i PPW wg uziarnienia oraz progi SMI 0,4 (gleba sucha) i 0,5 (nawadnianie) – potrzebny gleboznawca.
- Odstępstwo od CDI: deficyt opadów + spadek NDVI to tu „Ostrzeżenie”, a nie „Alarm”.
- Progi NDVI 0,4 i NDWI 0,3 / 0,2 pochodzą z literatury ogólnej, przytaczanej w podręczniku PAK, a nie z kalibracji dla polskich upraw; zależą od fazy rozwoju.
- Porównanie NDVI rok do roku a płodozmian.
- Progi jakości sceny (10 dni, 70% czystych pikseli) i próg zlewni 2000 km² dla GloFAS.
- `harvest` upraw i heurystyka północy (`latitude >= 53.0`).
- Promień filtra stacji wodowskazowych (15 km).
- Stan prawny piętrzenia wody w rowach melioracyjnych.
- Bezpieczeństwo zamykania zastawek przy wysokiej rzece i suchym polu.

---

## 10. Przydatne serwisy do porównań i walidacji

- **esusza.pl** – serwis monitoringu suszy z danych satelitarnych (IGiK, WIND-HYDRO), działa od czerwca 2020 [PAK s. 289].
- **EDO** (Europejskie Obserwatorium Suszy) – SPI, SMA, ΔFAPAR i CDI; dobry punkt odniesienia dla etapów z §3.1 [PAK s. 287–290].
- **SMSR IUNG-PIB** (susza.iung.pulawy.pl) – KBW wg upraw i gleb; podręcznik PAK zapowiadał dołączenie danych Sentinel-1/-2 w latach 2021–2022 [PAK s. 291; E-poradnik s. 66].
- **IMGW-PIB agrometeo** – wskaźnik wilgotności gleby 0–100% dla powiatu [E-poradnik s. 62].
- **EFAS** – prognozy powodziowe dla zlewni > 2000 km²; pełne produkty tylko dla zarejestrowanych użytkowników [PAK s. 311–316].

---

## 11. Źródła

- **[E-poradnik]** Kaca E. (red.), *E-Poradnik. Melioracje, retencja i gospodarka wodna w rolnictwie*, CDR Brwinów 2025 (strony wg numeracji drukowanej).
- **[MRiRW]** Dobrzyńska N., Dembek W. (red.), *Gospodarowanie wodą w rolnictwie w obliczu susz*, MRiRW (konferencja Puławy, 5.03.2020).
- **[PAK]** Hejmanowska B., Wężyk P. (red.), *Dane satelitarne dla administracji publicznej*, Polska Agencja Kosmiczna 2020 (strony wg numeracji drukowanej). Wykorzystane: rozdz. 2.2 (wskaźniki NDVI, SAVI, NDWI, NDDI), 3.1 (Sentinel-2: rewizyta, SCL), 6.3.3 (EDO: SPI, SMA, ΔFAPAR, CDI), 6.3.4 (klasy NDVI, wskaźniki wody w roślinach), 6.5 (EFAS, GloFAS, radar a powodzie).
- **[Pobór wód]** Wody Polskie, *Pobór wód na potrzeby prowadzenia działalności rolniczej*, 12.03.2025.
- **[Melioracje PW]** Wody Polskie, *Melioracje wodne w ustawie Prawo wodne. Poradnik*, 11.03.2025.
- **[Legalizacja]** Wody Polskie, *Korzystaj z wód legalnie i odpowiedzialnie*, 11.03.2025.
- **[Dobre praktyki]** Wody Polskie, *Dobre praktyki – Jak każdy z nas może przyczynić się do oszczędzania wody*, 11.03.2025.
