// ==UserScript==
// @name         GeoRankle+
// @namespace    jago/georankle-stacked-solutions
// @version      2.0.1
// @description  Funktioniert für DREI Spiele: GeoRankle, GeoPaint UND GeoDecide. Markiert im Lösungsvergleich rot, welche "Ideale Wahl" gar nicht mehr wählbar war, weil die Kategorie schon in einer früheren Runde verbraucht wurde. Bei GeoRankle steht außerdem unter jeder Lösungsbox, welchen Rang das Land in ALLEN Kategorien des Tages hat. Aus historischen Gründen heißt das Skript "GeoRankle+", deckt aber alle drei Spiele ab. Die Lösungsboxen untereinander statt im Blätterer macht seit 2.0.0 das eigene Skript "Geotrivia Lösungen untereinander".
// @author       jago/claude
// @license      MIT
// @homepageURL  https://github.com/jagodzinska/georankle_plus
// @supportURL   https://github.com/jagodzinska/georankle_plus/issues
// @downloadURL  https://raw.githubusercontent.com/jagodzinska/georankle_plus/main/georankle-plus.user.js
// @updateURL    https://raw.githubusercontent.com/jagodzinska/georankle_plus/main/georankle-plus.user.js
// @match        https://geotrivia.com/*
// @icon         https://geotrivia.com/georankle-icon.png
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // nicht in Ad-iframes laufen

  // Gilt für DREI Spiele: GeoRankle (Lösungsvergleich), GeoPaint und GeoDecide.
  //
  // Seit dem Umbau (Sept. 2026) steht das Spielende in `.daily-result-screen`;
  // "Lösung ansehen" blendet einen Blätterer ein: ein Track mit ALLEN Lösungs-
  // boxen nebeneinander (style="width: 800%"). Das Aufklappen zu einer Liste
  // übernimmt das Skript "Geotrivia Lösungen untereinander"; hier wird nur
  // markiert und ergänzt, das funktioniert in beiden Darstellungen.
  const GAME_PATH = /\/(georankle|geopaint|geodecide)(\/|$)/;
  const STYLE_ID = 'georankle-plus-style';
  if (document.getElementById(STYLE_ID)) return;

  const IMPOSSIBLE_CLASS = 'grp-impossible';
  const LABEL_CLASS = 'grp-ideal-label';
  const RANKS_CLASS = 'grp-all-ranks';

  const css = `
    /* Ideale Wahl, die zu diesem Zeitpunkt gar nicht mehr wählbar war:
       Zeile (Kategorie + Rang) rot, die Überschrift "Ideale Wahl" bleibt grau. */
    .${IMPOSSIBLE_CLASS} :not(.${LABEL_CLASS}) {
      color: #dc2626 !important;
    }
    /* Rang-Übersicht unter jeder GeoRankle-Lösungsbox */
    /* zweispaltig, wenn Platz ist; auf dem Handy einspaltig statt abgeschnitten */
    .${RANKS_CLASS} .grp-rank-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(12.5rem, 1fr));
      column-gap: 0.5rem;
      row-gap: 1px;
    }
    .${RANKS_CLASS} .grp-rank-row {
      display: flex;
      justify-content: space-between;
      gap: 0.25rem;
      min-width: 0;
      padding: 1px 0.25rem;
      border-radius: 0.375rem;
    }
    .${RANKS_CLASS} .grp-rank-cat {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .${RANKS_CLASS} .grp-rank-val {
      flex: none;
      white-space: nowrap;
    }
  `;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
  const onGamePage = () => GAME_PATH.test(location.pathname);

  // Track des Blätterers = Kind des Rahmens (overflow-hidden + touch-pan-y)
  // mit prozentualer Inline-Breite; seine Kinder sind die einzelnen Boxen.
  function findTracks() {
    return [
      ...document.querySelectorAll(
        '.daily-result-screen div.overflow-hidden.touch-pan-y > div[style*="width"]',
      ),
    ].filter((t) => t.children.length > 0);
  }

  // ---------------------------------------------------------------------------
  // Rot-Markierung der unmöglichen "Idealen Wahl"
  //
  // Die Boxen im Lösungsvergleich stehen in Rundenreihenfolge (Runde 1..N). Jede Kategorie
  // kann pro Spiel nur einmal benutzt werden. Also: DOM-Reihenfolge durchgehen,
  // die eigenen Wahlen mitschreiben und bei jeder Box prüfen, ob deren ideale
  // Kategorie schon in einer FRÜHEREN Runde von mir verbraucht wurde.
  // ---------------------------------------------------------------------------
  const OWN_LABEL = /^(deine wahl|dein tipp|your (pick|choice|guess))$/i;
  const IDEAL_LABEL = /^(ideale wahl|optimale wahl|beste wahl|ideal (pick|choice)|best (pick|choice))$/i;

  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  // Kategoriename ohne Rangangabe ("Ø Jahrestemperatur#4" -> "ø jahrestemperatur").
  // Achtung: der Rang kann auch "#100+" lauten, das "+" muss mit weg – sonst
  // passt "bevölkerungsdichte+" nie zu "bevölkerungsdichte".
  const stripRank = (s) => norm(s.replace(/#\s*\d+\s*\+*/g, ''));
  const categoryKey = (s) => stripRank(s).toLowerCase();

  // Lange Kategorienamen werden von der Seite gekürzt ("Hauptstadtbevölker…").
  // Solche Namen nur per Präfix vergleichen.
  const ELLIPSIS = /(?:…|\.\.\.)$/;
  const sameCategory = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    if (ELLIPSIS.test(a)) return b.startsWith(a.replace(ELLIPSIS, ''));
    if (ELLIPSIS.test(b)) return a.startsWith(b.replace(ELLIPSIS, ''));
    return false;
  };

  // Runde, in der ich diese Kategorie schon verbraucht habe (oder undefined).
  function roundUsedIn(usedInRound, key) {
    const exact = usedInRound.get(key);
    if (exact !== undefined) return exact;
    for (const [usedKey, usedRound] of usedInRound) {
      if (sameCategory(usedKey, key)) return usedRound;
    }
    return undefined;
  }

  // Vom Label aus so weit hoch, bis der Container auch den Wert enthält.
  function columnFor(label) {
    const labelText = norm(label.textContent);
    let node = label.parentElement;
    for (let i = 0; i < 4 && node; i++) {
      if (norm(node.textContent).length > labelText.length) return node;
      node = node.parentElement;
    }
    return null;
  }

  function valueOf(column, label) {
    let text = '';
    for (const child of column.children) {
      if (child === label || child.contains(label)) continue;
      text += ' ' + child.textContent;
    }
    // Fallback, falls Label und Wert im selben Element als Textknoten stehen
    if (!norm(text)) text = norm(column.textContent).slice(norm(label.textContent).length);
    return norm(text);
  }

  function collectLabels() {
    const out = [];
    for (const el of document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6')) {
      if (el.childElementCount > 0) continue; // nur Blattknoten
      const text = norm(el.textContent);
      if (!text || text.length > 24) continue;
      if (OWN_LABEL.test(text)) out.push({ el, kind: 'own' });
      else if (IDEAL_LABEL.test(text)) out.push({ el, kind: 'ideal' });
    }
    return out; // querySelectorAll liefert Dokumentreihenfolge
  }

  function apply() {
    for (const el of document.querySelectorAll('.' + LABEL_CLASS)) el.classList.remove(LABEL_CLASS);
    for (const el of document.querySelectorAll('.' + IMPOSSIBLE_CLASS)) {
      el.classList.remove(IMPOSSIBLE_CLASS);
      el.removeAttribute('title');
    }

    const labels = collectLabels();
    const usedInRound = new Map(); // Kategorie -> Runde, in der ich sie benutzt habe
    let round = 0;

    for (let i = 0; i + 1 < labels.length; i++) {
      const own = labels[i];
      const ideal = labels[i + 1];
      // Jede Box liefert genau ein Paar "Deine Wahl" -> "Ideale Wahl".
      if (own.kind !== 'own' || ideal.kind !== 'ideal') continue;
      i++; // Paar verbraucht

      const ownCol = columnFor(own.el);
      const idealCol = columnFor(ideal.el);
      if (!ownCol || !idealCol) continue;

      round++;
      const ownKey = categoryKey(valueOf(ownCol, own.el));
      const idealValue = valueOf(idealCol, ideal.el);
      const idealKey = categoryKey(idealValue);

      const usedRound = roundUsedIn(usedInRound, idealKey);
      if (usedRound !== undefined && !sameCategory(idealKey, ownKey)) {
        // ganze Zeile (Icon, Label + Kategorie, Rang) markieren
        const row = idealCol.parentElement || idealCol;
        ideal.el.classList.add(LABEL_CLASS);
        row.classList.add(IMPOSSIBLE_CLASS);
        row.title =
          `War in Runde ${round} nicht mehr wählbar – ` +
          `"${stripRank(idealValue)}" schon in Runde ${usedRound} benutzt`;
      }

      if (ownKey && roundUsedIn(usedInRound, ownKey) === undefined) {
        usedInRound.set(ownKey, round);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Ränge des Landes in ALLEN Kategorien (nur GeoRankle)
  //
  // Die Seite hat die Ränge aller Tagesländer in allen Tageskategorien bereits
  // im React-State (countryCategoryRanks), zeigt am Ende aber nur "Deine Wahl"
  // und "Ideale Wahl". Wir lesen die Daten über den React-Fiber des Blätterers
  // aus und hängen unten in jede Lösungsbox eine Übersicht. Welche Box zu
  // welchem Land gehört, verrät der Dateiname der Flagge
  // (/_next/static/media/ie.<hash>.webp – das alt-Attribut ist leer).
  // ---------------------------------------------------------------------------
  const isGameData = (v) =>
    !!v && typeof v === 'object' && !!v.countryCategoryRanks &&
    !!v.categoryMeta && Array.isArray(v.categories) && Array.isArray(v.gameCountries);
  // Verlauf = pro Runde {category, rank, countryCode, ...}
  const isHistory = (v) =>
    Array.isArray(v) && v.length > 0 &&
    v.every((m) => m == null || (typeof m === 'object' && 'category' in m && 'countryCode' in m));

  function fiberOf(el) {
    for (const key in el) if (key.startsWith('__reactFiber$')) return el[key];
    return null;
  }

  // Vom Blätterer aus die Komponenten hochlaufen und deren Hooks durchsuchen.
  // useMemo-Hooks speichern [Wert, deps]; der gemergte Datensatz der Spiel-
  // komponente liegt so vor (bei Archiv-Tagen ist das der richtige). Rohe
  // Store-Werte nehmen wir nur als Fallback.
  function findGameState(el) {
    for (let f = fiberOf(el), depth = 0; f && depth < 80; f = f.return, depth++) {
      let data = null, rawData = null, history = null;
      let h = f.memoizedState;
      for (let n = 0; h && typeof h === 'object' && 'next' in h && n < 300; h = h.next, n++) {
        const ms = h.memoizedState;
        const memo = Array.isArray(ms) && ms.length === 2 && Array.isArray(ms[1]) ? ms[0] : undefined;
        if (!data && isGameData(memo)) data = memo;
        if (!rawData && isGameData(ms)) rawData = ms;
        if (!history && isHistory(memo)) history = memo;
      }
      data = data || rawData || (isGameData(f.memoizedProps?.initialData) ? f.memoizedProps.initialData : null);
      if (data) return { data, history };
    }
    return null;
  }

  // wie formatGeoRankleRank der Seite: ab 100 (oder ohne Wert) "#100+"
  const formatRank = (r) =>
    typeof r !== 'number' || !Number.isFinite(r) || r >= 100 ? '#100+' : `#${r}`;

  function renderRanks(card, code, { data, history }) {
    const ranks = data.countryCategoryRanks[code] || {};
    const hasValues = data.countryCategoryHasValues?.[code] || {};
    const own = history?.[data.gameCountries.indexOf(code)]?.category;
    const ideal = data.optimalResult?.assignment?.[code]?.category;

    const rows = data.categories.map((cat) => {
      const meta = data.categoryMeta[cat] || {};
      return {
        cat,
        label: `${meta.icon ? meta.icon + ' ' : ''}${meta.label || cat}`,
        rank: hasValues[cat] === false ? '–' : formatRank(ranks[cat]),
      };
    });

    // Nur neu zeichnen, wenn sich etwas geändert hat – sonst würde jede eigene
    // Änderung über den MutationObserver den nächsten Durchlauf auslösen.
    const sig = JSON.stringify([code, own, ideal, rows]);
    let box = card.querySelector(`:scope > .${RANKS_CLASS}`);
    if (box && box.dataset.sig === sig) return;
    if (!box) {
      box = document.createElement('div');
      box.className = `${RANKS_CLASS} flex flex-col gap-1.5`;
      box.style.padding = '0.5rem 0.625rem'; // Karte selbst hat kein Padding
      card.appendChild(box);
    }
    box.dataset.sig = sig;
    box.textContent = '';

    const grid = document.createElement('div');
    grid.className = 'grp-rank-grid font-sans text-xs text-foreground';
    box.append(grid);

    for (const row of rows) {
      const el = document.createElement('div');
      el.className = 'grp-rank-row';
      const hints = [];
      if (row.cat === own) { el.classList.add('bg-muted/40', 'font-bold'); hints.push('Deine Wahl'); }
      if (row.cat === ideal) hints.push('Ideale Wahl');
      el.title = row.label + (hints.length ? ` (${hints.join(', ')})` : '');

      const label = document.createElement('span');
      label.className = 'grp-rank-cat';
      label.textContent = row.label;
      const value = document.createElement('span');
      value.className = 'grp-rank-val font-black';
      value.textContent = (row.cat === ideal ? '★ ' : '') + row.rank;
      el.append(label, value);
      grid.appendChild(el);
    }
  }

  const flagCode = (img) => {
    const m = /\/([a-z]{2})\.[^/]*$/i.exec(img.getAttribute('src') || '');
    return m ? m[1].toUpperCase() : img.alt;
  };

  function applyRanks() {
    for (const track of findTracks()) {
      const state = findGameState(track);
      if (!state) continue; // GeoPaint/GeoDecide: keine Rangdaten
      for (const slide of track.children) {
        const img = slide.querySelector('img');
        const card = slide.querySelector('.bg-card');
        if (!img || !card) continue;
        const code = flagCode(img);
        if (state.data.countryCategoryRanks[code]) renderRanks(card, code, state);
      }
    }
  }

  function run() {
    style.disabled = !onGamePage();
    if (!onGamePage()) return;
    apply();
    try {
      applyRanks();
    } catch (e) {
      console.warn('[GeoRankle+] Rang-Übersicht fehlgeschlagen:', e);
    }
  }

  let pending = 0;
  const schedule = () => {
    clearTimeout(pending);
    pending = setTimeout(run, 200);
  };

  schedule();
  // React baut den Endscreen nach; deshalb bei DOM-Änderungen neu auswerten.
  // Wir beobachten childList/characterData und aria-hidden (Wechsel zwischen
  // Ergebnis und Lösung); unsere eigenen Klassen- und title-Änderungen lösen
  // also keine Endlosschleife aus. Die Rang-Übersicht fügt zwar Knoten
  // ein, zeichnet aber nur bei geänderten Daten neu (sig).
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-hidden'],
  });
})();
