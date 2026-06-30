// ==UserScript==
// @name         GeoRankle+
// @namespace    jago/georankle-stacked-solutions
// @version      1.3.0
// @description  Funktioniert für DREI Spiele: GeoRankle, GeoPaint UND GeoDecide. Zeigt am Spielende alle Lösungsboxen untereinander statt im Links/Rechts-Karussell (Pfeile/Punkte weg). Aus historischen Gründen heißt das Skript "GeoRankle+", deckt aber alle drei Spiele ab.
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
  `;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();
