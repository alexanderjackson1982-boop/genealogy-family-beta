# Family browser beta acceptance

Reviewed 13 October 2026. Status: published and checked at https://alexanderjackson1982-boop.github.io/genealogy-family-beta/. Repository: https://github.com/alexanderjackson1982-boop/genealogy-family-beta. No real family data was used.

| Check | Result |
| --- | --- |
| Original v0.6 release | All 92 file hashes and its release ZIP unchanged. |
| Original release baseline | 287 tests pass in an isolated copy; Claude’s 11 red-team scripts reproduced; 50 supplied mutations rejected. |
| Browser importer and deployment boundaries | 33 automated tests pass, including the generated worker’s real execution and safe error output. |
| Gregorian date compatibility | 234 independently compared date cases match v0.6’s bounds/precision/qualifier fields. |
| Real-browser behaviour | 18 recorded boolean checks pass in Edge: consent, date/conflict display, withdrawal, clear, inactivity/hard expiry, late/stale results, failures/timeouts, page exit, resource cleanup and embedding guard. |
| Network and persistence | Four initial static GET requests; zero HTTP requests after selecting invented GEDCOM. No cookies, local/session storage or IndexedDB observed. All 12 test workers terminated and Blob URLs revoked. |
| Worker network isolation | Independent native-browser probe confirmed that attempted fetch and WebSocket connections from a fixed Blob worker were blocked by inherited policy, with no probe requests sent. |
| Final source/bundle consistency | Build check verifies the deployed parser worker is generated from the reviewed parser source. |
| Final visual and privacy check | In-app browser reviewed desktop/narrow layouts, recorded dates, family links and an empty privacy flag withholding a historical ancestor in the final bundle. Clear resets file, consent and visible tree. |
| Public deployment files | Exactly six reviewed static files under docs; no real GEDCOM, original engine, synthetic evidence repository or credentials. |

Live deployment checks passed: HTTP redirects to HTTPS; the TLS certificate validates; all six static files match their reviewed SHA-256 hashes; module MIME types are correct. Pages enforces HTTPS and publishes main/docs. The restrictive content policy is unchanged. A live invented GEDCOM import showed three historical ancestors, withheld one living test person, displayed both conflicting birth dates, navigated family connections and cleared the visible tree, consent and file selection. The no-network and expiry checks above were performed before deployment against the identical application files. The father’s actual genealogy export remains untested; start with a small reviewed branch on his own device.

The beta conservatively withholds people with no unambiguous recorded death before 1926, including recently deceased relatives. It supports UTF-8 GEDCOM 5.5.1 only. It omits raw records, notes, source prose, media, contact fields and unsupported event payloads. Automated name/place screening cannot guarantee anonymity; review the export manually.

Application deletion releases its references and prevents further access. Suspended tabs clear expired data on resume. No forensic memory-erasure or deletion of local source files, screenshots, operating-system artifacts or host visit metadata is promised.

The interface and code can be public as requested; the GEDCOM is processed locally in the visitor’s browser. No synthetic discovery, evidence evaluator, AI integration or archive retrieval is included.
