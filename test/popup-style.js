'use strict';

// Transparent Electron windows clip CSS shadows at their own bounds. The
// Needs Input surface is only 12px from that boundary, so any outer shadow can
// turn into the dark rectangular strip reported in issue #7.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.html'), 'utf8');
const askRules = [...css.matchAll(/(?:^|\n)\.ask\s*\{([^}]*)\}/g)];

assert(askRules.length > 0, 'missing .ask surface rule');

// pet.css contains an early legacy rule and later focused overrides. Pick the
// dark surface rule explicitly instead of relying on source order.
const surfaceRule = askRules.map((m) => m[1]).find((rule) => /background\s*:\s*rgba\(26, 26, 29/.test(rule));
const layoutRule = askRules.map((m) => m[1]).find((rule) => /520px/.test(rule));
const shadow = surfaceRule && /box-shadow\s*:\s*([^;]+);/.exec(surfaceRule);

assert(shadow, 'final .ask rule must define its depth treatment explicitly');
assert(/^inset\b/.test(shadow[1].trim()), '.ask must not use an outer shadow inside the transparent pet window');
assert(/max-width\s*:\s*none\s*;/.test(surfaceRule), 'dark popup must override the legacy 290px width cap');
assert(/overflow\s*:\s*hidden\s*;/.test(surfaceRule), 'the popup shell itself must stay fixed');
assert(/\.ask-scroll\s*\{[^}]*overflow-y\s*:\s*auto\s*;[^}]*overflow-x\s*:\s*hidden\s*;/s.test(css), 'only the middle content region should scroll');
assert(/\.ask-scroll\s*\{[^}]*scrollbar-width\s*:\s*thin\s*;/s.test(css), 'content region should retain a compact vertical scroll affordance');
assert(/\.ask-scroll::-webkit-scrollbar\s*\{[^}]*width\s*:\s*6px\s*;[^}]*height\s*:\s*0\s*;/s.test(css), 'only the vertical scrollbar may take visible space');
assert(layoutRule && /max-height\s*:\s*min\(calc\(100vh - 210px\), 520px\)/.test(layoutRule), 'ask viewport must not fill the desktop');
assert(/\.ask-sess\s*\{[^}]*text-overflow\s*:\s*ellipsis\s*;/s.test(css), 'fixed session header must stay on one compact line');
assert(/\.ask-q[^}]*overflow-wrap\s*:\s*anywhere\s*;/s.test(css), 'long question and option text must wrap inside the card');
assert(/\.ask-toolbar\s*\{[^}]*display\s*:\s*flex\s*;/s.test(css), 'all footer actions should share one compact row');
assert(/class="ask-scroll"[^>]*>[\s\S]*class="ask-card"[\s\S]*class="ask-toolbar"/s.test(html), 'fixed header and toolbar must sit outside the scrolling content');
assert(/id="ask-back"[\s\S]*id="ask-submit"[\s\S]*id="ask-term"/s.test(html), 'footer actions should use back, submit, terminal order');
assert(/const POPUP_W = 520;/.test(js), 'popup window should provide more horizontal room');
assert(/const ASK_VIEWPORT_MAX_H = 520;/.test(js), 'ask measurement must use the same vertical cap');
assert(/window\.innerWidth[^\n]*targetW/.test(js), 'fitPopup must resize to the active surface width before measuring content height');
assert(/askScroll\.scrollTop\s*=\s*0/.test(js), 'switching questions or sessions must reset only the content scroll position');
assert(/\.sesslist\s*\{[^}]*max-height\s*:\s*calc\(100vh - 70px\)[^}]*overflow\s*:\s*hidden\s*;/s.test(css),
  'session popup shell must clip to the viewport instead of spilling across the desktop');
assert(/#sl-session-view\s*\{[^}]*min-height\s*:\s*0\s*;[^}]*display\s*:\s*flex\s*;[^}]*flex\s*:\s*1 1 auto\s*;/s.test(css),
  'session page must be a shrinkable flex column');
assert(/\.sl-scroll\s*\{[^}]*min-height\s*:\s*0\s*;[^}]*flex\s*:\s*1 1 auto\s*;[^}]*overflow-y\s*:\s*auto\s*;/s.test(css),
  'session rows must own vertical scrolling when the list exceeds the popup');
assert(/\.sl-foot\s*\{[^}]*flex\s*:\s*0 0 auto\s*;/s.test(css),
  'session footer must remain fixed while rows scroll');
assert(/\.sl-meme-grid\s*\{[^}]*min-height\s*:\s*0\s*;[^}]*flex\s*:\s*1 1 auto\s*;[^}]*overflow-y\s*:\s*auto\s*;/s.test(css),
  'meme choices must share the same bounded scrolling contract');
assert(/\.sl-travel-view\s*\{[^}]*min-height\s*:\s*0\s*;[^}]*flex\s*:\s*1 1 auto\s*;[^}]*overflow-y\s*:\s*auto\s*;/s.test(css),
  'travel page must own bounded vertical scrolling');
assert(/\.sl-travel-view\s*>\s*\*\s*\{[^}]*flex\s*:\s*0 0 auto\s*;/s.test(css),
  'travel sections must overflow into the page scroller instead of shrinking and clipping');
assert(/\.sl-travel-view::-webkit-scrollbar\s*\{[^}]*width\s*:\s*7px\s*;/s.test(css),
  'travel page must expose a visible vertical scroll affordance');
assert(/\.sl-travel-ranks\s*\{[^}]*grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css),
  'travel and whole-machine ranks must share one compact row');
assert(/id="sl-travel-rank-icons"[\s\S]*id="sl-machine-rank-icons"/s.test(html),
  'travel page must expose separate travel and whole-machine progression');
assert(/\.sl-travel-library\s*\{[^}]*grid-template-columns\s*:\s*148px minmax\(0,\s*1fr\)\s*;/s.test(css),
  'postcard album must live in a fixed sidebar beside the selected postcard');
assert(/\.sl-travel-postcard-text\s*\{[^}]*height\s*:\s*236px\s*;[^}]*overflow\s*:\s*hidden\s*;/s.test(css),
  'one postcard must fit as a complete page without a nested scrollbar');
assert(/\.sl-travel-stop-track\s*\{[^}]*overflow\s*:\s*hidden\s*;/s.test(css)
  && /\.sl-travel-stop-card\s*\{[^}]*display\s*:\s*none\s*;/s.test(css)
  && /\.sl-travel-stop-card\.active\s*\{[^}]*display\s*:\s*block\s*;/s.test(css),
  'station navigation must show exactly one postcard instead of horizontally bleeding adjacent cards');
assert(/\.sl-travel-history::-webkit-scrollbar\s*\{[^}]*width\s*:\s*6px\s*;/s.test(css),
  'postcard album must visibly advertise additional saved trips');
assert(/class="sl-travel-library"[\s\S]*class="sl-travel-album"[\s\S]*id="sl-travel-history"[\s\S]*id="sl-travel-postcard"/s.test(html),
  'postcard history must precede the selected postcard inside the side-by-side library');
assert(/const TRAVEL_POPUP_W = 760;/.test(js), 'travel library needs a wider surface than ordinary session popups');
assert(/#stage\.edge-below\s*\{[^}]*justify-content\s*:\s*flex-start\s*;/s.test(css),
  'top-edge mode must anchor the visible pet at the top of its transparent window');
assert(/#stage\.edge-below \.sesslist,[\s\S]*#stage\.edge-below \.todopop\s*\{[^}]*top\s*:\s*200px\s*;[^}]*bottom\s*:\s*auto\s*;/s.test(css),
  'cards must flip below a pet parked at the top edge');
assert(/\.sessions\s*\{[^}]*justify-content\s*:\s*center\s*;/s.test(css),
  'session dots must be centred inside the pet-width anchor');
assert(/body\.skin-pixel \.sessions\s*\{[^}]*width\s*:\s*200px\s*;[^}]*\}/s.test(css)
  && /body\.skin-mascot \.sessions\s*\{[^}]*width\s*:\s*252px\s*;[^}]*\}/s.test(css)
  && /body\.skin-cat \.sessions\s*\{[^}]*width\s*:\s*120px\s*;[^}]*\}/s.test(css),
  'each skin must align the session-dot box to its visible pet width');
assert(/anchoredLayoutPayload/.test(js) && /choosePopupLayout/.test(js),
  'renderer must preserve the visible pet anchor while changing popup direction');
assert(/wr\.y\s*<=\s*wa\.y\s*\+\s*3[\s\S]*screenY\s*=\s*wa\.y/.test(js),
  'a top-clamped transparent frame must snap the visible pet body to the work-area top');
assert(/PetGeometry\.radialLayout/.test(js),
  'right-click menu must use bounded edge-aware geometry');

console.log('popup style checks passed');
