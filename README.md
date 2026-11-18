# Drzewko — notatnik drzewiasty (PWA)

Notatnik w formie drzewa / mapy myśli. Czysty HTML + CSS + JavaScript, bez budowania (dołączone biblioteki mapy myśli leżą w `lib/`).
Działa offline, zapisuje dane lokalnie na urządzeniu, eksportuje i importuje pliki `.md`
oraz eksportuje mapę myśli do SVG, PNG i HTML.

## Wdrożenie na GitHub Pages

1. Utwórz repozytorium na GitHubie (np. `drzewko`).
2. Wgraj **zawartość tego folderu** do głównego katalogu repozytorium (`index.html` musi być w korzeniu).
3. W repozytorium: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   wybierz gałąź `main` i folder `/ (root)`, zapisz.
4. Po minucie aplikacja jest pod adresem `https://TWOJA-NAZWA.github.io/drzewko/`.

Wszystkie ścieżki w aplikacji są względne, więc działa zarówno pod `użytkownik.github.io/repo/`, jak i pod własną domeną.

## Instalacja na telefonie

- **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację* (lub przycisk w Ustawieniach aplikacji).
- **iPhone (Safari):** Udostępnij → *Do ekranu początkowego*.

## Obsługa

- Dolny pasek dodaje wpisy. Prefiks przy polu pokazuje poziom: `-`, `--`, `---`…
- Przyciski `⇥` / `⇤` przy polu zmieniają poziom nowego wpisu (na komputerze: **Tab** / **Shift+Tab**),
  dzięki czemu mapę myśli wpisuje się bez odrywania się od klawiatury.
- Przycisk **＋** przy notatce dodaje do niej podwęzeł.
- Tagi: wpisz `#tag` w treści (np. `Kupić mleko #zakupy`) albo dodaj je w oknie notatki.
- Dotknięcie notatki otwiera jej okno: edycja treści i tagów, data utworzenia, przesuwanie w górę/w dół,
  wcięcie/wysunięcie, usuwanie.
- Kolejność notatek głównych: złap ikonę ⠿ po lewej i przeciągnij (przy krawędzi ekranu lista sama się przewija). Z klawiatury: ustaw fokus na ikonie i użyj strzałek ↑ / ↓. Uchwyty są ukryte podczas wyszukiwania i filtrowania.
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

## During

- See the sights
```

- Całość: Ustawienia → **Eksport .md**. Jedna notatka z gałęziami: dotknij notatki → **Eksport notatki / gałęzi .md**
  (można też wyeksportować dowolne podwęzeł jako osobną mapę).
- Import rozpoznaje format markmap, zwykłe listy markdown z wcięciami (`-`, `*`, `+`, `1.`) oraz starszy format
  z myślnikami (`-`, `--`, `---`). Brakująca data oznacza „teraz”.
  Przy imporcie możesz dołączyć notatki do istniejących albo je zastąpić.

## Eksport mapy myśli (SVG / PNG / HTML)

Mapa jest rysowana w aplikacji biblioteką [markmap](https://github.com/markmap/markmap) (`lib/markmap-view.js` + `lib/d3.min.js`,
ładowane dopiero przy pierwszym eksporcie, są w cache service workera, więc działa offline).

- Cały notatnik: Ustawienia → **Mapa myśli** → SVG / PNG / HTML (korzeń mapy: „MindNotes”; gdy jest jedna notatka, ona jest korzeniem).
- Jedna notatka lub gałąź: dotknij notatki → **Mapa myśli (markmap)**.
- **SVG** – grafika wektorowa (tekst w `foreignObject`, jak w markmap: otworzy się w przeglądarce; edytory wektorowe mogą go źle wyświetlać).
- **PNG** – obraz na białym tle, do 2× rozdzielczości (z limitem rozmiaru dla telefonów).
- **HTML** – jeden samodzielny plik z interaktywną mapą (zoom, przesuwanie, zwijanie), bez internetu.
- Mapa zawiera wszystkie gałęzie, także zwinięte w aplikacji. Tagi i data nie są rysowane.
- Aktualizacja bibliotek: `lib/README.txt`.

## Aktualizacje

Aplikacja działa offline dzięki service workerowi (`sw.js`). Po zmianie dowolnego pliku **zwiększ `VERSION` w `sw.js`**
(np. `v1` → `v2`) — użytkownicy zobaczą wtedy komunikat „Dostępna nowa wersja” z przyciskiem *Odśwież*.

## Dane

Notatki są w `localStorage` przeglądarki, na danym urządzeniu i pod danym adresem. Nie synchronizują się między telefonami
i znikają po wyczyszczeniu danych strony — dlatego warto robić eksport `.md` jako kopię zapasową.
