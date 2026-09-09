import type { ReactNode } from "react";

/*
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// Lucide: https://github.com/lucide-icons/lucide/tree/94e4cb9d9db5907053ebf3636a97c45529cf776b/icons
// school, book-open, users-round, briefcase-business, circle-question-mark,
// monitor-smartphone (stand normalized to M10 15v4), wifi, calendar-check, hand-heart.
// Operational glyphs retain university outlines. Scholarship is original:
// mirrored hands and graduation cap, with optical stroke 1.5.
export const universityGlyphs = {
  "search": <>
    <path d="m21 21-4.3-4.3m2.3-5.2a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"/>
  </>,
  "chat": <>
    <path d="M5 5.5h14v10H9l-4 3v-13Z"/><path d="M8 9h8M8 12h5"/>
  </>,
  "video": <>
    <rect x="3.5" y="6" width="12" height="12" rx="2"/><path d="m15.5 10 5-3v10l-5-3"/>
  </>,
  "phone": <>
    <path d="M7 3.5h3l1.3 4-2 1.6a15 15 0 0 0 5.6 5.6l1.6-2 4 1.3v3c0 2-1.5 3.5-3.5 3.5A13.5 13.5 0 0 1 3.5 7C3.5 5 5 3.5 7 3.5Z"/>
  </>,
  "arrow": <>
    <path d="M5 12h14m-5-5 5 5-5 5"/>
  </>,
  "clock": <>
    <circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>
  </>,
  "menu": <>
    <path d="M4 7h16M4 12h16M4 17h16"/>
  </>,
  "close": <>
    <path d="m6 6 12 12M18 6 6 18"/>
  </>,
  "chevron": <>
    <path d="m9 18 6-6-6-6"/>
  </>,
  "check": <>
    <path d="m5 12 4 4 10-10"/>
  </>,
  "warning": <>
    <path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4m0 3h.01"/>
  </>,
  "school": <>
    <path d="M14 21v-3a2 2 0 0 0-4 0v3" /> <path d="M18 4.933V21" /> <path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6" /> <path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11" /> <path d="M6 4.933V21" /> <circle cx="12" cy="9" r="2" />
  </>,
  "book": <>
    <path d="M12 5v16" /> <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />
  </>,
  "people": <>
    <path d="M18 21a8 8 0 0 0-16 0" /> <circle cx="10" cy="8" r="5" /> <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
  </>,
  "work": <>
    <path d="M12 12h.01" /> <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /> <path d="M22 13a18.15 18.15 0 0 1-20 0" /> <rect width="20" height="14" x="2" y="6" rx="2" />
  </>,
  "help": <>
    <circle cx="12" cy="12" r="10" /> <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /> <path d="M12 17h.01" />
  </>,
  "devices": <>
    <path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8" /> <path d="M10 15v4" /> <path d="M7 19h5" /> <rect width="6" height="10" x="16" y="12" rx="2" />
  </>,
  "wifi": <>
    <path d="M12 20h.01" /> <path d="M2 8.82a15 15 0 0 1 20 0" /> <path d="M5 12.859a10 10 0 0 1 14 0" /> <path d="M8.5 16.429a5 5 0 0 1 7 0" />
  </>,
  "calendar": <>
    <path d="M8 2v3" /> <path d="M16 2v3" /> <rect x="3" y="3" width="18" height="18" rx="2" /> <path d="M3 9h18" /> <path d="m9 15 2 2 4-4" />
  </>,
  "hand-heart": <>
    <path d="M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16" /> <path d="m14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95" /> <path d="m2 15 6 6" /> <path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91" />
  </>,
  "scholarship": <>
    <path d="m6 4.5 6-3 6 3-6 3-6-3Z"/><path d="M8 6v3c2.5 1.3 5.5 1.3 8 0V6"/><path d="M6.5 17 4.6 15.1a1.4 1.4 0 0 1 2-2L9 15.5a3 3 0 0 1 .9 2.1V22H5v-2l-2.1-2.5a3.5 3.5 0 0 1-.9-2.3V10a1.5 1.5 0 0 1 3 0v2.8"/><g transform="translate(24 0) scale(-1 1)"><path d="M6.5 17 4.6 15.1a1.4 1.4 0 0 1 2-2L9 15.5a3 3 0 0 1 .9 2.1V22H5v-2l-2.1-2.5a3.5 3.5 0 0 1-.9-2.3V10a1.5 1.5 0 0 1 3 0v2.8"/></g>
  </>,
} as const satisfies Record<string, ReactNode>;
