# KOWR — Zatrzymaj wodę, chroń plony (podsumowanie)

Źródła: „Pełna treść zadania konkursowego", „Podstawy naukowe" (załącznik 1), „Regulamin zadania konkursowego". Brak zip-ów w folderze.

## 1. Organizator i nagroda
- Zadanie zgłasza i przeprowadza Krajowy Ośrodek Wsparcia Rolnictwa (KOWR), Warszawa, ul. Karolkowa 30; organizatorem wydarzenia jest Ministerstwo Cyfryzacji.
- Jedna nagroda pieniężna dla zespołu z najwyższą oceną: **25 000,00 zł netto**. Za dalsze miejsca nagrody nie ma (Regulamin § 4 ust. 2–3).
- Wypłata do 14 dni od podpisania Umowy przeniesienia praw przez wszystkich członków zespołu i przekazania formularzy danych. Równy podział, chyba że wspólne oświadczenie (Zał. 2).
- Jury może nie przyznać nagrody, jeśli żadne rozwiązanie nie uzyska co najmniej 50% maks. punktów albo nie spełni wymagań formalnych (§ 3 ust. 9).

## 2. Problem
Polska ma jedne z najniższych zasobów wodnych w Europie i niską retencję; susze rolnicze powodują straty w plonach. Dostępne są otwarte dane satelitarne, meteo, glebowe i hydrologiczne, ale są rozproszone i wymagają specjalistycznej wiedzy. Rolnik nie dostaje prostych, spersonalizowanych informacji o retencji, nawadnianiu i ryzyku suszy dla swojej działki.

## 3. Co trzeba zbudować / oczekiwane rezultaty
**Działający prototyp** aplikacji webowej (przeglądarka na komputerze; ma działać na Windows i w Chrome, Firefox, Edge, Safari, Opera bez instalowania oprogramowania; atutem działanie na mobile).

Obowiązkowy zakres (3.3):
1. Rolnik uruchamia narzędzie w przeglądarce.
2. Wskazuje działkę ewidencyjną (numer) lub lokalizację na mapie.
3. Wybiera aktualną uprawę.
4. Narzędzie **pobiera dane źródłowe i samo oblicza** bieżącą sytuację wodną oraz historyczną podatność na niedobory (dane z ostatnich 10 lat). „Wyświetlenie wcześniej przygotowanych rekomendacji nie spełnia wymagań."
5. Raport: stan niedoboru wody i przyczyny, rekomendacje uzasadnione danymi (retencyjna, agrotechniczna, nawadniania — opcjonalna), data i źródła danych, ograniczenia raportu (aktualność, dokładność, niepewność, czynniki nieuwzględnione). „Brak danych jest komunikowany wprost, bez pozornej precyzji."
6. Raport można zapisać w systemie / jako plik (np. PDF) / wydrukować.

Wymagana kolejność analizy: 1) ocena stanu wilgotności (wskaźniki satelitarne + dane glebowe + meteo, 10 lat, z uwzględnieniem rodzaju uprawy) → 2) rekomendacje retencyjne i agrotechniczne (rzeźba terenu, cieki i zbiorniki, uprawa) → 3) nawadnianie (opcjonalnie: zasadność, termin, zakres). „System nie powinien generować rekomendacji bez uprzedniego rozpoznania warunków dotyczących analizowanej działki."

Wymagane kategorie danych: meteorologiczne, satelitarne, glebowe, hydrologiczne, przestrzenne (lokalizacja działek, użytkowanie i ukształtowanie terenu).

Z „Podstaw naukowych": sekwencja ocena sytuacji wodnej → identyfikacja przyczyn → rekomendacje retencyjne → agrotechniczne → ewentualne nawadnianie; zasada „retain water where it falls"; priorytet retencji przed nawadnianiem; wskaźniki satelitarne nie samodzielnie, tylko w połączeniu z meteo/glebą/hydrologią; rozróżnić bieżącą suszę od podwyższonej podatności wieloletniej; wskazywać niepewność. Przyczyny: deficyt opadów + temperatura, mała pojemność wodna gleby (uziarnienie, próchnica), nadmierny odpływ powierzchniowy (nachylenie, brak mokradeł/oczek/zadrzewień), wrażliwość uprawy.

## 4. Kryteria oceny z wagami (Regulamin § 3 ust. 4 / opis rozdz. 7)
Wynik = średnia ważona ocen jurorów w kryteriach (Platforma). Skala punktowa pojedynczego kryterium nie jest podana w dokumentach zadania.
1. **Wartość praktyczna dla użytkownika — 25%**: odpowiada na realne potrzeby rolnika, konkretne decyzje (retencja, racjonalne nawadnianie, ograniczanie strat wilgoci, skutki suszy), specyfika gospodarstwa i lokalnych warunków.
2. **Wykorzystanie danych i wiarygodność rekomendacji — 25%**: jakość i adekwatność danych, łączenie źródeł, poprawność merytoryczna; zgodność metod z aktualną wiedzą naukową, dostosowanie do konkretnej działki, uzasadnienie danymi, transparentne ograniczenia i niepewność.
3. **Innowacyjność i potencjał rozwojowy — 20%**: nowatorstwo podejścia/danych/metod, wartość dodana wobec istniejących rozwiązań, rozwój, wdrożenie, integracja, skalowanie.
4. **Prostota obsługi — 15%**: intuicyjność, zrozumiałość bez przygotowania technicznego, dostosowanie do pracy w gospodarstwie.
5. **Działający prototyp i jakość techniczna — 15%**: realizacja wymaganych funkcji, stabilność, możliwość analizy dla wskazanej działki **i daty**; jakość architektury i kodu, szybkość, podstawowe zabezpieczenia, dokumentacja, zgodność danych/komponentów z licencjami. **Preferowane: rekomendacja w czasie ≤ 30 s dla pojedynczej działki.**

Przebieg oceny:
- **Etap 1** (wszystkie zgłoszenia): jury ocenia dokumentację (opis, README, repo, film) i **samo uruchamia prototyp** dla tych samych działek z całej Polski (po numerze), porównując wynik z danymi referencyjnymi tylko dla jury. Data analizy może być bieżąca lub historyczna (ostatnie 10 lat).
- **Etap 2** (finał, 3–5 zespołów, jednakowy czas): pokaz na żywo dla 1–3 działek wskazanych przez jury (numer + data). Prezentacja ok. 2–3 min + do 2 min pytań (§ 3 ust. 6). Ostateczna kolejność uwzględnia wyniki oceny i prezentacji.

## 5. Dane i materiały
Dane zespoły pozyskują samodzielnie; „KOWR nie udostępnia gotowych pakietów danych". Warunek: bezpłatna i legalna dostępność, zgodność z licencją/regulaminem dostawcy, możliwość wskazania pochodzenia. Lista przykładowych źródeł (pomocnicza, niewyczerpująca):
- Satelitarne: Copernicus Data Space Ecosystem (https://documentation.dataspace.copernicus.eu); Sentinel-2 Earth Search (https://earth-search.aws.element84.com/v1, bez konta).
- Meteo: IMGW-PIB (https://danepubliczne.imgw.pl/apiinfo); Open-Meteo (https://open-meteo.com/en/terms).
- Glebowo-rolnicze: IUNG-PIB Monitoring Suszy (https://susza.iung.pulawy.pl/), Mapa podatności gleb na suszę (https://susza.iung.pulawy.pl/mapa-kategorii/); ISRIC SoilGrids (https://docs.isric.org/globaldata/soilgrids/).
- Przestrzenne: Geoportal.gov.pl (NMT/NMPT przez WCS), ULDK GUGiK (https://uldk.gugik.gov.pl/opis.html), EGiB (https://www.geoportal.gov.pl/pl/dane/ewidencja-gruntow-i-budynkow-egib/; parquet działek: https://opendata.geoportal.gov.pl/InneDane/latest_exports/eziudp_wfs/PARQUET/0_dzialki.parquet).
- Hydrologiczne: PIG-PIB / PGW Wody Polskie, Hydroportal ISOK (https://isok.gov.pl/hydroportal.html).
- Tło suszowe: EDO — Europejskie Obserwatorium Suszy (https://drought.emergency.copernicus.eu/data/wms-service, WMS).
- Rekomendowane przez ekspertów: Polska Agencja Kosmiczna, „Dane satelitarne dla administracji publicznej" (rozdz. 6.3.3, 6.3.4; https://polsa.gov.pl/aktywnosci/obserwacja-ziemi/dane-satelitarne/); CDR Brwinów, e-poradnik „Melioracje, retencja i gospodarka wodna w rolnictwie" (2025; https://woda.cdr.gov.pl/images/publikacje/Publikacje/Melioracje_retencja_wodna_e-poradnik_2025.pdf).
- Bibliografia w „Podstawach naukowych": FAO-56 (Allen, Pereira, Smith, rev. 2025), Doroszewski i in. (2012) Podstawy Systemu Monitoringu Suszy Rolniczej (IUNG), KE (2014, 2015) Natural Water Retention Measures, FAO (2019) Water scarcity management, Minasny i in. (2017) Soil carbon 4 per mille, Żyłowska & Kozyra (2025) IUNG.
- Mentorzy: dr inż. Tymoteusz Bolewski (susza, retencja, bilans wodny), Borys Czerniejewski (analiza biznesowa, UX usług), dr hab. Dariusz Gozdowski (agrotechnika, dane satelitarne), Tomasz Rychlicki (GIS, dane publiczne, API, mapy), Katarzyna Capecka i Marcin Walczyk (instytucjonalni). Godziny/miejsca — na Discordzie.

## 6. Wymagania techniczne / formalne i ograniczenia
**Zgłoszenie (4.1):** nazwa zespołu i tytuł; zwięzły opis (problem, funkcje, użycie danych, korzyści); link do **prywatnego** repo; README/dokumentacja; **prezentacja PDF do 10 slajdów**; **działający prototyp** (link do działającej wersji lub instrukcja uruchomienia w README — obowiązkowe); **film do 3 minut**; **wygenerowane przez prototyp raport(y)**. Opcjonalnie: zrzuty ekranu, grafiki.

**README (4.2) musi zawierać:** instrukcję uruchomienia; funkcje; skrócony opis architektury; źródła i zakresy danych; które dane są pobierane na bieżąco, a które wcześniej (z datami pobrania); wykaz bibliotek, komponentów, modeli, usług zewnętrznych i narzędzi AI; licencje/warunki użycia danych i komponentów; znane ograniczenia; sposób weryfikacji wyników/rekomendacji.

**Repo (4.3):** prywatne co najmniej do końca wydarzenia; dostęp dla jury wg instrukcji z Platformy (dodanie kont albo link). Po ogłoszeniu wyników do przekazania rozwiązania KOWR zwycięzcy trzymają repo niepubliczne i nie udostępniają rozwiązania osobom trzecim (§ 5 ust. 7).

**Technologie (5.1):** dowolne. AI dozwolone (generatywne, ML, NLP, wizja) — **obowiązek wskazania w dokumentacji zakresu i sposobu użycia AI**.

**Dostępność (5.4):** podstawowe funkcje bez płatnej licencji, specjalnego sprzętu, znajomości GIS, programowania, instalowania oprogramowania. Funkcje korzystające z płatnych usług trzeba jawnie wskazać wraz z kosztami utrzymania i alternatywami.

**Skalowalność (5.5):** musi działać dla dowolnej działki w Polsce; nie trzeba wykazywać wielu równoczesnych użytkowników. W dokumentacji opisać: radzenie sobie z limitami/dostępnością źródeł (cache, zapis wyników, ograniczanie zapytań), aktualizację danych i czas odpowiedzi przy większym ruchu, koszty infrastruktury.

**Bezpieczeństwo (5.6):** podstawowe zasady cyberbezpieczeństwa; unikać zbierania danych osobowych, jeśli niepotrzebne.

**Prawa autorskie (Regulamin § 2 ust. 10, § 5):**
- Rozwiązanie ma powstać **w trakcie wydarzenia**; dozwolone otwarte biblioteki, dane publiczne i narzędzia AI pod warunkiem wskazania w dokumentacji z licencjami i **o ile licencje pozwalają KOWR korzystać z rozwiązania** w zakresie § 5.
- Wybór zadania na Platformie = akceptacja regulaminu, w tym zasad przeniesienia praw.
- **Zwycięski zespół (wszyscy członkowie) zawiera z KOWR umowę o NIEODPŁATNE przeniesienie autorskich praw majątkowych** (wzór: Zał. 1), obejmujące kod źródłowy i dokumentację, pola eksploatacji z art. 74 ust. 4 (program komputerowy) i art. 50 ustawy o pr. aut., także prawo zezwalania na zależne prawa autorskie i własność nośników. Nagroda nie jest ekwiwalentem za przeniesienie praw.
- Niepodpisanie umowy przez któregokolwiek członka w 7 dni od przekazania = utrata nagrody przez cały zespół (nagroda może przejść na kolejny zespół z listy rankingowej).
- Oświadczenia o autorstwie i braku wad prawnych — pkt 6.1 i 6.2 Regulaminu Wydarzenia.

**Zespół:** 1–6 osób; wiążący skład z chwili upływu terminu przesyłania. Organizator może wymagać wstępnej wersji rozwiązania w pierwszym dniu. Zgłoszenie przesyła lider/upoważniony członek.

**RODO/wizerunek:** KOWR nie otrzymuje danych osobowych uczestników przy wyborze zadania, zgłoszeniu i ocenie; jury ocenia po nazwie zespołu (zalecane: bez imion i nazwisk). Finaliści mogą dać odrębną, dobrowolną zgodę (Zał. 4) na utrwalanie i rozpowszechnianie wizerunku/głosu/wypowiedzi (bez ograniczeń czasowych; możliwe przekazanie do państwa trzeciego w związku z serwerami); odmowa nie wpływa na ocenę. Brak decyzji zautomatyzowanych/profilowania w danych uczestników.

Dokumenty nie wymagają on-prem; brak wymogu RODO dla aplikacji poza zaleceniem unikania danych osobowych.

## 7. Ryzyka i niejasności / pytania do organizatora
- **Jury testuje prototyp na własnych działkach i datach historycznych (do 10 lat wstecz)** i porównuje z danymi referencyjnymi ukrytymi przed zespołami — nie wiadomo, jaka to metryka referencyjna (np. kategoria suszy IUNG?). Pytanie do mentora: jak mierzona będzie zgodność.
- Wymóg obliczania wyniku w locie z danych źródłowych (bieżących i 10-letnich) — ryzyko limitów API/czasu; cel ≤ 30 s na działkę. Konieczny cache i fallback, ale **bez gotowych, wcześniej przygotowanych rekomendacji**.
- Dla dat historycznych potrzebne archiwa (Sentinel-2, meteo, SoilGrids/IUNG) — pokrycie 10 lat i kompletność całego kraju do sprawdzenia.
- Brak podanych skal punktowych kryteriów; brak progu minimalnego poza 50% maks. punktów.
- Różnice względem naszego CLAUDE.md: finał to **ok. 2–3 min prezentacji + do 2 min pytań** (nie 5+5) i pokaz na żywo dla działek wskazanych przez jury; film **do 3 min** (nie 2); prezentacja PDF **do 10 slajdów**; nagroda **25 000 zł netto**.
- Przeniesienie praw majątkowych na KOWR dla zwycięzcy — potwierdzić z organizatorem, co z wcześniejszym kodem i bibliotekami zespołu (`packages/shared`), jeśli używamy go także w drugim zadaniu. Regulamin wymaga, by licencje komponentów pozwalały KOWR na użycie.
- Obca domena (agro/hydrologia) — rekomendacje muszą być zgodne z aktualną wiedzą naukową (kryterium 2); warto zarezerwować mentora (Bolewski, Gozdowski).
- Interpretacja satelitarna musi uwzględniać rodzaj uprawy; lista upraw i parametrów nie jest zdefiniowana — do ustalenia.
- Nawadnianie jest opcjonalne; retencja ma pierwszeństwo wg „Podstaw naukowych".
- W „Podstawach naukowych" są widoczne niedokończone redakcyjnie fragmenty (nawiasy z alternatywnymi sformułowaniami) — treść nie wpływa na wymagania.
