# Drzewko — notatnik drzewiasty (PWA)

Notatnik w formie drzewa / mapy myśli. Czysty HTML + CSS + JavaScript, bez budowania (dołączone biblioteki mapy myśli leżą w `lib/`).
Działa offline, zapisuje dane lokalnie na urządzeniu, eksportuje i importuje pliki `.md`
eksportuje mapę myśli do SVG, PNG i HTML oraz sformatowany widok notatek do HTML.

## Instalacja na telefonie

- **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację* (lub przycisk w Ustawieniach aplikacji).
- **iPhone (Safari):** Udostępnij → *Do ekranu początkowego*.

## Obsługa

- Dolny pasek dodaje wpisy. Pole rośnie razem z tekstem (do 4 wierszy, potem się przewija); **Enter** dodaje wpis. Gdy wybrana jest notatka, nad polem pojawia się wiersz „↳ tytuł” z poziomem (`-`, `--`, `---`…) i przyciskami zmiany poziomu. Po dodaniu nowego tematu (notatki głównej) kolejne wpisy domyślnie trafiają pod niego — wyłączysz to w Ustawieniach → *Dodawanie*.
- Przyciski `⇤` / `⇥` nad polem zmieniają poziom nowego wpisu (na komputerze: **Tab** / **Shift+Tab**),
  dzięki czemu mapę myśli wpisuje się bez odrywania się od klawiatury. Okrągły przycisk **＋** przy polu dodaje wpis.
- Przycisk **＋** przy notatce dodaje do niej podwęzeł (bez wchodzenia w nią).
- Rozwijanie: dotknij dużej lewej kolumny wiersza (strzałka ˅ / ›) albo licznika „+3” przy zwiniętej gałęzi. Dotknięcie samego tekstu zawsze otwiera edycję.
- **› w wynikach wyszukiwania:** każdy wynik (po słowie lub tagu) ma przycisk **›**. Przy notatce z podgałęziami wchodzi w jej wątek, przy wpisie bez podgałęzi otwiera wątek jego rodzica (razem z sąsiednimi wpisami, a szukany wpis zostaje na chwilę podświetlony). Wejście zamyka wyszukiwanie.
- **Wejście w notatkę (widok wątku):** cienka strzałka **›** po prawej (przy notatkach z podgałęziami), **przytrzymanie** strzałki **>** po lewej (ok. 0,5 s) albo przycisk **„Wejdź w wątek”** w oknie edycji (działa też dla notatki bez podgałęzi) pokazuje tylko tę notatkę i jej podgałęzie — z nagłówkiem, ścieżką „Wszystkie › … ›” i przyciskiem **←** u góry. Wyjście: ←, dotknięcie wybranego poziomu w ścieżce, „wstecz” w telefonie lub **Esc** na komputerze. W widoku wątku pasek dodawania domyślnie dodaje pod bieżącą notatką (⇤ nieaktywne na jej poziomie). Wyszukiwanie zawsze przeszukuje cały notatnik. Po ponownym uruchomieniu aplikacji wracasz do widoku „Wszystkie”.
- Ulubione: gwiazdka ★ w wierszu z tagami (zaraz po tagach) oznacza ulubioną notatkę główną; przełączasz ją w oknie notatki („Dodaj do ulubionych”) albo gwiazdką w nagłówku widoku wątku. Filtr ulubionych jest w wyszukiwarce (lupa). W pliku `.md` ulubione nadal oznacza znak ★ w komentarzu (zgodność z wcześniejszymi eksportami).
- Ikona aplikacji obok napisu „MindNotes” u góry jest przyciskiem: zwija wszystkie gałęzie (zostają same tytuły notatek głównych).
- Tagi: wpisz `#tag` w treści (np. `Kupić mleko #zakupy`) albo dodaj je w oknie notatki.
- Dotknięcie notatki otwiera jej okno: edycja treści i tagów, data utworzenia, przesuwanie w górę/w dół,
  wcięcie/wysunięcie, usuwanie.
- Kolejność notatek głównych: przytrzymaj palec na tytule notatki (ok. 0,4 s, telefon krótko zawibruje) i przeciągnij; przy krawędzi ekranu lista sama się przewija. Na komputerze wystarczy złapać tytuł myszą. Z klawiatury: Alt + ↑ / ↓ na wybranej notatce. Przeciąganie jest wyłączone podczas wyszukiwania i filtrowania.
- Linki: adresy `https://…` i `www.…` we wpisach są rozpoznawane i skracane do domeny; dotknięcie adresu edytuje wpis (przesuwanie i przeciąganie działają jak zawsze), a link otwiera dopiero ikonka ↗ obok adresu — w nowej karcie przeglądarki. Licznik ukrytych gałęzi (+N) jest tylko informacją — rozwija strzałka po lewej. W eksporcie „Widok .html” też są linkami.
- Formatowanie: `**pogrubienie**`, `*kursywa*`, `~~przekreślenie~~`, `==zakreślenie==`. Zadania: `[ ] do zrobienia` i `[x] zrobione` na początku tekstu — przy notatce pojawia się pole wyboru, które zaznaczasz dotknięciem. W oknie notatki są przyciski B / I / S / H oraz ☑ (przełącza: brak → `[ ]` → `[x]` → brak).
- Archiwum notatek głównych: przesuń notatkę palcem **w prawo**, aby przenieść ją do archiwum, albo **w lewo**, aby ją usunąć (oba ruchy można cofnąć przyciskiem „Cofnij”). Za krótkie przesunięcie wraca na miejsce. To samo jest w oknie notatki: „Przenieś do archiwum”.
- Przycisk archiwum (pudełko, z licznikiem) u góry otwiera listę zarchiwizowanych tematów. W archiwum przesunięcie w prawo **przywraca** notatkę, w lewo usuwa ją na stałe (też z „Cofnij”). Archiwum ma własne wyszukiwanie i tagi.
- Lupa: wyszukiwanie i filtrowanie po tagach.
- Ustawienia: motyw (jasny / ciemny / systemowy), rozmiar czcionki, format eksportu, eksport i import.

## Format `.md`

Eksport jest zgodny z [markmap.js.org](https://markmap.js.org): notatka to `#`, jej podwęzły to `##`,
a głębsze poziomy to lista z wcięciem dwóch spacji. Tagi i data (tylko węzeł główny) są w komentarzu pod nagłówkiem,
więc mapa ich nie wyświetla:

```
# Trip
<!-- 2026-11-16 08:45 #podróże -->

## Before

- Book flights
- Pack
  - temporary 1
  - temporary 2
    - temporary 2.1
    - temporary 2.2

## During

- See the sights
```

- Całość: Ustawienia → **Eksport .md**. Jedna notatka z gałęziami: dotknij notatki → **Eksport notatki / gałęzi .md**
  (można też wyeksportować dowolne podwęzeł jako osobną mapę).
- Import rozpoznaje format markmap, zwykłe listy markdown z wcięciami (`-`, `*`, `+`, `1.`) oraz starszy format
  z myślnikami (`-`, `--`, `---`). Brakująca data oznacza „teraz”. Eksport `.md` zawiera także archiwum: notatka zarchiwizowana ma w komentarzu pod nagłówkiem znacznik 📦, więc import ją odtwarza.
  Przy imporcie możesz dołączyć notatki do istniejących albo je zastąpić.

## Eksport sformatowanego widoku (.html)

Ta sama treść co w pliku `.md`, ale jako gotowa, sformatowana strona: notatka to nagłówek `<h1>` (z datą, ★ / 📦 i tagami),
podwęzły to `<h2>`, głębsze poziomy to zagnieżdżone listy. Działają **pogrubienie**, *kursywa*, ~~przekreślenie~~, ==zakreślenie== i zadania `[ ]` / `[x]` (rysowane jako pola wyboru).

- Całość: Ustawienia → Kopia zapasowa → **Widok .html** (jak w `.md` — razem z notatkami z archiwum, oznaczonymi 📦).
- Jedna notatka lub gałąź: dotknij notatki → **Sformatowany widok .html**.
- Samodzielny plik bez skryptów i bibliotek, działa bez internetu; jasny/ciemny motyw według ustawień systemu, ładnie się drukuje (Ctrl+P → PDF).
- To nie jest kopia zapasowa — pliku `.html` nie da się zaimportować (do tego służy `.md`).

## Eksport mapy myśli (SVG / PNG / HTML)

Mapa jest rysowana w aplikacji biblioteką [markmap](https://github.com/markmap/markmap) (`lib/markmap-view.js` + `lib/d3.min.js`,
ładowane dopiero przy pierwszym eksporcie, są w cache service workera, więc działa offline).

- Cały notatnik: Ustawienia → **Mapa myśli** → SVG / PNG / HTML (korzeń mapy: „MindNotes”; gdy jest jedna notatka, ona jest korzeniem).
- Jedna notatka lub gałąź: dotknij notatki → **Mapa myśli (markmap)**.
- **SVG** – grafika wektorowa (tekst w `foreignObject`, jak w markmap: otworzy się w przeglądarce; edytory wektorowe mogą go źle wyświetlać).
- **PNG** – obraz na białym tle, do 2× rozdzielczości (z limitem rozmiaru dla telefonów).
- **HTML** – jeden samodzielny plik z interaktywną mapą (zoom, przesuwanie, zwijanie), bez internetu.
- Zadania `[ ]` / `[x]` i `==zakreślenie==` są rysowane na mapie (pole wyboru i żółte tło). W pliku `.md` pola wyboru działają w markmap.js.org na liście (poziom 3 i głębiej); w nagłówkach (`#`, `##`) markmap pokaże `[x]` jako zwykły tekst.
- Mapa z Ustawień nie zawiera notatek z archiwum (pojedynczą zarchiwizowaną notatkę wyeksportujesz w jej oknie).
- Mapa zawiera wszystkie gałęzie, także zwinięte w aplikacji. Tagi i data nie są rysowane.
- Aktualizacja bibliotek: `lib/README.txt`.

## Wersety biblijne (offline)

W notatce wpisz `@` i namiar, np. `@J 3,16`, `@Ps 23,1-3`, `@1 Kor 13,4-7`, `@Rz 8,28.30` albo `@Ps 23` (cały rozdział).
Po zatwierdzeniu (Enter w polu nowej notatki albo zamknięcie okna notatki) namiar zamienia się w tekst:
`„…” (J 3,16 UBG)`; przy kilku wersetach każdy ma numer w nawiasie `[16]`. Rozpoznawane są polskie skróty (Rdz, Ps, Mt, Łk, J, Rz, 1Kor, Hbr, Obj…) i pełne nazwy (Jan, Jana, Psalm, Rzymian…).
Podczas pisania nad polem pojawiają się **podpowiedzi** (księga → rozdział → werset); na komputerze `Tab` przyjmuje pierwszą, a podgląd tekstu wersetu widać tylko na szerokim ekranie.
Nierozpoznany namiar zostaje bez zmian, a aplikacja pokaże komunikat.

- Tekst: **Uwspółcześniona Biblia Gdańska (UBG)**, © 2018 Fundacja Wrota Nadziei, licencja **CC BY-ND 4.0** — tekst wolno rozpowszechniać
  bez zmian słów i interpunkcji, z podaniem praw autorskich i źródła (jest w Ustawieniach). Źródło: <https://ebible.org/details.php?id=polubg>.
- Plik `lib/ubg.json` (~4 MB, ~1,3 MB po kompresji) jest ładowany dopiero przy pierwszym użyciu i trzymany w osobnym cache service workera
  (`bible-ubg-v1`), więc nie pobiera się go przy każdej aktualizacji aplikacji. Po zmianie pliku zmień nazwę `BIBLE_CACHE` w `sw.js`.
- Plik wygenerowano z `polubg_usfm.zip` (eBible.org): usunięto tylko znaczniki USFM (w tym `\add` oznaczające słowa dodane przez tłumaczy), słowa i interpunkcja bez zmian.

## Aktualizacje

Aplikacja działa offline dzięki service workerowi (`sw.js`). Po zmianie dowolnego pliku **zwiększ `VERSION` w `sw.js`**
(np. `v1` → `v2`) — użytkownicy zobaczą wtedy komunikat „Dostępna nowa wersja” z przyciskiem *Odśwież*.

## Dane

Notatki są w `localStorage` przeglądarki, na danym urządzeniu i pod danym adresem. Nie synchronizują się między telefonami
i znikają po wyczyszczeniu danych strony — dlatego aplikacja robi automatyczne kopie lokalne (Ustawienia → *Automatyczne kopie*):

1. **Migawki w IndexedDB** — do 3 ostatnich kopii; powstają po zmianach (nie częściej niż co 3 godziny, tylko gdy dane się zmieniły),
   przy starcie, przy zamknięciu karty oraz zawsze tuż przed importem, „Usuń wszystkie notatki” i przywróceniem kopii.
   Listę (data, liczba notatek) i przycisk *Przywróć* znajdziesz w Ustawieniach. Kopie są w tej samej przeglądarce co notatki,
   więc czyszczenie danych strony usuwa też je.
2. **Automatyczny zapis pliku `.md` na dysku** — tylko Chrome/Edge na komputerze (File System Access API; na iOS i w Safari
   opcja jest ukryta). Wybierasz plik (np. w folderze OneDrive/Dysku Google), a aplikacja aktualizuje go po zmianach.
   Po ponownym uruchomieniu przeglądarka może poprosić o ponowne zezwolenie — przycisk pojawi się w Ustawieniach.
3. **Przypomnienie** — jeśli od kilku dni (domyślnie 3 na telefonie, 7 na komputerze; do zmiany w Ustawieniach) nie zrobiono eksportu, udostępnienia ani zapisu pliku, po starcie pojawia się komunikat
   z przyciskiem *Zrób kopię* (na telefonach otwiera menu udostępniania). Najpewniejsza kopia na iOS/Androidzie to `.md` zapisany w chmurze lub wysłany sobie.

Eksport `.md` nadal warto robić ręcznie od czasu do czasu.

## Autor
Autor projektu: Krystian — [krysus@gmail.com](mailto:krysus@gmail.com)
