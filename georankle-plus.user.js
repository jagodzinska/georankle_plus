// ==UserScript==
// @name         GeoRankle+
// @namespace    jago/georankle-stacked-solutions
// @version      1.0.0
// @description  Zeigt am Spielende alle 8 Lösungsboxen des Lösungsvergleichs untereinander statt im Links/Rechts-Karussell.
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

  // Der Lösungsvergleich ("Lösungsvergleich") rendert bereits ALLE 8 Boxen in
  // einem horizontalen Scroll-Snap-Karussell. Der einzige Container mit der
  // Klassenkombination snap-x + snap-mandatory + no-scrollbar ist genau dieses
  // Karussell – die Kinder sind die einzelnen Lösungsboxen (w-full flex-none
  // snap-start). Statt DOM umzubauen, kippen wir das Karussell per CSS in eine
  // vertikale Spalte; React verwaltet das DOM weiter, unsere Stylesheet-Regel
  // bleibt über Re-Renders hinweg bestehen.
  const STYLE_ID = 'georankle-plus-style';
  if (document.getElementById(STYLE_ID)) return;

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
    /* Pfeil-/Punkt-Navigation ausblenden (zeigt jetzt eh alles) */
    div:has(> button[aria-label="Previous analysis page"]),
    div:has(> button[aria-label="Next analysis page"]) {
      display: none !important;
    }
  `;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();
