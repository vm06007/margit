# Demo: finding a repository with evidence and a budget

Record a **2–3 minute screen walkthrough** of Margit Repository Advisor. Lead with the user outcome, then show the two API sources and actual results. Add the finished video URL to the main README and this folder's README.

Video: pending owner recording.

## Suggested sequence and narration

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:20 | Margit catalog and a listing | “Margit lets developers offer repository access. This Recipe helps a buyer compare seller-described offers with public GitHub metadata before deciding what to investigate.” |
| 0:20–0:40 | Published Recipe and its four bound tools | “We published one Bazantic Recipe backed by two live gateways: Margit's catalog and GitHub's repository, language and release APIs.” |
| 0:40–1:25 | Combined test inputs, four completed calls and result | “For a TypeScript AI dependency-fix tool and a $50 budget, the Recipe finds a seller-described match and compares the public repository I explicitly supplied. It distinguishes seller claims from verification and reports missing license and access terms.” |
| 1:25–2:10 | $0.04 case, omitted comparisons, all tools available, one actual call | “Now the budget is four cents. The five-cent option is rejected. With no comparison repository supplied, the Recipe makes no GitHub calls even though those tools are available.” |
| 2:10–2:40 | Published status, source repository and documentation | “The Recipe is published as margit-repository-advisor. The source includes the API specification, compact catalog implementation, prompt and reproduction guide. These are operator tests; no purchase or paid customer transaction occurs in this demonstration.” |

Use existing successful logs if the published view cannot run tests. Label them as recorded tests; do not imply a replay is a new live invocation. If shortening waiting periods, mark the cut. Do not unpublish just to obtain footage of editable fields.

## Exact test inputs

### A. Combined Margit + GitHub comparison

- Requirements: `A TypeScript tool that uses AI to help fix dependency vulnerabilities through GitHub pull requests.`
- Maximum repository budget: `50`
- Public GitHub repositories to compare: `vm06007/margit`
- Available tools: all four checked.
- Model: Claude Sonnet 4.6.

Observed result: catalog plus three GitHub calls completed. Patchdeck's seller description matched the requested use case at $0.05; the explicit public comparison did not establish the requested dependency-fix functionality. The answer disclosed missing license and access terms.

### B. Budget exclusion and optional comparisons

- Same requirements.
- Maximum repository budget: `0.04`
- Click **Omit public GitHub repositories to compare**.
- Keep all four tools available. Do not disable GitHub for this demonstration: the point is that the Recipe chooses not to call it.

Observed result: only `browse_catalog` ran; the $0.05 listing was over budget and no listing qualified. Current catalog prices may change, so inspect returned values when recording.

## Capture checklist

- Show published/read-only status and Recipe handle.
- Show the distinction between tools available and calls actually executed.
- Show both raw price data and the budget conclusion.
- Keep source links and uncertainty visible; do not market metadata as a code audit.
- Hide account secrets, wallet recovery material and private claim URLs. These tests require no secret to be shown.
- Include [the dashboard link](https://bazantic.com/dashboard/recipes/margit-repository-advisor) and handle in the video description; dashboard access may require authentication.

Suggested video title: **Margit Repository Advisor — two Bazantic gateways, one budget-aware comparison**.

Suggested submission description:

> Margit Repository Advisor combines live marketplace offers with explicitly requested public GitHub metadata through two Bazantic gateways. Users provide requirements, a repository budget and optional comparison repositories. The published Recipe produces qualified recommendations and identifies budget exclusions without buying or modifying repositories. The demo shows a successful combined workflow and a strict-budget case that skips GitHub when comparisons are omitted. Operator tests do not incur payment; paid customer execution has not been verified.

Do not claim this recording proves paid checkout, deterministic enforcement, improved accuracy against a baseline, or prize eligibility. A controlled with/without-Recipe comparison would need separate evidence.

## App-first recording after deployment

Start in **Margit → Catalog → Find with AI**. Enter the dependency-fix requirement and budget, optionally add `vm06007/margit`, then click **Get advice**. Record the loading state and returned result in the app. Show the Bazantic Recipe link as the provenance, then repeat with $0.04 and blank comparisons. This is stronger than a dashboard-only recording because it demonstrates Margit's actual backend invoking the published Recipe. Record only after this app version is deployed and verified; do not substitute the saved output example for a live result.
