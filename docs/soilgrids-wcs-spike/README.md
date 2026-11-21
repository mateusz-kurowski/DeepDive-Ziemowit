# Test WCS SoilGrids — uziarnienie

**Data testu:** 21.11.2026  
**Cel:** sprawdzić, czy aplikacja może pobrać wartości piasku, pyłu i iłu dla niewielkiego obszaru w Polsce przez WCS.

## Wynik w skrócie

**WCS działa dla tego przypadku.** Pobrano metadane oraz próbki rastrów piasku, pyłu i iłu. Następnie wykonano 90 zapytań `GetCoverage`: pięć punktów/działek × trzy właściwości × trzy głębokości × dwa statystyki (`mean`, `Q0.5`).

W trzech lokalizacjach z wartościami glebowymi suma `mean` wyniosła **1000–1001 g/kg** dla wszystkich badanych głębokości. Suma `Q0.5` w tych samych próbkach wyniosła **770–971 g/kg**. Dwa punkty miejskie zwróciły same zera bez tagu NoData. `mean` jest obiecującym formatem do wyświetlania udziałów frakcji, ale zachowanie zer i wyniki trzeba jeszcze porównać z niezależnym źródłem.

Pełna tabela i surowe wyniki: [CSV](soil-validation.csv) i [JSON](soil-validation.json). Test można odtworzyć skryptem [validate-soil-samples.mjs](validate-soil-samples.mjs).

## Walidacja pięciu punktów/działek

Koordynaty sprawdzono przez ULDK; tabela zawiera identyfikatory zwrócone dla punktów testowych. Sumy podano kolejno dla głębokości `0-5`, `5-15`, `15-30 cm`.

| Lokalizacja testowa | Identyfikator ULDK | Jednostka z ULDK | Suma `mean` (g/kg) | Suma `Q0.5` (g/kg) | Wynik zerowy |
|---|---|---|---:|---:|---|
| Krośniewice, centrum | `100204_5.0013.39` | Krośniewice | 1000, 1000, 1000 | 970, 971, 962 | nie |
| Ryki, wschód | `061604_5.0026.82` | Ryki | 1000, 1001, 1000 | 770, 823, 808 | nie |
| Warszawa, centrum | `146510_8.0502.1/3` | Dzielnica Śródmieście | 0, 0, 0 | 0, 0, 0 | tak |
| Choroszcz, Podlaskie | `200201_5.0019.257/1` | Choroszcz | 1000, 1000, 1000 | 940, 946, 926 | nie |
| Opole, centrum | `166101_1.0118.247` | Opole (miasto) | 0, 0, 0 | 0, 0, 0 | tak |

Wartości zerowe z Warszawy i Opola nie mają w zwróconym GeoTIFF jawnego tagu NoData. Traktujemy je jako **nierozstrzygnięte/brakujące**, nie jako skład gleby równy 0%. Nie należy na ich podstawie klasyfikować uziarnienia.

## Jak wykonano test

### Usługi i warstwy

WCS ma osobną usługę dla każdej właściwości:

- [piasek — GetCapabilities](https://maps.isric.org/mapserv?map=/map/sand.map&SERVICE=WCS&VERSION=2.0.0&REQUEST=GetCapabilities)
- [pył — GetCapabilities](https://maps.isric.org/mapserv?map=/map/silt.map&SERVICE=WCS&VERSION=2.0.0&REQUEST=GetCapabilities)
- [ił — GetCapabilities](https://maps.isric.org/mapserv?map=/map/clay.map&SERVICE=WCS&VERSION=2.0.0&REQUEST=GetCapabilities)

Każda usługa zwróciła warstwy dla sześciu głębokości i predykcji `Q0.05`, `Q0.5`, `Q0.95`, `mean` oraz `uncertainty`. Warstwy testowane w tym spiku to `sand_0-5cm_Q0.5`, `silt_0-5cm_Q0.5`, `clay_0-5cm_Q0.5` oraz odpowiadające im `*_mean`.

Pliki odpowiedzi są zachowane w tym folderze: [sand capabilities](sand-capabilities.xml), [silt capabilities](silt-capabilities.xml), [clay capabilities](clay-capabilities.xml) i [opis pokrycia sand](sand-coverage-description.xml).

### Przestrzenny wycinek testowy

Pobrano 2×2 piksele dla obwiedni WGS84:

- `Lat(52.248,52.252)`
- `Long(19.248,19.252)`
- `SUBSETTINGCRS=EPSG:4326`
- `OUTPUTCRS=EPSG:4326`
- `FORMAT=GEOTIFF_INT16`

Serwer zaakceptował osie `Lat` i `Long` oraz zwrócił GeoTIFF. Raster zawierał 2 kolumny i 2 wiersze; piksel w lewym górnym rogu ma środek około **19.249°E, 52.251°N**. Wycinki są małe i dostępne jako pliki: [sand mean](sand-0-5-lowicz-mean.tif), [silt mean](silt-0-5-lowicz-mean.tif), [clay mean](clay-0-5-lowicz-mean.tif), [sand Q0.5](sand-0-5-lowicz.tif), [silt Q0.5](silt-0-5-lowicz.tif), [clay Q0.5](clay-0-5-lowicz.tif).

Przykładowe żądanie `GetCoverage` dla średniej piasku:

```text
https://maps.isric.org/mapserv?map=/map/sand.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=sand_0-5cm_mean&FORMAT=GEOTIFF_INT16&SUBSET=Lat(52.248,52.252)&SUBSET=Long(19.248,19.252)&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326
```

Porównawczy wycinek mediany z okolic Ułęża jest zapisany jako [sand](sand-0-5-ulez.tif), [silt](silt-0-5-ulez.tif) i [clay](clay-0-5-ulez.tif).

## Wyniki próbek

Wartości SoilGrids są w g/kg. Aby pokazać je jako procenty, dzielimy przez 10.

| Próbka: środek piksela | Predykcja | Piasek | Pył | Ił | Suma |
|---|---|---:|---:|---:|---:|
| okolice Łowicza, 19.249°E 52.251°N | `mean` | 736 g/kg (73.6%) | 185 g/kg (18.5%) | 79 g/kg (7.9%) | **1000 g/kg (100.0%)** |
| okolice Łowicza, ten sam piksel | `Q0.5` | 764 g/kg (76.4%) | 156 g/kg (15.6%) | 50 g/kg (5.0%) | **970 g/kg (97.0%)** |
| okolice Ułęża, piksel w lewym górnym rogu | `Q0.5` | 378 g/kg (37.8%) | 337 g/kg (33.7%) | 55 g/kg (5.5%) | **770 g/kg (77.0%)** |

Pełne tablice 2×2 dla Łowicza są w GeoTIFF-ach. Skrypt [inspect-geotiff.mjs](inspect-geotiff.mjs) wypisuje metadane rastra i odczytuje wartości, uwzględniając kompresję Deflate oraz predictor TIFF. Uruchomienie z katalogu repo:

```powershell
node docs/soilgrids-wcs-spike/inspect-geotiff.mjs docs/soilgrids-wcs-spike/sand-0-5-lowicz-mean.tif
```

## CRS i rozdzielczość

`DescribeCoverage` dla `sand_0-5cm_Q0.5` wskazuje natywny CRS **EPSG:152160**, osie `x y` i wektory siatki **250 m**. To jest rozdzielczość źródłowego produktu SoilGrids.

Przy pobieraniu przez `SUBSETTINGCRS=EPSG:4326` uzyskany GeoTIFF miał siatkę około `0.002° × 0.002°`. Po zażądaniu `OUTPUTCRS=EPSG:152160` georeferencja wycinka miała rozmiar piksela około `170 × 206 m`. To obserwacja z tego wycinka: odpowiedź jest przycięta i przeliczona do obwiedni żądania, więc rozmiaru piksela zwróconego pliku nie należy mylić z natywną dokładnością modelu 250 m. Wariant z `OUTPUTCRS=EPSG:152160` jest zachowany jako [GeoTIFF](sand-0-5-lowicz-native.tif).

Przy właściwej integracji należy opierać opis wyniku na **natywnej rozdzielczości modelu 250 m**. Warto przetestować pobieranie z obwiednią przeliczoną do EPSG:152160 i wyrównaną do siatki 250 m. Małe działki mogą mieścić się w jednym pikselu albo współdzielić piksel z sąsiednimi działkami.

## Co z tego wynika dla pierwszej wersji

1. Pobierać `sand`, `silt` i `clay` po stronie serwera; WCS dostarcza GeoTIFF, nie gotowe wartości JSON.
2. Dla wstępnego opisu uziarnienia użyć warstw `mean` i sześciu dostępnych głębokości. Najpierw pokazać profil warstw, a dopiero potem zdecydować o agregacji profilu do jednej wartości.
3. Zachować procenty frakcji, głębokości, nazwę warstwy, CRS, datę pobrania i rozdzielczość 250 m.
4. Nie wyprowadzać jeszcze polskiej klasy gleby ani podatności na suszę. Potrzebna jest osobna, zweryfikowana reguła klasyfikacji.
5. Dodać cache po komórce rastra, aby nie pobierać tych samych GeoTIFF-ów dla wielu działek leżących w jednym pikselu.

## Ograniczenia i nierozstrzygnięte punkty

- To krótki test tylko dla warstwy powierzchniowej `0-5cm` i dwóch małych obszarów; nie potwierdza kompletności danych dla całej Polski ani wszystkich głębokości.
- `Q0.5` nie daje w tych próbkach wektora frakcji sumującego się do 100%. `mean` z próbki Łowicza sumuje się do 100%; trzeba sprawdzić tę własność na większej liczbie punktów przed wyborem formatu raportu.
- Wstępny wycinek z obszaru miejskiego Warszawy [zwrócił same zera](sand-0-5-waraw.tif). GeoTIFF nie ujawnił tagu NoData, więc nie wiemy, czy zero oznacza prawidłową wartość, czy brak danych. W aplikacji nie należy jeszcze traktować go jako udziału gleby.
- SoilGrids to predykcja globalna, a nie pomiar na działce. Niepewność i rozdzielczość trzeba ujawnić użytkownikowi.
- Należy potwierdzić warunki cytowania i licencję CC BY 4.0 w dokumentacji aplikacji oraz sprawdzić zachowanie usługi i limity przed wdrożeniem.

## Źródła

- [SoilGrids — właściwości, rozdzielczość, niepewność i licencja](https://docs.isric.org/globaldata/soilgrids/)
- [SoilGrids WCS — GetCapabilities, DescribeCoverage i GetCoverage](https://docs.isric.org/globaldata/soilgrids/wcs.html)
- [Warstwy, jednostki i konwersja SoilGrids](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html)
