# Genealogy Engine family browser beta

A public website that reads a GEDCOM entirely in the visitor’s browser, with automatic privacy filtering. No family file is uploaded, saved by the application, added to a repository or sent to an archive/AI service.

The original Genealogy Engine v0.6 Python prototype stays unchanged. This separate browser importer supports a limited GEDCOM 5.5.1 UTF-8 subset. It is a family-tree viewer with imported assertions and generic family links; it does not evaluate genealogical evidence or generate synthetic discoveries.

## What your father does

1. Export his normal tree as GEDCOM 5.5.1 with UTF-8 encoding, within the 5 MiB and other import limits below. There is no need to remove people or edit the source tree. Living/unknown people and private material may remain in the file; the viewer filters what it displays on his device.
2. Open the website in a current browser, read the processing notice and check its consent box.
3. Choose his `.ged` or `.gedcom` file and select **Read my tree**. The file stays on his device.
4. Search names, select ancestors and compare recorded dates/family links with his source program. Multiple birth dates remain visible without a preferred conclusion.
5. Select **Clear my tree** when finished. Reloading or leaving the page clears the viewer too.

The conservative first-beta policy displays only people whose recorded death dates are bounded before 1926 and whose records are not restricted or contradictory. Living, unknown, recently deceased and private records are automatically withheld. This is display eligibility, not a factual determination of death. No manual removal is required to use the viewer. Automatic text screening is incomplete; check displayed names and places before sharing screenshots.

Only supported names, places, dates, opaque session identifiers, citation counts and eligible family connections are displayed. Notes, source prose, media, contact fields, unstructured event prose and raw GEDCOM are omitted. Input limits are 5 MiB, 50,000 fields, depth 32 and 65,536 characters per line, with additional event/relationship output limits.

## Processing and retention

Reading requires explicit consent. A dedicated browser worker parses the file and returns a small privacy projection, then terminates. The viewer uses no cookies, localStorage, IndexedDB, service worker, analytics or persistent family-data cache. After loading its own static code, it sends no family data or parsing requests over the network. The content policy denies connection and form-submission channels; parser code is bundled locally into a worker that inherits that policy.

The session expires after 30 minutes without activity or two hours after reading. Active pages check expiry regularly; a suspended tab clears expired data when execution resumes. **Clear my tree**, withdrawing consent, replacement import and leaving/reloading the page release the application’s state. This does not promise forensic memory erasure or deletion of the father’s source file, screenshots, browser history or operating-system spill. Use a trusted, updated browser/device with disk encryption.

There are no server family datasets, server backups or deletion requests to manage. Father retains and backs up his original locally. GitHub records ordinary website-visit metadata such as IP addresses; it never receives a GEDCOM from this viewer. [GitHub Pages data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)

## GitHub setup

Repository: [alexanderjackson1982-boop/genealogy-family-beta](https://github.com/alexanderjackson1982-boop/genealogy-family-beta). The public website uses GitHub Pages with the main branch and /docs folder. Its address is https://alexanderjackson1982-boop.github.io/genealogy-family-beta/. The owner can withdraw the site through Settings → Pages.

The deployment directory contains only six reviewed files: `index.html`, `styles.css`, `app.mjs`, `gedcom.mjs`, `parser-worker-source.mjs` and `.nojekyll`. Publish only that directory. Never add a real GEDCOM, parsed tree, family image, screenshot, export, credential or content-bearing feedback to GitHub, its build logs or artifacts. The ignore file reduces mistakes but is not a substitute for inspecting every staged file.

## Test and preview locally

Node.js 22 or later runs the dependency-free test suite. From the unpacked repository directory:

```sh
node build.mjs --check
node --test tests/*.test.mjs
python3 -B -m http.server 8781 --bind 127.0.0.1 --directory docs
```

Open `http://127.0.0.1:8781/`. The Python command only serves static files for review; family processing occurs in the browser. Stop this temporary server after reviewing. Opening `index.html` directly as a local file may block module scripts; use the loopback preview or HTTPS site.

If the parser changes, run `node build.mjs` to regenerate the reviewed worker bundle, then repeat the checks. The build script reads parser code only; it never reads a GEDCOM.

## Maintain the GitHub Pages setup

1. Select the intended GitHub account and a dedicated repository, provisionally `genealogy-family-beta`. A public repository works with GitHub Free. Do not republish the full development engine.
2. Inspect the exact files, then commit the supplied repository contents with no family data or credentials. The public `docs` folder contains only the six static viewer files.
3. In the repository’s **Settings → Pages**, select **Deploy from a branch**, branch **main**, folder **/docs**. No custom domain or paid hosting is required for the supplied `github.io` address. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
4. Enable **Enforce HTTPS**. Verify the published address and module MIME types from a fresh browser. [HTTPS settings](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
5. Repeat consent, invented-tree import, privacy, no-upload and clear/expiry checks at the actual published address before father uses his real file. Confirm GitHub serves the reviewed release, including its restrictive content policy. No real family data is needed for deployment checks.
6. Give father the website address through your chosen channel. He opens and reads his own file; do not ask him to commit or attach it to GitHub or this chat.

To withdraw the beta, unpublish Pages and remove its deployed artifacts. There is no family dataset on GitHub to delete. The code and website are public under this setup; the GEDCOM stays local.
