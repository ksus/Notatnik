Biblioteki używane do eksportu mapy myśli (SVG / PNG / HTML). Ładowane leniwie, dopiero przy pierwszym eksporcie.

- d3.min.js          d3 7.x            licencja ISC   https://github.com/d3/d3
- markmap-view.js    markmap-view 0.18.13 (zawiera markmap-common)   licencja MIT   https://github.com/markmap/markmap
  (plik dist/browser/index.js z pakietu npm markmap-view; wymaga globalnego `d3`, udostępnia `window.markmap`)

Aktualizacja: npm install d3@7 markmap-view, skopiuj node_modules/d3/dist/d3.min.js
oraz node_modules/markmap-view/dist/browser/index.js, potem zwiększ VERSION w sw.js.

Tekst Biblii (wstawianie wersetów @J 3,16):
- ubg.json           Uwspółcześniona Biblia Gdańska (UBG)   © 2018 Fundacja Wrota Nadziei   licencja CC BY-ND 4.0
  Źródło: https://ebible.org/details.php?id=polubg (polubg_usfm.zip). Tekst bez zmian słów i interpunkcji; z USFM usunięto tylko znaczniki.
  Format: { meta, order[], books: { ID: { n: nazwa, a: skrót, c: [ [werset1, werset2, ...], ... rozdziały ] } } }
  Przy zmianie pliku zmień nazwę BIBLE_CACHE w sw.js.
