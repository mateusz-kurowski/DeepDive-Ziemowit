# KOWR — szkic produktu i architektura

**Status:** Wersja wstepna po publikacji pelnego zadania, 21.11.2026.

## 1. Cel konkursowy

Zbudowac prosty prototyp, ktory dla wskazanej działki ewidencyjnej albo lokalizacji na mapie:

1. pobiera dane meteorologiczne, satelitarne, glebowe i hydrologiczne;
2. oblicza aktualny stan sytuacji wodnej oraz historyczna podatność działki na niedobory;
3. identyfikuje przyczyny niedoboru wody;
4. proponuje konkretne działania retencyjne i agrotechniczne;
5. opcjonalnie wskazuje zasady nawadniania;
6. generuje czytelny raport z źródłami, datami, ograniczeniami i niepewnością.

Kluczowe kryterium: raport powinien być wynikiem obliczeń wykonanych dla wskazanej działki i daty. Wyświetlanie wcześniej przygotowanych rekomendacji nie spełnia wymagań zadania.

## 2. Problem i persona

**Problem:** rolnik zna swoje gospodarstwo, ale ogólnodostępne dane o pogodzie, glebie, roślinności i terenie są rozproszone i trudne do interpretacji.

**Persona:** rolnik prowadzący jedno lub kilka gospodarstw, bez znajomości GIS, nieposiadający specjalistycznego sprzętu i chcący szybko otrzymać praktyczną decyzję.

**Problem statement:** jak w czasie maksymalnie około 30 sekund przekształcić dane o działce w zrozumiałą ocenę sytuacji wodnej i uzasadniony plan działań?

## 3. Główna ścieżka użytkownika

1. Wybór działki po numerze ewidencyjnym albo kliknięcie lokalizacji na mapie.
2. Wybranie uprawy z ograniczonej, praktycznej listy.
3. Wybranie daty analizy, bieżącej albo historycznej z ostatnich 10 lat.
4. Uruchomienie analizy.
5. Odczytanie na jednym ekranie:
   - aktualnego i historycznego ryzyka niedoboru wody;
   - głównych przyczyn;
   - dwóch lub trzech priorytetowych działań;
   - źródeł i dat danych;
   - niepewności i braków danych.
6. Zapisanie, wydrukowanie lub eksport raportu do PDF.

## 4. Zakres Must / Should / Could

### Must

- działanie w przeglądarce bez instalowania dodatkowego oprogramowania;
- wybór działki po identyfikatorze lub lokalizacji;
- wybór uprawy i daty;
- obliczenie bieżącej i historycznej sytuacji wodnej;
- identyfikacja przyczyn niedoboru wody;
- rekomendacje retencyjne i agrotechniczne wynikające z analizy;
- źródła danych, daty pobrania i ograniczenia;
- komunikowanie braku danych;
- eksport lub druk raportu;
- działanie dla działek z dowolnego obszaru Polski;
- cache i stabilne działanie dla kilku działek testowych jury;
- publiczny link albo instrukcja uruchomienia;
- README z architekturą, licencjami i sposobem weryfikacji.

### Should

- rekomendacje nawadniania;
- porównanie kilku okresów;
- uproszczony wykres opadów i temperatury;
- mapa działki i otoczenia hydrologicznego;
- historia zapisanego raportu;
- tryb mobilny;
- raportowe uzasadnienie każdego wyniku.

### Could

- porównanie alternatywnych działań retencyjnych;
- eksport danych z raportu;
- plan 7-, 30- i 90-dniowy;
- integracja z systemami gospodarstwa;
- wielobytowa obsługa wielu działek.

### Won't have now

- pełne modelowanie hydrauliczne;
- dokładne zużycie wody dla konkretnego systemu nawadniania;
- certyfikowane zalecenia agronomiczne;
- duże operacje wieloużytkownikowe;
- wymaganie konta lub płatnej licencji.

## 5. Architektura referencyjna

```text
Rolnik / jury
  |
  v
Next.js
  - formularz działki, uprawy i daty
  - mapa i wynik
  - export PDF
  |
  v
API analityczne
  - endpoint analizy działki i daty
  - walidacja wejścia
  - orkiestracja źródeł
  - cache i ograniczanie zapytań
  |
  +--> Resolver działki i geometrii
  |      ULDK / Geoportal / EGiB / seed geometrii
  |
  +--> Dane meteorologiczne
  |      Open-Meteo / IMGW
  |
  +--> Dane satelitarne
  |      Sentinel-2 / Earth Search
  |
  +--> Dane glebowe i uprawowe
  |      SoilGrids / IUNG
  |
  +--> Hydrologia i ukształtowanie
  |      NMT / Wody Polskie / Hydroportal
  |
  v
Warstwa obliczeniowa
  - bieżące i historyczne wskaźniki
  - poziom ryzyka i niepewność
  - identyfikacja przyczyn
  - reguły rekomendacji
  |
  v
Warstwa raportu
  - deterministyczne dane i źródła
  - opcjonalny LLM do tekstowego streszczenia
  - JSON / PDF / wydruk
```

## 6. Stack technologiczny

Preferowany uproszczony monolit modułowy:

- **Frontend:** Next.js.
- **API:** w zależności od dostępności modeli geoprzetwarzających.
- **Geometia i cache:** PostGIS albo Postgres z przetworzoną geometrią działek i buforem analiz.
- **Obliczenia geodezyjne i rastrowe:** Python z rasterio, shapely i xarray.
- **Mapy:** MapLibre.
- **Eksport PDF:** biblioteka generująca stronę raportu po stronie serwera lub przeglądarki.
- **LLM:** używany tylko do wygenerowania zwięzłego uzasadnienia i języka raportu.
- **Deploy:** Docker Compose i Coolify.

## 7. Logika analizy

Sekwencja musi być zgodna z treścią zadania i podstawami naukowymi:

```text
Ocena stanu wilgotności
  -> identyfikacja przyczyn
  -> rekomendacje retencyjne
  -> rekomendacje agrotechniczne
  -> ewentualne nawadnianie
```

### 7.1. Ocena bieżąca i historyczna

Analiza może łączyć:

- opady i temperaturę;
- długość i rozkład okresów bezopadowych;
- wskaźniki roślinności i uwilgotnienia;
- pojemność wodną i uziarnienie gleby;
- nachylenie i potencjalny odpływ;
- informacje o uprawie i jej etapie wegetacyjnym;
- historię warunków z ostatnich 10 lat.

Wynik satelitarny nie powinien być interpretowany samodzielnie. Każdy wniosek powinien mieć co najmniej jedno potwierdzenie z innego źródła.

### 7.2. Przyczyny

System może rozpoznawać i wskazywać:

- deficyt opadów;
- wysoką temperaturę i zwiększone parowanie;
- ograniczoną pojemność gleby;
- nadmierny odpływ powierzchniowy;
- wysoką podatność uprawy na stres wodny;
- brak lub ograniczenie danych lokalnych.

Nie należy przedstawiać pojedynczej przyczyny jako pewnej, jeżeli dane ją jedynie sugerują.

### 7.3. Rekomendacje

Priorytet mają działania zgodne z zasadą „retain water where it falls”:

1. retencja krajobrazowa:
   - małe zbiorniki;
   - oczka i mokradła;
   - strefy buforowe;
   - zadrzewienia śródpolne;
   - spowolnienie odpływu w rowach i ciekach.
2. retencja glebowa i agrotechnika:
   - międzyplony;
   - resztki pożniwne;
   - ograniczanie intensywnej uprawy;
   - zwiększanie materii organicznej;
   - poprawa struktury gleby.
3. nawadnianie tylko opcjonalnie:
   - termin;
   - zakres;
   - konieczność potwierdzenia dostępnych zasobów wodnych i lokalnych ograniczeń.

Każda rekomendacja musi być powiązana z obliczoną przyczyną i identyfikowanym źródłem danych.

## 8. Dane i ich użycie

### 8.1. Źródła pomocnicze

- ULDK / Geoportal / EGiB: geometria i identyfikacja działki.
- Open-Meteo / IMGW: dane bieżące i historyczne.
- Sentinel-2 / Copernicus: wskaźniki roślinności i obrazowanie terenu.
- SoilGrids / IUNG: glebowe parametry i podatność na suszę.
- NMT, PGW Wody Polskie i Hydroportal: rzeźba i hydrologia.
- Europejskie Obserwatorium Suszy: dodatkowe tło suszowe.

Lista nie jest zamknięta. W README należy udokumentować każdą używaną usługę, datę pobrania, licencję i zakres danych.

### 8.2. Dane bieżące i archiwalne

README powinien mieć tabelę dla każdego źródła:

| źródło | zakres | pobieranie | częstotliwość odświeżania | ograniczenie |
|---|---|---|---|---|

Do analizy historycznej wymagane jest sprawne odczytanie danych z ostatnich 10 lat. Dane pobrane wcześniej mogą być cache'owane, ale wynik i rekomendacja muszą być obliczane w trakcie analizy.

### 8.3. Niepewność i brak danych

Raport musi zawierać:

- aktualność danych;
- dokładność i rozdzielczość;
- pokrycie przestrzenne i czasowe;
- brakujące źródła;
- niepewność przypisanego ryzyka;
- czynniki nieujęte w analizie.

Brak danych nie może być zastępowany estymacją prezentowaną jako pomiar.

## 9. Ewaluacja

Dobrą metodą kontrolną będzie 10–20 działek testowych z różnych regionów Polski i różnych typów gleby.

Każdy test powinien zawierać:

- identyfikator działki;
- datę;
- uprawę;
- oczekiwane czynniki ryzyka;
- oczekiwane źródła;
- ocenę adekwatności rekomendacji.

Minimum do oceny:

- działanie dla działek z różnych województw;
- działanie dla dat bieżących i historycznych;
- brak fałszywej precyzji przy braku danych;
- ta sama analiza daje ten sam wynik dla tej samej daty;
- czas odpowiedzi do około 30 sekund dla działki testowej;
- poprawny eksport PDF.

Metryki techniczne:

- czas analizy;
- czas pobrania i transformacji danych;
- odsetek działek z kompletem danych;
- odsetek raportów zawierających wymagane źródła;
- odsetek rekomendacji powiązanych z konkretnym sygnałem;
- odsetek wystąpień braku danych wskazanych jawnie.

## 10. Stabilność i ograniczenia

### Cache

Buforować:

- geometrię działki;
- dane meteorologiczne;
- wskaźniki satelitarne;
- wyniki obliczeń dla tej samej działki, uprawy i daty;
- wygenerowany raport.

Nie cache'ować w ten sposób, aby finalna rekomendacja była gotowym przykładem bez ponownego obliczenia.

### Fallback

Nie wszystkie źródła muszą być dostępne jednocześnie. Przy niedostępności części danych:

- analizę wykonuje się na dostępnych źródłach;
- raport informuje o ograniczeniu;
- nie prezentuje się rekomendacji opartych na całkowicie nieznanym czynniku;
- aplikacja nie odradza nawadniania tylko dlatego, że jedna usługa nie odpowiada.

### Skalowanie

Na potrzeby prototypu wystarcza obsługa pojedynczego użytkownika i kilku działek testowych. Dokumentacja musi jednak opisac:

- buforowanie i odświeżanie danych;
- limity zewnętrznych API;
- koszty infrastruktury;
- kolejki dla kolejnych analiz;
- możliwość migracji cache i obliczeń do architektury rozproszonej.

## 11. Bezpieczeństwo i dane osobowe

- Nie zbierać danych osobowych rolnika.
- Nie tworzyć wymaganego konta użytkownika.
- Nie logować numerów działek razem z danymi identyfikacyjnymi.
- Walidować działki i daty po stronie serwera.
- Chronić klucze API i ewentualne integracje.
- Używać danych publicznych zgodnie z licencjami.
- Udokumentować zależności otwarte i ich warunki.

## 12. Harmonogram 24 godzin

| czas | cel | kryterium |
|---|---|---|
| 11:00–14:00 | Lektura kryteriów i konsultacje; wybór działek testowych; schema raportu | wspólna definicja wyniku |
| 14:00–19:00 | Walking skeleton: działka → dane → analiza → raport | działające demo end-to-end |
| 19:00–20:00 | DRAFT na Platformie konkursowej | zapisany projekt i postęp |
| 20:00–02:00 | Pełna sekwencja analityczna i ewaluacja | 10–20 działek testowych |
| 02:00–06:00 | Cache, PDF, stabilność, wow feature | działający link i backup |
| 06:00 | Feature freeze | tylko bugfixy |
| 06:00–09:00 | PDF, film do 3 minut, README i opis | komplet zgłoszenia |
| 09:00–10:00 | Kontrola linków i prywatność repozytorium | zgłoszenie kompletne |
| 10:00–11:00 | Poprawki opisowe i backupy | bufor |
| 11:00–14:45 | Próby prezentacji i odpowiedzi na pytania | finał gotowy |

## 13. Mentorzy do konsultacji

Priorytety:

1. **Tymoteusz Bolewski** — bilans wodny, susza i retencja.
2. **Dariusz Gozdowski** — agrotechnika i interpretacja danych satelitarnych.
3. **Tomasz Rychlicki** — działki, GIS, publiczne API i mapy.
4. **Borys Czerniejewski** — prostota produktu i użytkownik rolnik.
5. Mentoring instytucjonalny — zgodność z oczekiwaniami KOWR i wdrożeniowość.

Najważniejsze pytania do mentorów:

- jaka referencyjna metoda oceny sytuacji wodnej będzie porównywana przez Jury;
- jak interpretować niekompletność danych przy daty historycznej;
- jakie uprawy i parametry są priorytetowe;
- jaka jest minimalna dokładność geometryczna działki;
- czy raport może opierać się na SoilGrids i IUNG, czy wymagane są konkretne strefy referencyjne.

## 14. Dokumentacja i materiały zgłoszeniowe

Obowiązkowe elementy:

- nazwa zespołu i tytuł rozwiązania;
- zwięzły opis problemu i korzyści;
- link do prywatnego repozytorium;
- README z instrukcją uruchomienia i architekturą;
- wykaz źródeł, zakresów, licencji i terminów pobrania;
- wykaz bibliotek, komponentów, modeli i narzędzi AI;
- prezentacja PDF maksymalnie 10 slajdów;
- działający prototyp i link;
- film maksymalnie 3 minuty;
- wygenerowane przez prototyp raporty.

## 15. Konfiguracja finału

Scenariusz prezentacji:

1. problem i potrzeba rolnika;
2. wybór działki i uprawy;
3. analiza bieżąca i historyczna;
4. przyczyny niedoboru wody;
5. konkretne działania retencyjne i agrotechniczne;
6. niepewność i źródła;
7. PDF i wdrożenie;
8. ewaluacja i skalowanie.

Demo musi być przygotowane dla co najmniej trzech działek z różnych regionów, wraz z nagranym filmem backupowym.

## 16. Kryteria sukcesu

Projekt będzie silny, jeśli spełni jednocześnie:

- działanie w czasie poniżej 30 sekund;
- obliczenie wyników dla dowolnej działki i daty;
- transparentne źródła i ograniczenia;
- rekomendacje zgodne z kolejnością naukową;
- jeden prosty, praktyczny raport;
- stabilny link publiczny;
- kompletna dokumentacja i film;
- jasne oddzielenie obliczeń od językowego streszczenia LLM;
- realne ograniczenie zakresu zamiast wielu niedokończonych funkcji.
