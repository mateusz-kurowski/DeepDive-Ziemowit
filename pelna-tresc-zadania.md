# Krajowy Ośrodek Wsparcia Rolnictwa — HACKNATION 2026

## Zadanie konkursowe KOWR: Zatrzymaj wodę, chroń plony – Inteligentne wsparcie gospodarowania wodą w rolnictwie

**Pomóż polskim rolnikom walczyć z suszą – stwórz cyfrowego asystenta, który zamieni dane satelitarne i meteorologiczne w konkretne decyzje dotyczące wody na każdej działce rolnej.**

*Bydgoszcz, 21–22 listopada 2026 r.*

---

## Spis treści

1. [Wprowadzenie – opis organizacji, sytuacji i stanu aktualnego](#1-wprowadzenie--opis-organizacji-sytuacji-i-stanu-aktualnego) (str. 3)
2. [Wyzwanie](#2-wyzwanie) (str. 3)
3. [Scenariusz i oczekiwany rezultat](#3-scenariusz-i-oczekiwany-rezultat) (str. 3)
4. [Wymagania formalne](#4-wymagania-formalne) (str. 5)
5. [Wymagania techniczne](#5-wymagania-techniczne) (str. 6)
6. [Sposób testowania i/lub walidacji](#6-sposób-testowania-ilub-walidacji) (str. 8)
7. [Kryteria oceny](#7-kryteria-oceny) (str. 9)
8. [Dodatkowe uwagi / kontekst wdrożeniowy](#8-dodatkowe-uwagi--kontekst-wdrożeniowy) (str. 9)
9. [Kontakt](#9-kontakt) (str. 10)

---

## 1. Wprowadzenie – opis organizacji, sytuacji i stanu aktualnego

Krajowy Ośrodek Wsparcia Rolnictwa (KOWR) jest państwową osobą prawną realizującą zadania z zakresu wsparcia rolnictwa i rozwoju obszarów wiejskich, w tym wspieraniem innowacji w sektorze rolno-spożywczym. KOWR gospodaruje zasobem nieruchomości rolnych Skarbu Państwa o powierzchni ok. 1,4 mln ha i podejmuje działania na rzecz zrównoważonego rozwoju oraz zwiększania odporności polskiego rolnictwa na zmiany klimatu. W obliczu narastającego problemu suszy i deficytu wody szczególnego znaczenia nabierają rozwiązania, które pozwolą lepiej wykorzystywać dostępne dane i technologie do wspierania rolników w podejmowaniu decyzji dotyczących gospodarowania wodą.

Polska znajduje się w grupie państw europejskich o jednych z najniższych zasobów wodnych i niskim poziomie retencji wód. Nasilające się w ostatnich latach okresy suszy rolniczej powodują straty w plonach i stanowią istotne wyzwanie dla stabilności finansowej gospodarstw oraz bezpieczeństwa żywnościowego.

Obecnie dostępna jest ogromna ilość otwartych danych (satelitarnych, meteorologicznych, glebowych i hydrologicznych). Są one jednak rozproszone, często wymagają specjalistycznej wiedzy i nie zawsze są łatwo dostępne dla przeciętnego rolnika. W efekcie, rolnicy nie mają dostępu do prostych, zagregowanych i spersonalizowanych informacji, które mogłyby wspierać decyzje dotyczące retencjonowania wody, nawadniania czy doboru upraw i pozwalać lepiej dostosować działania do warunków panujących na konkretnej działce.

---

## 2. Wyzwanie

Jak połączyć ogólnodostępne dane przestrzenne, satelitarne, meteorologiczne, glebowe i hydrologiczne w proste, intuicyjne narzędzie cyfrowe dla rolnika, które w oparciu o wskazaną działkę rolną (ewidencyjną) dostarczy spersonalizowanych rekomendacji w zakresie retencji wody, oceny ryzyka suszy i optymalizacji nawadniania? Przy projektowaniu rozwiązania zespoły powinny uwzględnić nie tylko dostępne dane, ale także kierunki współczesnych badań i prac naukowych dotyczących suszy rolniczej, retencji wody w glebie i wsparcia decyzji rolników. Kluczowe funkcjonalności w narzędziu powinny odwoływać się do aktualnej wiedzy naukowej.

W załączniku nr 1 do niniejszego opisu przedstawione są w syntetycznej formie *Podstawy naukowe dotyczące Zadania konkursowego*.

---

## 3. Scenariusz i oczekiwany rezultat

### 3.1. Użytkownik rozwiązania
Głównym użytkownikiem rozwiązania jest rolnik prowadzący gospodarstwo obejmujące jedną lub więcej działek ewidencyjnych, który nie musi posiadać specjalistycznej wiedzy z zakresu systemów informacji geograficznej (GIS), teledetekcji, hydrologii ani analizy danych. Rozwiązanie powinno przedstawiać informacje i rekomendacje w sposób prosty, zrozumiały i możliwy do wykorzystania w praktyce gospodarstwa rolnego.

### 3.2. Oczekiwany rezultat
Oczekiwanym rezultatem jest działający prototyp narzędzia cyfrowego, dostępnego w formie aplikacji webowej uruchamianej w przeglądarce internetowej na komputerze. Prototyp powinien poprawnie uruchamiać się w systemie operacyjnym Windows i przeglądarkach internetowych (Google Chrome, Firefox, Microsoft Edge, Safari, Opera) bez instalowania dodatkowego oprogramowania. Dodatkowym atutem będzie poprawne działanie aplikacji na urządzeniach mobilnych.

Rozwiązanie powinno wspierać rolnika w podejmowaniu decyzji związanych z gospodarowaniem wodą na wskazanej działce, w szczególności w zakresie:
1. oceny sytuacji wodnej;
2. ograniczania strat wilgoci w glebie;
3. zwiększania retencji wody;
4. doboru działań agrotechnicznych wpływających na gospodarkę wodną;
5. racjonalnego planowania nawadniania.

Po podaniu przez rolnika identyfikatora działki ewidencyjnej lub wskazaniu jej lokalizacji na mapie narzędzie powinno przeprowadzić analizę i opracować rekomendacje w następującej kolejności:

1. **Ocena stanu wilgotności**
   * Narzędzie dokonuje oceny sytuacji wodnej działki na podstawie dostępnych danych, w szczególności wskaźników satelitarnych, danych glebowych oraz danych meteorologicznych, w oparciu o dane za ostatnie 10 lat. Interpretacja danych satelitarnych powinna uwzględniać rodzaj uprawy i specyfikę analizowanej roślinności.
2. **Opracowanie rekomendacji retencyjnych i agrotechnicznych**
   * Na podstawie wyników oceny, o której mowa w pkt 1, oraz dodatkowych danych, w szczególności dotyczących ukształtowania terenu oraz cieków i zbiorników wodnych (danych hydrologicznych) a także rodzaju uprawy, narzędzie wskazuje odpowiednie rekomendacje – tj. możliwe miejsca i sposoby zatrzymywania wody w obrębie działki lub gospodarstwa oraz propozycje zabiegów zwiększających retencję glebową itp.
3. **Opracowanie rekomendacji dotyczących zabiegów nawadniania (opcjonalnie)**
   * Na podstawie wyników wcześniejszych etapów narzędzie przedstawia proste i zrozumiałe wskazówki dotyczące zasadności, terminu i zakresu nawadniania.

**Kolejność etapów ma znaczenie:** rekomendacje, o których mowa w pkt 2 i 3 (opcjonalnie), powinny wynikać z przeprowadzonej wcześniej oceny sytuacji wodnej działki oraz być uzasadnione wykorzystanymi danymi. System nie powinien generować rekomendacji bez uprzedniego rozpoznania warunków dotyczących analizowanej działki. 

Poniżej przedstawiono w sposób syntetyczny przykładowe rekomendacje:

> * Na analizowanej działce występuje podwyższone ryzyko suszy rolniczej wynikające z niskiej retencji glebowej oraz częstych niedoborów opadów w okresie wegetacyjnym.
> * Największe ryzyko niedoboru wody na tej działce występuje w okresie od maja do lipca. W tym czasie zaleca się szczególny monitoring stanu upraw i dostępności wody.
> * W otoczeniu działki występują warunki sprzyjające zwiększeniu retencji krajobrazowej poprzez okresowe zatrzymywanie wód opadowych lub spowolnienie odpływu wód w rowach melioracyjnych lub małych ciekach.
> * W celu zwiększenia retencji wody warto rozważyć zastosowanie międzyplonów, pozostawianie resztek pożniwnych oraz działania spowalniające odpływ wód opadowych w obrębie działki.

### 3.3. Obowiązkowy zakres prototypu
1. Rolnik uruchamia narzędzie w przeglądarce internetowej.
2. Wskazuje działkę ewidencyjną lub jej lokalizację na mapie.
3. Wybiera aktualną uprawę (co do zasady w której występują największe niedobory wodne lub największe potrzeby nawadniania).
4. Narzędzie pobiera dane źródłowe (pkt 5.2) i ocenia bieżącą sytuację wodną działki, jak i ocenę historycznej podatności działki na występowanie niedoborów wody na podstawie danych wieloletnich. Wynik i rekomendacje oblicza narzędzie na podstawie pobranych danych źródłowych (bieżących i archiwalnych z ostatnich 10 lat); wyświetlenie wcześniej przygotowanych rekomendacji nie spełnia wymagań.
5. Rolnik dostaje raport zawierający: stan niedoboru wody i jego przyczyny, wraz z rekomendacjami działań uzasadnionymi danymi (retencyjną, agrotechniczną, nawadniania (opcjonalna)), datę i źródła danych oraz ograniczenia raportu (np. aktualność i dokładność danych, poziom niepewności wyniku, czynniki nieuwzględnione w analizie). Brak danych jest komunikowany wprost, bez pozornej precyzji.
6. Raport można zapisać w systemie lub w formie pliku (np. PDF) lub wydrukować.

Prototyp powinien wykorzystywać dane pochodzące z poniższych kategorii:
* dane meteorologiczne;
* dane satelitarne;
* dane glebowe;
* dane hydrologiczne;
* dane przestrzenne dotyczące lokalizacji działek oraz użytkowania i ukształtowania terenu.

**Ważne:** Rozwiązanie musi być proste w obsłudze i zrozumiałe dla rolnika bez specjalistycznej wiedzy technicznej czy znajomości narzędzi GIS. Aplikacja ma przyczynić się do bardziej efektywnego wykorzystania dostępnych zasobów wodnych, ograniczenia strat powodowanych suszą oraz zwiększenia odporności gospodarstw rolnych na zmiany klimatyczne. Rezultatem końcowym będzie narzędzie wspomagające rolników w podejmowaniu trafniejszych decyzji na podstawie aktualnych informacji i uwarunkowań środowiskowych specyficznych dla danej lokalizacji.

---

## 4. Wymagania formalne

### 4.1. Zawartość zgłoszenia
Rozwiązanie przesyłane do oceny powinno zawierać:
* nazwę Zespołu i tytuł rozwiązania;
* zwięzły opis rozwiązania, przedstawiający:
  * problem, na który odpowiada rozwiązanie,
  * główne funkcjonalności,
  * sposób wykorzystania danych,
  * najważniejsze korzyści dla użytkownika;
* link do prywatnego repozytorium kodu źródłowego;
* dokumentację rozwiązania w pliku README lub równoważnym dokumencie;
* prezentację rozwiązania w formacie PDF, obejmującą do 10 slajdów;
* działający prototyp rozwiązania, możliwy do zaprezentowania podczas oceny lub prezentacji finałowej, wraz z linkiem do działającej wersji lub instrukcją uruchomienia w README (element obowiązkowy);
* film do 3 minut pokazujący działanie prototypu;
* wygenerowany przez prototyp raport/y.

### 4.2. Dokumentacja techniczna
Plik README lub równoważna dokumentacja powinny zawierać co najmniej:
1. instrukcję uruchomienia rozwiązania;
2. opis podstawowych funkcjonalności;
3. skrócony opis architektury rozwiązania;
4. opis wykorzystanych źródeł i zakresów danych;
5. wskazanie, które dane są pobierane na bieżąco, a które zostały pobrane lub przetworzone wcześniej, wraz z datami ich pobrania; wynik i rekomendację musi obliczać aplikacja na podstawie tych danych;
6. wykaz wykorzystanych bibliotek, komponentów, modeli, usług zewnętrznych i narzędzi sztucznej inteligencji;
7. wskazanie licencji lub innych warunków korzystania z danych i komponentów;
8. opis znanych ograniczeń technicznych rozwiązania;
9. informację o sposobie weryfikacji wygenerowanych wyników lub rekomendacji.

### 4.3. Repozytorium kodu
Repozytorium powinno pozostać prywatne co najmniej do czasu zakończenia Wydarzenia. Zespół powinien zapewnić członkom jury dostęp do repozytorium zgodnie z instrukcją opublikowaną na Platformie konkursowej, w szczególności przez dodanie wskazanych kont użytkowników albo przekazanie linku dostępowego.

Regulamin wymaga, aby zgłoszenie zawierało link do repozytorium, repozytorium pozostawało niepubliczne co najmniej do zakończenia Wydarzenia, a sposób udostępnienia go jury został określony w opisie Zadania.

Jeżeli przed rozpoczęciem Wydarzenia nie będzie możliwe wskazanie nazw kont członków jury, szczegółowa instrukcja udostępnienia repozytorium zostanie przekazana uczestnikom za pośrednictwem Platformy konkursowej.

### 4.4. Materiały dodatkowe *(w oryginale błędnie numerowane jako 1)*
Zgłoszenie może ponadto zawierać:
* zrzuty ekranu;
* materiały graficzne;
* inne materiały ułatwiające ocenę rozwiązania.

*Materiały dodatkowe nie zastępują obowiązkowych elementów zgłoszenia.*

---

## 5. Wymagania techniczne

### 5.1. Technologie
Uczestnicy mogą samodzielnie wybrać języki programowania, frameworki, środowiska, biblioteki i pozostałe technologie wykorzystane do przygotowania rozwiązania.

Rozwiązanie powinno być możliwe do uruchomienia lub zaprezentowania w warunkach Wydarzenia na podstawie instrukcji zawartej w dokumentacji.

Rozwiązanie może wykorzystywać technologie sztucznej inteligencji, w tym modele generatywne, uczenie maszynowe, przetwarzanie języka naturalnego, analizę obrazu lub inne techniki AI. Dopuszczalne jest zarówno wykorzystanie gotowych narzędzi i usług AI, jak i samodzielnie opracowanych modeli lub algorytmów. Uczestnicy są zobowiązani do wskazania w dokumentacji zakresu i sposobu zastosowania AI w rozwiązaniu.

### 5.2. Źródła danych
Zespoły mogą samodzielnie dobrać źródła danych najlepiej odpowiadające koncepcji i potrzebom tworzonego rozwiązania. Organizator nie narzuca obowiązku korzystania z konkretnych baz, serwisów ani interfejsów API.

Warunkiem wykorzystania danych jest ich bezpłatna i legalna dostępność oraz zgodność sposobu ich użycia z właściwą licencją, regulaminem lub innymi warunkami określonymi przez dostawcę danych. Zespół powinien również mieć możliwość wskazania pochodzenia danych i opisania ich w dokumentacji rozwiązania.

Jako przykładowe źródła można wykorzystać:
* **Dane satelitarne:** Copernicus Data Space Ecosystem (https://documentation.dataspace.copernicus.eu) lub publiczny katalog Sentinel-2 Earth Search (https://earth-search.aws.element84.com/v1 – bez konta).
* **Dane meteorologiczne:** IMGW-PIB (https://danepubliczne.imgw.pl/apiinfo), Open-Meteo (https://open-meteo.com/en/terms).
* **Dane glebowo-rolnicze:** IUNG-PIB, w tym Monitoring Suszy Rolniczej (https://susza.iung.pulawy.pl/) i Mapa podatności gleb na suszę (https://susza.iung.pulawy.pl/mapa-kategorii/); ISRIC SoilGrids (https://docs.isric.org/globaldata/soilgrids/).
* **Dane przestrzenne:** Geoportal.gov.pl (https://www.geoportal.gov.pl), w tym numeryczny model terenu NMT/NMPT (usługa WCS), ULDK GUGIK (https://uldk.gugik.gov.pl/opis.html), Ewidencja Gruntów i Budynków (https://www.geoportal.gov.pl/pl/dane/ewidencja-gruntow-i-budynkow-egib/, https://opendata.geoportal.gov.pl/Inne%20Dane/latest_exports/eziudp_wfs/PARQUET/0_dzialki.parquet).
* **Dane hydrologiczne:** PIG-PIB / PGW Wody Polskie, Informatyczny System Osłony Kraju – Hydroportal (https://isok.gov.pl/hydroportal.html).
* **Tło suszowe:** Europejskie Obserwatorium Suszy, EDO (https://drought.emergency.copernicus.eu/data/wms-service – usługa WMS).

**WAŻNE:** Lista ma charakter pomocniczy, otwarty i niewyczerpujący. Zespół może skorzystać ze wskazanych źródeł, połączyć je z innymi danymi albo oprzeć rozwiązanie na innych, samodzielnie znalezionych źródłach, pod warunkiem spełnienia powyższych wymagań. Dane są pozyskiwane samodzielnie przez Zespoły. KOWR nie udostępnia gotowych pakietów danych.

### 5.3. Dokumentowanie źródeł i licencji
Zespół powinien udokumentować wszystkie istotne:
* zbiory danych;
* biblioteki;
* komponenty;
* modele;
* usługi zewnętrzne;
* interfejsy API;
* narzędzia sztucznej inteligencji.

Dokumentacja powinna wskazywać ich źródło oraz licencję lub inne warunki korzystania. Regulamin dopuszcza użycie danych publicznych, otwartych bibliotek i komponentów oraz narzędzi AI pod warunkiem wykazania ich w dokumentacji wraz z warunkami licencji.

### 5.4. Dostępność dla użytkownika
Korzystanie z podstawowych funkcjonalności rozwiązania nie powinno wymagać od rolnika:
* zakupu płatnej licencji;
* posiadania specjalistycznego sprzętu;
* znajomości GIS;
* umiejętności programowania;
* samodzielnego przetwarzania danych przestrzennych;
* instalowania dodatkowego oprogramowania.

Jeżeli określone funkcje prototypu korzystają z odpłatnych usług lub płatnych warstw infrastruktury, zespół powinien wyraźnie to wskazać oraz przedstawić przewidywane koszty utrzymania i możliwe alternatywy.

### 5.5. Skalowalność
Prototyp powinien działać dla dowolnych obszarów (działek ewidencyjnych) z terenu Polski. Zespół nie musi wykazać obsługi dużej liczby jednoczesnych użytkowników ani pełnej wydajności w skali całego kraju.

Zespół powinien natomiast opisać w dokumentacji, co byłoby potrzebne, aby rozwiązanie mogło służyć wielu rolnikom w całej Polsce, w szczególności:
* jak rozwiązanie radzi sobie z limitami i dostępnością zewnętrznych źródeł danych (np. buforowanie, zapis wyników, ograniczanie liczby zapytań),
* jak byłyby aktualizowane dane i jak szybko aplikacja odpowiadałaby przy większym ruchu,
* jakie koszty infrastruktury mogłyby się pojawić przy rozwoju rozwiązania.

### 5.6. Bezpieczeństwo
Rozwiązanie powinno uwzględniać podstawowe zasady cyberbezpieczeństwa, odpowiednie do zakresu prototypu. W prototypie należy unikać zbierania danych osobowych, jeżeli nie są one niezbędne do zaprezentowania funkcjonalności.

---

## 6. Sposób testowania i/lub walidacji

Ocena rozwiązań przebiega w dwóch etapach:

1. **Etap 1: ocena wszystkich zgłoszeń.** Jury ocenia zgłoszenie na podstawie dokumentacji (opis, README, repozytorium, film) oraz własnego sprawdzenia działania prototypu. Jurorzy uruchamiają prototyp dla działek ewidencyjnych z obszaru całej Polski (jednakowych dla każdego zgłoszenia), podając ich numer, i porównują wynik z danymi referencyjnymi dostępnymi tylko dla jury. Data analizy wskazana przez jury może dotyczyć zarówno dnia bieżącego, jak i dat historycznych mieszczących się w okresie ostatnich 10 lat. Prototyp musi więc działać dla dowolnych działek ewidencyjnych w Polsce i być dostępny dla jury przez link do działającej wersji lub instrukcję uruchomienia w README. Ocena jest dokonywana zgodnie z kryteriami, określonymi w rozdz. 7.
2. **Etap 2: finał (pitch).** Każdy z finalistów (od 3 do 5) prezentuje rozwiązanie w jednakowym czasie i pokazuje na żywo działanie prototypu dla 1–3 działek wskazanych przez jury (numer działki ewidencyjnej i data analizy). Ocena jest dokonywana zgodnie z kryteriami, określonymi w rozdz. 7.

---

## 7. Kryteria oceny

1. **Wartość praktyczna dla użytkownika – 25%:** stopień, w jakim rozwiązanie odpowiada na rzeczywiste potrzeby rolnika i wspiera podejmowanie konkretnych, możliwych do zastosowania w gospodarstwie decyzji dotyczących gospodarowania wodą, w szczególności zwiększania retencji wody, racjonalnego nawadniania, ograniczania strat wilgoci w glebie i przeciwdziałania skutkom suszy, z uwzględnieniem specyfiki gospodarstwa i lokalnych warunków.
2. **Wykorzystanie danych i wiarygodności rekomendacji – 25%:** jakość i adekwatność wykorzystywanych ogólnodostępnych danych, umiejętność łączenia różnych źródeł danych oraz poprawność merytoryczna przeprowadzonych analiz i generowanych rekomendacji. Ocenie podlegają w szczególności zgodność zastosowanych metod z aktualną wiedzą naukową, dostosowanie wyników do warunków konkretnej działki, uzasadnienie rekomendacji na podstawie danych oraz transparentne przedstawienie ograniczeń i niepewności analiz.
3. **Innowacyjność i potencł rozwojowy – 20%:** stopień nowatorstwa rozwiązania w zakresie podejścia do problemu, sposobu wykorzystania danych, zastosowanych metod analitycznych lub wspierania decyzji rolnika, a także wartość dodana w stosunku do istniejących rozwiązań i praktyk. Ocenie podlegają również możliwości dalszego rozwoju i wdrożenia rozwiązania, jego integracji z innymi systemami oraz skalowania.
4. **Prostota obsługi – 15%:** intuicyjność obsługi, zrozumiałość dla użytkownika bez przygotowania technicznego oraz dostosowanie do warunków pracy w gospodarstwie.
5. **Działający prototyp i jakość techniczna – 15%:** stopień realizacji wymaganych funkcjonalności, poprawność i stabilność działania, w szczególności możliwość przeprowadzenia analizy i wygenerowania rekomendacji dla wskazanej działki rolnej i daty. Ocenie podlegają również jakość architektury i kodu, szybkość działania, podstawowe mechanizmy bezpieczeństwa, kompletność dokumentacji oraz zgodność wykorzystanych danych i komponentów z warunkami ich licencji. Preferowane będą rozwiązania umożliwiające wygenerowanie rekomendacji w czasie nieprzekraczającym 30 sekund dla pojedynczej działki.

---

## 8. Dodatkowe uwagi / kontekst wdrożeniowy

KOWR traktuje wyzwanie jako element prowadzonych działań na rzecz retencji wody w rolnictwie. Celem hackathonu jest przetestowanie koncepcji: sprawdzenie, czy ogólnodostępne dane można przekształcić w proste narzędzie wspierające decyzje rolnika dotyczące wody, oraz jakie podejścia i rozwiązania zespoły uznają za najbardziej wartościowe. Najciekawsze rozwiązania zostaną przeanalizowane przez KOWR jako źródło pomysłów i wniosków do dalszych prac nad retencją wody w rolnictwie.

---

## 9. Kontakt

### Mentorzy:
* **dr inż. Tymoteusz Bolewski** – susza rolnicza, gospodarka wodna, retencja wody, bilans wodny,
* **Borys Czerniejewski** – analiza biznesowa, projektowanie usług cyfrowych, potrzeby użytkowników,
* **dr hab. Dariusz Gozdowski** – rolnictwo, agrotechnika, produkcja roślinna, wykorzystanie danych (m.in. satelitarnych) w rolnictwie,
* **Tomasz Rychlicki** – GIS, dane przestrzenne, dane publiczne, API, wizualizacja danych na mapach,
* **Katarzyna Capecka** – mentor instytucjonalny,
* **Marcin Walczyk** – mentor instytucjonalny.

*Dostępność mentora (godziny, forma kontaktu: Discord / e-mail / stoisko) – godziny/miejsca konsultacji zostaną podane na platformie Discord.*

### Załącznik:
1. Podstawy naukowe dotyczące Zadania konkursowego.