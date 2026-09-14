# Taste
- Windows dev machine: POSIX utilities (`head`, `tail`, `mv`) are unavailable in the default shell — use PowerShell (`Invoke-WebRequest`, `Move-Item`, `Get-Content`) or cmd builtins (`del`, `dir`) for shell/file operations. Confidence: 0.9
- Global npm config sets `omit=dev` (devDependencies skipped by default) — install with a one-off `npm install --include=dev`; don't modify the user's global config. Confidence: 0.9
- `agent-browser` skill (headless Chromium/CDP) is available and is the right tool for verifying browser PoCs/builds end to end: open page, poll status, read results from localStorage JSON, screenshot evidence, then close. Confidence: 0.8
- PoC-first, benchmark-gated decisions: standalone HTML PoCs measuring cold start / compile / run / download size + a feature matrix, results recorded in `poc/RESULTS.md` (with screenshots), and the engine/dependency choice made only after applying the gate. Confidence: 0.7
- Prefer mirroring proven reference implementations (upstream playground code, sibling integration repos like fsharp-wasm/vb-wasm) over inventing new patterns. Confidence: 0.7
- When swapping an engine behind an existing API, keep the public API surface identical — existing embeds/templates/consumers must keep working unchanged. Confidence: 0.6
- Vendor/pin third-party runtime artifacts (checksums, pinned URLs) and document provenance + licenses in the README rather than hot-linking one-off CDNs — protects against bus-factor of small upstream forks. Confidence: 0.6
- Open-source engines only: reject proprietary runtimes whose licenses require payment for commercial/self-host use (CheerpJ was ruled out for LiveCodes); MIT/Apache preferred. Confidence: 0.6
- User gives terse go-aheads ("continue") — treat them as "proceed with your recommended defaults", state the locked-in decisions, and keep moving instead of re-asking decision questions. Confidence: 0.6
