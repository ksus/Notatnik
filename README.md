# Drzewko — notatnik drzewiasty (PWA)

Notatnik w formie drzewa / mapy myśli. Czysty HTML + CSS + JavaScript, bez zależności i bez budowania.
Działa offline, zapisuje dane lokalnie na urządzeniu, eksportuje i importuje pliki `.md`.

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
- Lupa: wyszukiwanie i filtrowanie po tagach.
- Ustawienia: motyw (jasny / ciemny / systemowy), rozmiar czcionki, format eksportu, eksport i import.

## Format `.md`

Domyślnie (po jednym myślniku więcej na każdy poziom):

```
- Projekt aplikacji #praca · 2026-11-16 08:45
-- Zadanie B #pilne #ważne · 2026-11-16 08:45
--- Szczegół B1 · 2026-11-16 08:45
- Drugi wpis · 2026-11-16 08:46
```

Drugi format do wyboru w Ustawieniach to klasyczne wcięcia (`  - podwęzeł`).
Import rozpoznaje oba formaty, a także zwykłe listy markdown z wcięciami (`-`, `*`, `+`, spacje lub tabulatory).
Brakująca data oznacza „teraz”. Przy imporcie możesz dołączyć notatki do istniejących albo je zastąpić.

## Aktualizacje

Aplikacja działa offline dzięki service workerowi (`sw.js`). Po zmianie dowolnego pliku **zwiększ `VERSION` w `sw.js`**
(np. `v1` → `v2`) — użytkownicy zobaczą wtedy komunikat „Dostępna nowa wersja” z przyciskiem *Odśwież*.

## Dane

Notatki są w `localStorage` przeglądarki, na danym urządzeniu i pod danym adresem. Nie synchronizują się między telefonami
i znikają po wyczyszczeniu danych strony — dlatego warto robić eksport `.md` jako kopię zapasową.
