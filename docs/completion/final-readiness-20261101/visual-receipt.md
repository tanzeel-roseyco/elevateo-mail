# Client visual inspection — 2026-11-01

Screenshots were opened and inspected, not merely generated. Browser images come from the running fixture entry and the served production artifact with intercepted synthetic API responses in the pinned Playwright container. They do not establish real backend or native Android behavior.

| Capture | Inspection |
| --- | --- |
| `screenshots/web-drafts-1440.png` | Desktop light draft list: readable navigation, list and action placement. |
| `screenshots/web-reader-light-1440.png` | Desktop light reader: readable message and collaboration panels; hostile script is plain text and simulation is labelled. |
| `screenshots/web-reader-dark-1440.png` | Repaired desktop dark reader: readable metadata and notes help; hostile markup remains plain text. |
| `screenshots/web-note-dark-1440.png` | Repaired desktop dark populated note: readable author and white body text on a dark card; form remains below the card. |
| `screenshots/web-reader-light-390.png` | Mobile light reader: stacked controls and notes remain readable; full-page capture includes content below the fixed simulation notice. |
| `screenshots/web-reader-dark-390.png` | Repaired mobile dark reader: readable metadata, empty notes and help text; escaped hostile content and simulation notice remain visible. |
| `screenshots/web-note-light-390.png` | Mobile light populated note: readable author/body and stacked note form. |
| `screenshots/web-note-dark-390.png` | Mobile dark populated note: readable author/body on the repaired dark card, no horizontal overflow. |
| `screenshots/web-error-light-390.png` | Mobile error: explicit failure and visible retry; no fabricated rows or horizontal overflow. |
| `screenshots/web-dark-search-1440.png` | Desktop dark search: readable results; hostile image markup stays visible plain text. |
| `screenshots/web-dark-save-uncertain-1440.png` | Desktop dark uncertain-save state: draft text retained, warning and retry/reconcile controls visible. The composer is internally scrolled in this end-of-test capture. |
| `screenshots/web-inbox-390.png` | Mobile inbox: readable row and fixture labels, no horizontal overflow. |
| `screenshots/web-drawer-390.png` | Mobile navigation drawer: readable navigation and active focus; full-page capture includes content below the viewport. |
| `screenshots/windows-960.png` | Actual Avalonia/Skia view: reader/composer visible; assistant hidden at the narrow desktop breakpoint. |
| `screenshots/windows-1280.png` | Actual Avalonia/Skia view: assistant visible alongside reader/composer; simulation labelled. |

Dark reader inspection identified low-contrast secondary text; its repair and regression results are recorded in the final browser receipt. The interrupted first browser matrix exposed stale API fixtures, which are repaired separately; it is not counted as a passing suite. Native Windows sign-in was observed through accessibility, but the capture provider returned overlapping-app pixels. Those screenshots were discarded. Android runtime inspection is not claimed: Docker Desktop has 4,103,761,920 bytes of RAM, below the requested 8 GB emulator prerequisite.
