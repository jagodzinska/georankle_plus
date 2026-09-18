// ==UserScript==
// @name         GeoRankle+
// @namespace    jago/georankle-stacked-solutions
// @version      1.5.0
// @description  Funktioniert für DREI Spiele: GeoRankle, GeoPaint UND GeoDecide. Zeigt am Spielende alle Lösungsboxen untereinander statt im Links/Rechts-Karussell (Pfeile/Punkte weg) und markiert im Lösungsvergleich rot, welche "Ideale Wahl" gar nicht mehr wählbar war, weil die Kategorie schon in einer früheren Runde verbraucht wurde. Bei GeoRankle steht außerdem unter jeder Lösungsbox, welchen Rang das Land in ALLEN Kategorien des Tages hat. Aus historischen Gründen heißt das Skript "GeoRankle+", deckt aber alle drei Spiele ab.
// @author       jago/claude
// @license      MIT
// @match        https://geotrivia.com/*
// @icon         https://geotrivia.com/georankle-icon.png
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // nicht in Ad-iframes laufen

  // Gilt für DREI Spiele: GeoRankle (Lösungsvergleich), GeoPaint und GeoDecide.
  // Alle rendern am Ende bereits ALLE Lösungsboxen in einem horizontalen Scroll-
  // Snap-Karussell mit identischer Klassenkombination snap-x + snap-mandatory +
  // no-scrollbar (die Kinder sind die einzelnen Boxen, w-full flex-none
  // snap-start). Statt DOM umzubauen, kippen wir das Karussell per CSS in eine
  // vertikale Spalte; React verwaltet das DOM weiter, unsere Stylesheet-Regel
  // bleibt über Re-Renders hinweg bestehen.
  const STYLE_ID = 'georankle-plus-style';
  if (document.getElementById(STYLE_ID)) return;

  const IMPOSSIBLE_CLASS = 'grp-impossible';
  const LABEL_CLASS = 'grp-ideal-label';
  const RANKS_CLASS = 'grp-all-ranks';

  const css = `
    /* Karussell -> vertikale Liste: alle Boxen untereinander */
    div.snap-x.snap-mandatory.no-scrollbar {
      flex-direction: column !important;
      overflow: visible !important;
      scroll-snap-type: none !important;
      gap: 0.5rem;
    }
    /* einzelne Lösungsboxen volle Breite, kein horizontales Snappen */
    div.snap-x.snap-mandatory.no-scrollbar > div {
      width: 100% !important;
      scroll-snap-align: none !important;
    }
    /* Pfeil-/Punkt-Navigation ausblenden (zeigt jetzt eh alles).
       GeoRankle: "... analysis page", GeoPaint & GeoDecide: "... solution page". */
    div:has(> button[aria-label="Previous analysis page"]),
    div:has(> button[aria-label="Next analysis page"]),
    div:has(> button[aria-label="Previous solution page"]),
    div:has(> button[aria-label="Next solution page"]) {
      display: none !important;
    }
    /* Ideale Wahl, die zu diesem Zeitpunkt gar nicht mehr wählbar war:
       Wert (Kategorie + Rang) rot, die Überschrift "Ideale Wahl" bleibt grau. */
    .${IMPOSSIBLE_CLASS} > :not(.${LABEL_CLASS}),
    .${IMPOSSIBLE_CLASS} > :not(.${LABEL_CLASS}) * {
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

  // ---------------------------------------------------------------------------
  // Rot-Markierung der unmöglichen "Idealen Wahl"
  //
  // Die Boxen im Lösungsvergleich stehen in Rundenreihenfolge (Runde 1..N, die
  // richtig geratenen Runden tragen statt "Runde N" ein Häkchen). Jede Kategorie
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
        ideal.el.classList.add(LABEL_CLASS);
        idealCol.classList.add(IMPOSSIBLE_CLASS);
        idealCol.title =
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
  // und "Ideale Wahl". Wir lesen die Daten über den React-Fiber des Karussells
  // aus und hängen unten in jede Lösungsbox eine Übersicht. Welche Box zu
  // welchem Land gehört, verrät die Flagge (img alt = Ländercode, z. B. "IE").
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

  // Vom Karussell aus die Komponenten hochlaufen und deren Hooks durchsuchen.
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
      card.appendChild(box);
    }
    box.dataset.sig = sig;
    box.textContent = '';

    const divider = document.createElement('div');
    divider.className = 'h-px bg-border/50 w-full';
    const grid = document.createElement('div');
    grid.className = 'grp-rank-grid font-sans text-xs text-foreground';
    box.append(divider, grid);

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

  function applyRanks() {
    for (const carousel of document.querySelectorAll('div.snap-x.snap-mandatory.no-scrollbar')) {
      const state = findGameState(carousel);
      if (!state) continue; // GeoPaint/GeoDecide: keine Rangdaten
      for (const img of carousel.querySelectorAll('img[alt]')) {
        if (!state.data.countryCategoryRanks[img.alt]) continue;
        const card = img.closest('div.bg-card');
        if (card) renderRanks(card, img.alt, state);
      }
    }
  }

  function run() {
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
  // Wir beobachten nur childList/characterData, unsere eigenen Klassen- und
  // title-Änderungen lösen also keine Endlosschleife aus. Die Rang-Übersicht
  // fügt zwar Knoten ein, zeichnet aber nur bei geänderten Daten neu (sig).
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
