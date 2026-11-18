Biblioteki używane do eksportu mapy myśli (SVG / PNG / HTML). Ładowane leniwie, dopiero przy pierwszym eksporcie.

- d3.min.js          d3 7.x            licencja ISC   https://github.com/d3/d3
- markmap-view.js    markmap-view 0.18.13 (zawiera markmap-common)   licencja MIT   https://github.com/markmap/markmap
  (plik dist/browser/index.js z pakietu npm markmap-view; wymaga globalnego `d3`, udostępnia `window.markmap`)

Aktualizacja: npm install d3@7 markmap-view, skopiuj node_modules/d3/dist/d3.min.js
oraz node_modules/markmap-view/dist/browser/index.js, potem zwiększ VERSION w sw.js.
