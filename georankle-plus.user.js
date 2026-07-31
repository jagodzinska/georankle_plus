// ==UserScript==
// @name         GeoRankle+
// @namespace    jago/georankle-stacked-solutions
// @version      1.4.0
// @description  Funktioniert für DREI Spiele: GeoRankle, GeoPaint UND GeoDecide. Zeigt am Spielende alle Lösungsboxen untereinander statt im Links/Rechts-Karussell (Pfeile/Punkte weg) und markiert im Lösungsvergleich rot, welche "Ideale Wahl" gar nicht mehr wählbar war, weil die Kategorie schon in einer früheren Runde verbraucht wurde. Aus historischen Gründen heißt das Skript "GeoRankle+", deckt aber alle drei Spiele ab.
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

  // Kategoriename ohne Rangangabe ("Ø Jahrestemperatur#4" -> "ø jahrestemperatur")
  const categoryKey = (s) => norm(s.replace(/#\s*\d+/g, '')).toLowerCase();

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

      const usedRound = usedInRound.get(idealKey);
      if (usedRound !== undefined && idealKey !== ownKey) {
        ideal.el.classList.add(LABEL_CLASS);
        idealCol.classList.add(IMPOSSIBLE_CLASS);
        idealCol.title =
          `War in Runde ${round} nicht mehr wählbar – ` +
          `"${norm(idealValue.replace(/#\s*\d+/g, ''))}" schon in Runde ${usedRound} benutzt`;
      }

      if (ownKey && !usedInRound.has(ownKey)) usedInRound.set(ownKey, round);
    }
  }

  let pending = 0;
  const schedule = () => {
    clearTimeout(pending);
    pending = setTimeout(apply, 200);
  };

  schedule();
  // React baut den Endscreen nach; deshalb bei DOM-Änderungen neu auswerten.
  // Wir beobachten nur childList/characterData, unsere eigenen Klassen- und
  // title-Änderungen lösen also keine Endlosschleife aus.
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
