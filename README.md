# HackNation-2026-proj2

Wstępny szkic projektu dla HackNation 2026.

## Uruchomienie

```bash
npm install
npm run dev
```

Po uruchomieniu aplikacja będzie dostępna pod adresem http://localhost:3000.

## Struktura

- `apps/web` — frontend Next.js i endpointy aplikacji;
- `package.json` — skrypty uruchamiające workspace przez npm.

## Weryfikacja

```bash
curl http://localhost:3000/api/health
```

Oczekiwana odpowiedź: `{"status":"ok"}`

### Moduł meteorologiczny

Frontend ma formularz współrzędnych i daty. Dane pobiera endpoint `POST /api/weather`.

```bash
curl -X POST http://localhost:3000/api/weather \
  -H 'Content-Type: application/json' \
  -d '{"latitude":52.23,"longitude":21.01,"date":"2026-11-21"}'
```

Odpowiedź zawiera bieżące wskaźniki 30-dniowe oraz `historicalSummary`:
porównanie opadów i temperatury z dziesięcioletnim okresem historycznym.
Gdy dostawca archiwum zwróci limit lub awarię, moduł wyświetla jawny status
`unavailable` i nie prezentuje danych jako dostępnych.

### Moduł satelitarny Sentinel-2

Dane satelitarne pobiera endpoint `POST /api/satellite`. Po wskazaniu działki
aplikacja wyszukuje w katalogu Earth Search obserwacje Sentinel-2 L2A z ostatnich
90 dni, wybierając scenę o chmurach poniżej 20% i wyliczając wynik tylko dla
pikseli znajdujących się wewnątrz granicy działki.

#### Z czego odczytywany jest NDVI

NDVI (Normalized Difference Vegetation Index) to wskaźnik stanu zielonej
biomasy roślin. Odczytywany jest z dwóch pasm obserwacji Sentinel-2:

- pasma czerwieni **B04** — około 665 nm,
- bliskiej podczerwieni **B08** — około 842 nm.

Rośliny silnie odbijają promieniowanie bliskiej podczerwieni i pochłaniają
czerwień, więc wysoka różnica między tymi pasmami oznacza zazwyczaj intensywne
zielone pokrycie roślin. Sentinel-2 dane z Earth Search ma rozdzielczość 10 m
Dla pasm B04 i B08 Earth Search udostępnia dane Sentinel-2 o rozdzielczości 10 m.

Surową wartość piksela przekształcamy zgodnie z metadanymi Earth Search:

```text
odbicie = surowa_wartość × 0.0001 - 0.1
```

Następnie obliczamy NDVI dla każdego poprawnego piksela działki:

```text
NDVI = (NIR - RED) / (NIR + RED)
```

gdzie `NIR` to odbicie pasma B08, a `RED` odbicie pasma B04. Wynik końcowy jest
średnią arytmetyczną NDVI dla wszystkich ważnych pikseli działki
(bez pikseli poza działką, zerowych i niemożliwych do prawidłowej interpretacji).
Wartość teoretycznie mieści się w przedziale od -1 do 1:

- poniżej 0 — dominują powierzchnie nie roślinne, np. gleba, woda lub zabudowa;
- około 0–0,3 — słaba, rzadka lub stresowana roślinność;
- około 0,3–0,6 — umiarkowane pokrycie roślinne;
- powyżej 0,6 — silne, intensywne zielone pokrycie roślin.

Te zakresy są orientacyjne i zależą od terminu obserwacji, rodzaju uprawy,
stadium wegetacji i składu powierzchni działki.

#### Porównanie rok do roku

Aplikacja pobiera osobno bieżącą scenę z ostatnich 90 dni oraz scenę z
analogicznego, przesuniętego o jeden rok okresu 90 dni. Oblicza dla nich NDVI
oddzielnie i przedstawia różnicę:

```text
różnica = NDVI bieżące - NDVI rok temu
```

Użytkownik widzi miniatury obrazu prawdziwokolorowego dla obu okresów
(wycięte i zamaskowane do granicy działki), datę obserwacji, udział chmur,
pokrycie działki i wartości NDVI. Maska działki jest wykonywana po
przekształceniu współrzędnych granicy do układu projekcyjnego Sentinel-2,
dzięki czemu kolorowe piksele poza działką nie są uwzględniane.

#### Wybrana uprawa i interpretacja

Rolnik wybiera aktualną uprawę z listy. Zakres uprawy jest przekazywany do
tekstu interpretacji i pozwala prezentować wynik w kontekście zbóż, rzepaku,
ziemniaków, buraków, kukurydzy, sadów, warzyw lub innej uprawy. W obecnej
wersji ten wybór nie zmienia jeszcze samego obliczenia NDVI — opisuje on
konieczność interpretowania wyniku zgodnie ze specyfiką roślinności i jej fazą
wegetacji.

#### Ograniczenia

NDVI nie jest pomiarem wilgotności gleby ani jednoznacznym wskaźnikiem suszy.
Wysokie lub niskie NDVI może wynikać również z odmiany uprawy, terminu siewu,
plonu, chorób, zbioru, gleby, gołego pola, zacienienia lub chmur.
Interpretacja opiera się na połączeniu danych satelitarnych z meteo, natomiast
aplikacja nie posiada jeszcze pełnych danych o glebie i ukształtowaniu terenu.
Gdy nie ma jakościowej sceny, brak danych i chmury są komunikowane wprost —
nie wyświetlany jest pozornie precyzyjny wynik.
