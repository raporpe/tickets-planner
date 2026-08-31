# Session Context

## Current Focus

Working on the **Bing API upgrade** epic (#10459410) and the **Security Vulnerabilities** epic (#10495923) under the **C2 Work** hierarchy in the **SAN SA** project. Most recent work: created "Security Vulnerabilities" epic, moved WebPush dashboard task under it. Ongoing VisualSearch/ApiInvoker diagnostic work under C3 epic #10681024 (latest: test3visualsearch endpoint #10914016).

## Work Item Hierarchy

```
Epic #10459254 - C2 Work (top-level C2 planning)
├── Epic #10385745 - Home page refresh (Soran Zana Alatas)
├── Epic #10459402 - Visual search - Default to SRP
├── Epic #10459404 - News/discovery feed
├── Epic #10459405 - SFI (Service Feature Integration) (Nicolas Lattuada)
├── Epic #10459406 - Releases - biweekly cadence (Tianpei Li)
├── Epic #10459407 - MiniApps - sunset ManageappsFeatureFlag (Samuel Morin)
├── Epic #10459408 - iOS - Swift 6 migration planning (Tianpei Li)
├── Epic #10459411 - iOS - platform updates bundle (Paula Boyano Ivars)
├── Epic #10459422 - User Voice + Data improvements (Claire Wang)
├── Epic #10459540 - Rewards
├── Epic #10459543 - Notifications
│   ├── Epic #10459429 - Notifications - Throttle testing and increasing engagement (P1, Raul)
│   ├── Epic #10459431 - Notifications - Personalized mini flight (P3, unassigned)
│   ├── Epic #10459531 - End to end notifications testing (P1, Jiarui Gui)
│   └── Task #10703199 - Set up Bicep infra deployment pipeline for WorldCup Notifications (Raul, Active, PR #6687977)
├── Epic #10495923 - Security Vulnerabilities (Raul)
│   ├── Task #10495859 - Create WebPush service monitoring dashboard in Grafana (Raul, Closed)
│   └── Task #10461699 - Remove traffictype authentication bypass vulnerabilities (Raul, Active, PR #6469827)
├── Epic #10465721 - Operational Fixes ("keep the lights on" unplanned work)
│   ├── Task #10465729 - [iOS] Fix versioning of BingVisualSearch on RC 33.0 (Marina, Closed)
│   ├── Task #10465748 - [iOS] Centralize app versioning to avoid mismatches (New)
│   ├── Task #10466091 - Notification Hub registration debugging for IcM 731993800 (Raul, Closed)
│   ├── Task #10466092 - Notification broadcast endpoint auditing (Raul, Closed)
│   └── Task #10588420 - [Android] Fix ad fetch retry storm — exp backoff + circuit breaker (Raul, New, PR #6585380)
└── Epic #10459410 - Bing API upgrade (P1, Gemma Fornons Sera)
    ├── Task #10446982 - Add authentication to Sapphire Bing token broker or decommission it
    ├── Task #10446969 - (existing child)
    ├── Task #10441934 - (existing child)
    ├── User Story #10442031 - [BE] New Sapphire Proxy API (Raul, Active, Feb 2026)
    │   ├── Task #10446977 - Coordinate with Bing API team on APIinvoker work (C2)
    │   ├── Task #10446980 - Implement anti-abuse/anti-scraping protections on new proxy endpoints
    │   ├── Task #10464841 - Confirm Bing China endpoints do not require extra work
    │   ├── Task #10647581 - Scaffold Sapphire answer with heartbeat endpoint (Part 1) (Raul, Active)
    │   ├── Task #10652759 - Implement Sapphire VisualSearch endpoint (Part 2) (Raul, Active)
    │   ├── Task #10653095 - Implement Sapphire Search endpoint (Part 3) (Raul, Active, PR #6642851)
    │   ├── Task #10656400 - Implement Sapphire Trends endpoint (Part 4) (Raul, Active, PR #6646472)
    │   ├── Task #10656625 - Implement Sapphire Suggestions endpoint (Part 5) (Raul, Active, PR #6646621)
    │   ├── Task #10657145 - Add VisualSearch request size limit 2.5MB (Raul, Active, PR #6642343)
    │   ├── Task #10657196 - Implement Sapphire Places Autosuggest endpoint (Part 6) (Raul, Active, PR #6647270)
    │   ├── Task #10660885 - Wire up Sapphire Search endpoint routing/DI/config (Part 7) (Raul, Active, PR #6647416)
    │   └── Task #10703212 - Add isolated HTTP workaround for Sapphire VisualSearch upstream (Raul, Active, PR #6672495)
    ├── Task #10684833 - Create Grafana dashboard for Sapphire Bing API Proxy monitoring (snrcode) (Raul, Active)
    ├── User Story #10460173 - (existing child, Related to 10442031)
    ├── User Story #10464892 - Review other backends and miniapps using BingAPIs (Raul, New, Mar 2026) (NEW)
    │   ├── Task #10464894 - Review miniapps BingAPI usage
    │   └── Task #10464895 - Review backend services BingAPI usage
    ├── User Story #10464832 - BingAPI capacity planning and limit increases (Raul, New, Mar 2026) (NEW)
    │   ├── Task #10399198 - Increase API limits to reduce 429s (Raul, Active, Feb 2026)
    │   └── Task #10446975 - Request capacity increase for 91B3... appID via capacity council (Raul, New)
    └── User Story #10460157 - Deprecate and decommission token machines (Raul, New, Mar 2026)
        ├── Task #10460159 - Inventory all token machines and their Azure resources
        ├── Task #10460160 - Request Azure permissions to modify/delete token machine resources
        ├── Task #10460161 - Evaluate all consumers of token machines
        └── Task #10460162 - Execute deletion of token machine Azure resources

Epic #10317577 - Fundamentals
├── Feature #10372598 - SFI (security tracking, many user stories)
└── Feature #10377255 - Fix BingAPI usage in the codebase
    ├── User Story #10377293 - Evaluate all usages of BingAPI (Gemma Fornons Sera)
    ├── User Story #10399351 - New endpoints for bing API calls (Gemma, Active)
    ├── Task #10399204 - Integrate bingapis.com metrics into Grafana dashboard (Raul, Closed, Feb 2026)
    ├── Task #10399205 - Evaluate current BingAPI impact across our services (Raul, Closed, Feb 2026)
    └── Task #10406404 - Document missing Bing API App ID (Raul, New)
```

Note: Epic #10459410 is a **separate epic** from Feature #10377255. Tasks #10399198 and #10446975 were moved from direct children of Epic #10459410 to children of new User Story #10464832. C2 Work now has **14 child epics** (Security Vulnerabilities added 2026-03-17).

## Key Learnings

- **Identity resolution**: Use `raulpo@microsoft.com` in AssignedTo fields. Display name search fails.
- **Task creation**: SAN SA project requires Tasks to be created as "New", then updated to "Active" in a second call.
- **Iteration paths**: Current iteration is `SAN SA\Month\2026.03`.
- **Project ID**: `2579b442-0817-40f1-8ec8-19e6fb5794c6`
- **Epic #10459410 core metric**: "Token brokers no longer in use" — directly addressed by User Story #10460157.
- **REST tag updates**: When updating `System.Tags` via `az rest` PATCH, use `op="replace"` — `op="add"` (and `az boards work-item update --fields "System.Tags=..."`) silently no-ops when tags already exist. Also build the URI as a variable (`$org + "/_apis/wit/workitems/" + $id + "?api-version=7.1"`) — inline `$id?api-version` mangles in PowerShell. **`az rest` also needs `--resource 499b84ac-1321-427f-aa17-267ca6975798`** (the Azure DevOps AAD resource GUID) or it fails with "Can't derive appropriate Azure AD resource" → TF400813 Unauthorized. Pass the JSON-patch body via a temp file (`--body @path`) to avoid PowerShell quoting issues.

## Last Actions (2026-08-31)

1. Created Task #11119718 "Remove webpush-token service and all related infrastructure": **child of Round 2 deprecation #11035272**, Active, Raul, iteration 2026.03, tags `20260831; security; SFI; cost`, P2. PR #6519744 (SapphirePlatform repo, SAN SA project, branch `users/raulpo/remove-webpush-token-service` → main) linked as artifact link. Removes the entire webpush-token Nx app (apps/web-push/token/) + CD pipelines (code-token-cd.yaml PME/Prod + Dev/Test), package.json scripts, token App Service module in main.bicep, and the ~2,090-line tokenDeployment ARM block in .ev2 main.template.json. Intentionally leaves libs/web-push/encryption/ (WebPushEncryptionService/WebPushTokenKey shared infra). Related: #11107260 (BingSearchTranslator removal).

1. Closed Bug #11119225 (Sev 1 CDN/AFD 403 incident handling). Created follow-up Task #11119368 "PIR for Sev 1 IcM 856399605 (Sapphire CDN/AFD 403 to App Services)": parent Operational Fixes epic #10465721 (C2), Active, Raul, iteration 2026.03, tags `20260831; incident; PIR; security`, P1. Post-Incident Review: timeline, root cause (network config change blocking AFD→App Service, traced to Azure config mod associated with Manas Sarangi), impact analysis, contributing factors, repair/action items (Azure Policy on App Service network access, change-review, AFD→App Service 403 alerting), linking repair items to #11095072. Related: #11119225 (handling), #11095072 (App Services network review).

1. Created two incident Bugs under **Operational Fixes** epic #10465721 (C2 keep-the-lights-on), Raul, iteration 2026.03:
   - Bug #11119223 "Drop in weather daily forecast notifications on Bing Native App (IcM 856259094)" — Active, P2 / Sev 3, tags `20260831; incident; Notifications; Weather`. Daily-forecast weather notifications dropped; companion to severe-weather drop #11036012 (different category). Investigate window/root cause, restore, add monitoring. Related: #11036012.
   - Bug #11119225 "Sev 1 handling: Sapphire CDN (AFD) 403 to App Services - network config change (IcM 856399605)" — Active, P1 / Sev 1, tags `20260824; incident; security; SFI`. Sev 1 IcM 856399605: Azure change → Sapphire CDN (Azure Front Door) got 403s reaching backend App Services; ~75% of Sapphire Mobile stack down (notifications + BingViz telemetry ingestion). Root cause per Raul: network config change blocked AFD→App Service traffic; traced to Azure config modification associated with Manas Sarangi. This item = incident handling; the broad App Services network review is the separate #11095072. Related: #11095072.

1. Created Task #11119169 "[VoiceSearch][Backend] Support Gemma on VoiceSearch service creation (design, token broker, security)": parent **US #10681019** "Voice Search Service Migration" (Gemma), Active, Raul, iteration 2026.03, tags `20260831; backend; VoiceSearch`, P2. Reflects Raul's collaboration supporting Gemma on the new VoiceSearch backend service — design/architecture support + reviews across Azure Speech STT provisioning (F1 #11102076), Falcon token-machine service `/voice/speech-token` + App Attest (F2 #11102077), and monitoring/attack detection (F5 #11102078); pairing on scaffolding, token-broker pattern, secret handling (revoke leaked Azure Speech key). Discovered the VoiceSearch work item set under US #10681019 (parent Feature #10611479). Related: #11102076, #11102077, #11102078.
   - Note: WIQL `CONTAINS` on Title kept timing out (VS402335); `CONTAINS WORDS` via `az rest` POST to /_apis/wit/wiql worked. Found VoiceSearch set via titles containing 'voice'/'TTS'.

## Last Actions (2026-08-27)

1. Created Task #11107623 "Remove deprecated Gaokao service": **child of Round 2 deprecation #11035272**, Active, Raul, iteration 2026.03, tags `20260824; security; SFI; cost`, P2. Remove the deprecated/unused Gaokao service + related code & Azure resources (confirm no live consumers/traffic, identify code/App Service/RG/pipelines, remove + decommission, rotate any secrets). Related: #11107260 (BingSearchTranslator removal).

1. Created Task #11107260 "Remove dead BingSearchTranslator service": **child of Round 2 deprecation #11035272**, **Closed**, Raul, iteration 2026.03, tags `20260824; security; SFI; cost`, P2. PR #7060376 (SapphirePlatform repo, SAN SA project, branch `users/raulpo/remove-bingsearchtranslator` → main, **completed**) linked as artifact link. Removes the BingSearchTranslator service (App Service `bingsearchtranslator-eus-01-01`, RG `SuperApp-SearchSDK`) as dead code — only consumer was Sapphire Android International Search (gated by SapphireFeatureFlag.InternationalEnabled default=false, listed inactive), no traffic, route drift (/translatev2 vs implemented /translatev1). Deletes whole BingSearchTranslator/ folder incl. ADO pipelines; companion PR removes Android consumer. **Security follow-up**: deleted AzureTranslatorService.cs had a hardcoded Ocp-Apim-Subscription-Key that should be rotated/regenerated in Azure. Related: #11045487 (Sapphire Tools removal).

## Last Actions (2026-08-25)

1. Created Bug #11095072 "Review all App Services network config after Sev 1 (IcM 856399605) - 200+ opened to internet": parent **Security Vulnerabilities** epic #10495923 (C2), Active, Raul, iteration 2026.03, tags `20260824; security; SFI; incident`, **P1 / Sev 1 - Critical**. Follow-up to Sev 1 IcM 856399605: network config of 200+ App Services was modified and opened to the whole internet. Review all affected App Services, identify dangerous/sensitive endpoints exposed publicly, remediate (access restrictions / VNet / private endpoints / IP allowlists, remove unintended public exposure), confirm no exploitation during the exposure window, add guardrails (e.g. Azure Policy on App Service network access) to prevent recurrence. Related: #10461699.
2. **Current week tag** is now `20260824` (week of Mon 2026-08-24).

## Last Actions (2026-08-20)

1. Created Task #11076689 "Add Sapphire API documentation to ScaffoldingWiki": child of #10899437 (C4.10 Data platform discovery and onboarding), area `SAN SA\Scaffolding\Fundamental`, **Closed**, Raul, iteration 2026.03, tags `20260817; data-platform; Documentation`, P2. PR #7039230 (ScaffoldingWiki repo, SAN SA project, branch `users/raulpo/sapphire-api-docs` → master, **completed**) linked as artifact link. Documents the Sapphire API (read-only HTTP surface at www.bing.com/sapphire/api/v1/) under Services/Sapphire-API/ (Pigeon/Seagull pattern: landing + per-endpoint pages). Adds framing: why the proxy exists (app ID server-side, clients unauthenticated), why responses are trimmed (anti-scraping; VisualSearch deliberate passthrough), what snrcode is (Bing SERP frontend repo; API ships as an Answer, inherits Bing deploy/edge/rate-limit/abuse/telemetry) + source/ownership/ICM links, how to change it (server-side mapper first, additive). Docs-only, no creds. Related: #11066997 (DocFX-ready).

## Last Actions (2026-08-18)

1. Created Task #11066997 "Make ScaffoldingWiki DocFX-ready (config + generated navigation TOC)": child of #10899437 (C4.10 Data platform discovery and onboarding), area `SAN SA\Scaffolding\Fundamental`, Active, Raul, iteration 2026.03, tags `20260817; data-platform; Documentation`, P2. PR #7034144 (ScaffoldingWiki repo, SAN SA project, branch `raulpo-microsoft-stunning-disco` → master) linked as artifact link. Part of the data-platform documentation effort. Makes the wiki DocFX-ready (config only, no link conversion): docfx.json, index.md landing redirect, .gitignore artifacts, Generate-DocFxToc.ps1, generated toc.yml. DocFX 2.78.5 build: 0 errors, 0 TOC link warnings; 51 pre-existing broken content-link warnings deferred to a follow-up link-conversion task. Note: board rule auto-set state to Closed on create with linked PR; reset to Active (PR still active). Related: #11044869 (Synapse), #11044871 (Magnetar).

Note (2026-08-14): Linked PRs to the two Round 1 code-removal tasks — PR #7014205 → Task #11045524 (SuperApp-Community), PR #7014204 → Task #11045523 (Sapphire-Watchdog); replaced their earlier branch artifact links.

## Last Actions (2026-08-13)

1. Created Task #11051230 "Deprecate and remove Notifications-CohortGenerationService": **child of Mythos-removal task #11050555**, Active, Raul, iteration 2026.03, tags `20260810; security; SFI; Mythos`, P2. PR #7019145 (Sapphire-Notifications-JustForYou repo, Bing_and_IPG project, branch `copilot/deprecate-cohort-generation-service` → main) linked as artifact link. Retires the CohortGenerationService + its deployment pipelines (maintenance mode since early 2025); the code removal is the concrete step that eliminates the /cohorts arbitrary-job-spec + KeyVault-secret vectors from bugs #10828530/#10828531. Related: #10828530, #10828531.

1. Created Task #11050555 "Resolve Mythos vulns via deprecated-code removal (SAAMIT queue secrets + /cohorts Magnetar) - JustForYou": parent **Security Vulnerabilities** epic #10495923 (C2), Active, Raul, iteration 2026.03, tags `20260810; security; SFI; Mythos`, P2. Single work item covering two MAIMythosScan bugs in Sapphire-Notifications-JustForYou (AISPACE project): Bug #10828531 (KeyVault secrets copied into Azure Storage queue messages for every SAAMIT job) and Bug #10828530 (PUT /cohorts accepts arbitrary Magnetar job specs and hands them KeyVault secrets). Service is deprecated → both expected to resolve very fast: after checks confirm no live consumers, remove the code (SAAMIT queue-secret copy + /cohorts job-spec handling) rather than patch. Related: #10828531, #10828530.

## Last Actions (2026-08-12)

1. Created two Active code-removal child Tasks under Round 1 deprecation #11035270 (Raul, iteration 2026.03, tags `20260810; security; SFI; cost`, P2; branches in SapphirePlatform repo (SAN SA) linked as artifact links, PRs pending):
   - Task #11045523 "Remove deprecated Sapphire-Watchdog service" — branch `remove-watchdog` → main.
   - Task #11045524 "Remove deprecated SuperApp-Community service" — branch `remove-community` → main.
   Both were Round 1 deprecation targets; these reflect the code-level removals. Related to #11045487 (Sapphire Tools removal).

1. Created Task #11045487 "Remove deprecated Sapphire Tools project (sapphire-android-update-provider)": **child of Round 2 deprecation #11035272**, Active, Raul, iteration 2026.03, tags `20260810; security; SFI; cost`, P2. PR #7005593 (SapphirePlatform repo, SAN SA project, branch `copilot/remove-sapphire-tools` → main) linked as artifact link. Removes the deprecated Sapphire Tools project (sapphire-android-update-provider) and all related code — the code-level piece of the Round 2 Sapphire-Tools target. Related: #11035270 (Round 1).

1. Created Task #11045342 "Fix Sapphire suggestions entity thumbnail mapping (ContentUrl -> ThumbnailUrl)": **C4 work**, parent Feature #10899503 (Quality & ICM bandwidth), **Closed** (reflects completed work), Raul, iteration 2026.03, tags `20260810; backend`, P2. PR #7004414 (snrcode, Bing_UX, branch `users/raulpo/sapphire-suggestions-thumbnail` → main) linked as artifact link. `/sapphire/api/v1/suggestions` read entity thumbnail from `Image.ContentUrl` (never populated by v7 Suggestions API for suggestion entities) → thumbnailUrl always null; one-line fix reads `Image.ThumbnailUrl`. ContentUrl not a valid fallback (holds click-through/host page URL, not an image). Known limitation: two AutoSuggest v7 defects (MB.Enabled keyed on aspartner unresolved for loopback IApiInvoker; aggregator compares raw 'MB,AS' vs split 'MB' Type) drop the entity before Sapphire → not yet observable in prod; confirmed by diagnostic PR #7009927 (AutoSuggest owners, must land first). Merged regardless; 89 SuggestionsMapperTests pass. Related: #10964104 (autosuggest rich-metadata bug), #10656625 (Suggestions Part 5).

2. Created two Active child Tasks under #10899437 "C4.10 -- Data platform discovery and onboarding" (area `SAN SA\Scaffolding\Fundamental`, iteration 2026.03, Raul, P2, tag `20260810`):
   - Task #11044869 "Synapse Analytics analysis and deprecation in PME tenant" — inventory Synapse in PME (incl. synapse-workspace RG, sub ace9ebfc-12ee-484d-9cf8-7b8bbe124d06), analyze usage/dependencies/owners, deprecate vs migrate, sign-off + decommission. Tags add `data-platform; SFI; cost`. Related: #11035272 (unused-services Round 2).
   - Task #11044871 "Magnetar: learn and understand current setup" — map Magnetar architecture/components/data flows/ownership, document findings to inform C4.10. Tag `data-platform`.

## Last Actions (2026-08-10)

1. Created Bug #11036012 "Severe/extreme weather notifications stopped - upstream producer stopped calling injection (~99% drop Aug 8 14:10 UTC)": parent **Operational Fixes** epic #10465721 (C2 keep-the-lights-on), Active, Raul, iteration 2026.03, tags `20260810; incident; Notifications; Weather`, P1 / Sev 2 - High. Severe/extreme weather notifications collapsed ~99% from Aug 8 ~14:10 UTC. Evidence (join of severe-categorized primaryIds back to request stage): Before Aug 8 10:00-12:00 = 2,988,133 severe `apppush:injection:request` events (281 distinct severe IDs); After Aug 9 10:00-12:00 = 21,676 (108 IDs), −99.3%. Collapse is at the request stage (ingress into injection) → failure is UPSTREAM of injection: the severe/extreme weather-alert producer stopped calling injection. Injection healthy (precipitation + daily forecast normal). Next: pin exact minute (per-min Aug 8 13:50-14:20), identify caller source pod / cloudRoleName to name upstream producer, engage that team. Related: #10902859 (weather-notif IcM), #10941482 (block weatherprecipitationalerts at injection).

## Last Actions (2026-08-10) — earlier

1. Created Task #11035270 "Deprecate unused Azure services & resource groups - Round 1": parent **Security Vulnerabilities** epic #10495923 (C2), **Closed** (complete), Raul, iteration 2026.03, tags `20260810; security; SFI; cost`, P2. Deprecated: Sapphire-Watchdog, 'Staging' RG, ExploreAISendingService, SuperApp-Community, CopilotEducationSendingService, SwiftKeyTelemetry-Testing (RG, sub ace9ebfc-12ee-484d-9cf8-7b8bbe124d06), DseUpsellSendingService, imagecreatorsendingservice (RG, same sub). SFI/security surface reduction + Azure cost. Related: #11035272 (Round 2), #11016242 (copilot-shared RG).
2. Created Task #11035272 "Deprecate unused Azure services & resource groups - Round 2": parent Security Vulnerabilities epic #10495923 (C2), **Active** (in progress), Raul, iteration 2026.03, tags `20260810; security; SFI; cost`, P2. Follow-up to Round 1. Planned: Sapphire-Tools, Dove, synapse-workspace (RG, sub ace9ebfc-12ee-484d-9cf8-7b8bbe124d06), + other identified unused services (TBD). Related: #11035270 (Round 1), #11016242 (copilot-shared RG).
3. **Current week tag** is now `20260810` (week of Mon 2026-08-10).

## Last Actions (2026-08-05)

1. Created Task #11016290 "Sapphire: serve testhook formats (format=pbxml) from every endpoint": **C4 work**, parent Feature #10899503 (Quality & ICM bandwidth → Fundamentals #10899477 → C4 Work #10898840), Active, Raul, iteration 2026.03, tags `20260803; backend`, P2. PR #6983122 (snrcode repo, Bing_UX project, branch `users/raulpo/visualsearch-pbxml-debug` → main) linked as artifact link. **Stack with #11011229 / #11011421** (VisualSearch passthrough + forward-all-query). `format=pbxml` (and aqm/testhtml) returned HTTP 502: VisualSearch because `IApiInvokerResponse.IsSuccess` requires a deserialized model (testhook formats are raw text with no model); Search/Trends/Suggestions/PlacesAutosuggest because they cast upstream to a typed model testhook formats lack. Fix: (1) validate upstream on HTTP status not parsed model — `!IsSuccess` → `StatusCode<200||>=300` (strict subset; all 5 endpoints still record UpstreamFailed identically); (2) detect testhook format up front and branch to a separate `ProxyUpstreamAsync` path at the HTTP boundary (mapping never attempted); each service owns its upstream path/appid via a shared local constant. VisualSearch needs no guard (already passthrough). Rejected an earlier signal-exception design (AnswerServicesMonitor IExceptionFilter runs before the controller handler → would emit Error reports + violation counter). Security: IsTesthookFormatRequest() mirrors the API gate; payload only written when TestHooksAllowed; headers filtered via MiddleTierLoopbackForwardedHeaders allowlist. 84/84 Sapphire tests pass; verified on staging. Related: #11011229 (passthrough), #11011421 (forward-all-query), #10902822 (troubleshoot VisualSearch via ApiInvoker).

1. Created Task #11016242 "Remove copilot-shared Azure resource group (SFI/security + cost ~$2K/yr)": parent **Security Vulnerabilities** epic #10495923 (C2 Work), Active, Raul, iteration 2026.03, tags `20260803; security; SFI; cost`, P2. Remove the `copilot-shared` Azure resource group — owned by another team but must be decommissioned on our side for SFI/security (unowned cross-team shared RG is a compliance liability) and cost (~$2K/yr savings). Steps: inventory resources, coordinate with owning team for ownership/sign-off, migrate/confirm removal of dependencies, then delete the RG. Placed under the Security Vulnerabilities epic (Raul-owned security-cleanup home) alongside #10461699 rather than SFI feature #10372598. Related: #10461699 (security-vuln cleanup sibling).

## Last Actions (2026-08-04)

1. Created Task #11011421 "Forward all VisualSearch query parameters (ApiInvokerQueryPart.All)": **C4 work**, parent Feature #10899503 (Quality & ICM bandwidth → Fundamentals #10899477 → C4 Work #10898840), Active, Raul, iteration 2026.03, tags `20260803; backend`, P2. PR #6981912 (snrcode repo, Bing_UX project, branch `users/raulpo/visualsearch-forward-all-query-stacked` → main) linked as artifact link. **Stacked on top of #11011229** (VisualSearch transparent passthrough). Allows VisualSearch to request `ApiInvokerQueryPart.All` while preserving the default testhook-only query forwarding for other Sapphire endpoints → transparent forwarding of the complete inbound query string, including PBXML debug parameters handled by the passthrough response path. Related: #11011229 (passthrough base of stack), #10652759 (VisualSearch impl Part 2), #10902822 (troubleshoot VisualSearch via ApiInvoker).

1. Created Task #11011229 "Sapphire VisualSearch: transparent passthrough (remove response mapper)": **C4 work**, parent Feature #10899503 (Quality & ICM bandwidth → Fundamentals #10899477 → C4 Work #10898840), Active, Raul, iteration 2026.03, tags `20260803; backend`, P2. PR #6941091 (snrcode repo, Bing_UX project, branch `users/raulpo/sapphire-visualsearch-passthrough` → main) linked as artifact link. `/sapphire/api/v1/visualsearch` ran the upstream ImageKnowledge response through `VisualSearchMapper` into a trimmed `VisualSearchResponse` that only projected Translate + Homework actions and discarded everything else (VisualSearch similar-images, PagesIncluding, BestRepresentativeQuery, SuggestedQuery, AskAndAnswerPrequery, entity data) → real visual-search / "search on the image" scenarios came back empty even though upstream had the data. Fix: make `/visualsearch` a transparent proxy that returns the full upstream response (status/headers/body) unchanged. Deleted VisualSearchMapper, VisualSearchResponse, VisualSearchMapperTests; `IVisualSearchService.VisualSearchAsync` now returns `IApiInvokerResponse`; `SapphireApiController` injects `IApiInvoker` and calls `ProxyResponse(this, response, ApiInvokerResponsePart.All)` (same pattern as MultimediaCustomApiController), keeping the Controller out of service/infra layers. Contract change: clients now get the raw ImageKnowledge payload. Request building, market-param forwarding, cookie/header forwarding over loopback, and error handling (SapphireUpstreamException → 502 BadGateway) unchanged; 76 Sapphire tests pass, clean build. Related: #10652759 (VisualSearch endpoint impl Part 2), #10902822 (troubleshoot VisualSearch via ApiInvoker), #10460173 (Monitor Bing API migration / proxy quality).
2. **Current week tag** is `20260803` (week of Mon 2026-08-03).

## Last Actions (2026-07-22)

1. Created Task #10965240 "Send Sapphire User-Agent on new SapphireAPI autosuggest requests (iOS)": **C4 work**, parent Feature #10899503 (Quality & ICM bandwidth → Fundamentals #10899477 → C4 Work #10898840), Active, Raul, iteration 2026.03, tags `20260720; iOS`, P2. PR #6931648 (Sapphire repo, branch `raulpo/sapphire-api-user-agent` → master) linked as artifact link. The new SapphireAPI (`/sapphire/api/v1`) autosuggest path used `SASession()` with an empty UA, so no recognized Sapphire token (BingSapphire/NewsSapphire) was sent; L1 rule MarketOriginMismatchNoSapphireUserAgentKey (DTPB1858 → NotContainsSapphireUserAgentKey) then passes and can demote the request to the basic traffic tier. Fix: SearchAnswerFetch hands SapphireAPIServiceImpl a SASession pre-configured with the app's `UserAgent.getUserAgent()` (SASession emits userAgent as the User-Agent header); no caller-facing UA param. Flavor token only resolvable in app target via `#if BING`/`#if NEWS`, so the SPM package receives the app-built UA through the transport. Scope: iOS only, autosuggest path; legacy bingapis.com path unchanged. Related: #10964104 (autosuggest rich-metadata bug), #10656625 (Suggestions Part 5), #10657196 (Places Autosuggest Part 6).

1. Created Bug #10964104 "Sapphire Autosuggest results missing rich metadata (thumbnails)": **C4 work**, parent Feature #10899503 (Quality & ICM bandwidth → Fundamentals #10899477 → C4 Work #10898840), Active, Raul, iteration 2026.03, tags `20260720; backend`, P2 (Sev 3). Sapphire proxy API Suggestions/Autosuggest endpoint (snrcode repo) is dropping rich metadata — thumbnails/images/entity metadata — from the upstream Bing Autosuggest response, so suggestions render without visual/rich content; fix = preserve/forward the rich-metadata fields + add coverage. Per Raul: type **Bug**, under C4, current week tag. Related: #10656625 (Suggestions Part 5 impl), #10657196 (Places Autosuggest Part 6), #10778049 (Suggestions q/cc fix).

## Last Actions (2026-07-21)

0. **Weekly tag review** of open items owned by Raul (40 open, state ∉ Closed/Resolved/Removed). 6 already carried current-week tag `20260720` (#10959097, #10921969, #10902859, #10902822, #10774241, #10460176). Found 3 "outdated" items still on stale `20260601` week tag with no current tag: SFI stories #10373726, #10373736, #10389811 (all New, `backend; security; SFI; Status:*`). Per Raul, updated all 3 from `20260601` → `20260720` (still active this week), keeping other tags. All other open items had no week tag (backlog/programmatic — not outdated).

1. Created Task #10959097 "[Investigation] OneCamera Edge SDK partner support — distributing latest SDK via Sapphire CDN vs Azure Artifacts": **C4 work**, parent Feature #10899503 (Quality & ICM bandwidth → Fundamentals #10899477 → C4 Work #10898840), Active, Raul, iteration 2026.03, tags `20260720; backend`, P2. Reflects partner-support/investigation conversation with the OneCamera SDK team (Punit Chhajer, cc Chaitanya, Nicolas Lattuada). Partner wants latest Edge unifiedcamera SDK **v2.13.18** uploaded to the Sapphire CDN, mirroring v2.12.18 (`cdn.sapphire.microsoftapp.net/search/camerasdk/unifiedcamera-edge-2.12.18.aar`), URL used in Edge app dependency; existing flow adds the .aar to SAN SA superapp-se repo then an Edge pipeline (build 146432454) uploads to CIPD. Raul (CDN owner) investigation: believed CDN was customer-facing only; CDN prod endpoint points to storage account `sapphireapp.blob.core.windows.net` which is **not in PME or Corp tenant**; SapphireCDN repo `msasg.visualstudio.com/SAN%20SA/_git/SapphireCDN`. Recommendation: use **Azure Artifacts** (feed `SapphireShared_PublicPackages`) for internal binary distribution — standard approach, already used for camerasdk. Follow-ups: clarify sapphireapp storage account ownership/tenant, document supported SDK-upload path. Related: #10714322, #10718267 (OneCameraSDK CFS tasks).
2. **Current week tag** is now `20260720` (week of Mon 2026-07-20).

## Last Actions (2026-07-16)

1. Created Task #10941482 "Block weatherprecipitationalerts push notifications at web-push injection": **C4 work**, parent Feature #10899503 (Quality & ICM bandwidth → Fundamentals C4 epic #10899477 → C4 Work #10898840), Active, Raul, iteration 2026.03, tags `20260713; backend`, P2. Documents already-completed engineering change in SapphirePlatform repo (Azure DevOps, separate PR #6916742 open, branch `feat/web-push-block-weather-precipitation`). Server-side denylist block for notification category `weatherprecipitationalerts` (`AppNotificationCategoriesEnum`) in the web-push **injection** service: `AppPushService.saveToQueue` rejects `BLOCKED_CATEGORIES` (currently just `WeatherPrecipitationAlerts`) BEFORE enqueuing to Service Bus and returns early; emits new telemetry event `EventNameEnum.AppPushInjectionBlocked = apppush:injection:blocked` (notificationId, id anid/muid, category, partner). Files: `nx-apps/apps/web-push/injection/src/apppush/apppush.service.ts`, `nx-apps/libs/api/logger/src/lib/interface/event.interface.ts`, `nx-apps/apps/web-push/injection/src/apppush/apppush.service.block.spec.ts`. All 4 web-push services share one image (`sapphire-web-push`); only **injection** needs redeploy. Build CI: `[PME][Prod] web-push-ci` / `[Dev][WebPush] code-ci`; Deploy CD (prod needs approval): `[PME][Prod] web-push-injection-cd` / `[DEV][Test] web-push-injection-cd`. Status: code-complete, PR open, not yet deployed. Rationale: reduce low-value/noisy weather precipitation push notifications (Notification ICM & Quality workstream). Related: #10899497 (Daily notifications limit cap / volume reduction), #10902859 (weather-notif IcM 826588822).
2. Discovered full C4 feature set: Fundamentals epic #10899477 features include #10899503 "Quality & ICM bandwidth" (the ICM/Quality workstream), #10899504, #10899506, #10899507, #10899508.
3. Created Task #10942184 "[Investigation] Scope block of weatherprecipitationalerts noisy push notifications": **C4 work**, parent Feature #10899503 (Quality & ICM bandwidth), Active, Raul, iteration 2026.03, tags `20260713; backend`, P2. Companion to implementation Task #10941482 — reflects the investigation/analysis time (identifying the noisy category & block layer, mapping web-push architecture incl. shared sapphire-web-push image / injection-only redeploy, designing the apppush:injection:blocked telemetry event, identifying CI/CD pipelines). Outcome enabled the fix in #10941482 (PR #6916742). Related: #10941482 (implementation), #10902859 (weather-notif IcM).
4. Repo convention update: per Raul, commit memory changes **directly to main** (no PR). PR #1 already merged; subsequent changes pushed straight to main.

## Last Actions (2026-07-14)

1. Searched ADO (SAN SA) + memory for "recommendation platform investigation" / "sageprobe" — no existing ticket found (title search 0 results; description matches all noise; not in entities.md).
2. Created Task #10928976 "[Investigation] Leverage MSN personalization platform (SageProbe / RecoProbe++) for feed & notifications relevance": **C4 work**, parent Epic #10899475 (Personalization & Notifications → C4 Work #10898840), Active, Raul (owner), iteration 2026.03, tags `20260713; backend`, P2. Investigation into MSN's end-to-end personalization stack — interest-signal collection (incl. Windows), news categorization + quality scores, Reco service matching. Probing tools: SageProbe Profile Lookup (per-ANID interest profile), RecoProbe++ (RecoAPI debugger; per-article matching scores, 1000+ scores/article-user, lat/long tuning, multiple sources incl. Copilot feed). Goal: audit ANID/MUID signals we send, compare their feed vs ours, find easy relevance wins, explore partnering with the personalization org. cc Romain Beget, Nicolas Lattuada, Marina Sauca Ortiz, Jiarui Gui. Related: #10921969.

## Last Actions (2026-07-13)

1. Reviewed this-week (`20260713`) tickets assigned to & owned by Raul: 10712776, 10774241, 10902822, 10902859, 10460176, 10661965, 10703199, 10908349
2. Closed #10908349 (completed last week) — removed `20260713`, tags now `20260706; backend`
3. Closed #10712776 (completed long ago) — removed current-week tag (now untagged)
3b. Closed #10661965 "Unblock deployments for Breaking News Builder and Just4You Builder" (completed long ago, created 2026-04-30) — removed `20260713` (now untagged); parent Operational Fixes #10465721; cowork with Nicolas; fixed 6mo-stale BNB/J4Y pipelines, direct-to-prod deploy, /broadcast tracing + secret auth, log reduction; Related 10466092
3c. Closed #10703199 "Set up Bicep infra deployment pipeline for WorldCup Notifications" (completed weeks ago) — removed `20260713` (now untagged); parent Notifications #10459543; PR #6687977
6. Created Task #10921969 "Monitor notification volume reduction experiment metrics and track progress": **C4 work**, parent Feature #10899497 (Daily notifications limit cap → Personalization & Notifications → C4 Work #10898840), Active, Raul, iteration 2026.03, tags `20260713; backend`, P2; Related to C3 volume-reduction Epic #10779009 and experiment Tasks #10807151, #10807152, #10779012
7. Discovered C4 Work hierarchy (Epic #10898840): child epics Core Product #10899468, Personalization & Notifications #10899475, Fundamentals #10899477, Growth #10899479; #10899475 features: #10899494, #10899495, #10899496, #10899497
4. Confirmed still active/ongoing this week (keep `20260713`): #10774241 (Bing API flight rollout), #10902822 (VisualSearch via ApiInvoker), #10460176 (Sapphire proxy telemetry — needs stability before final monitors/IcM severities)
5. New ticket seen this week: #10661965 "Unblock deployments for Breaking News Builder and Just4You Builder" (Active, P2)

## Last Actions (2026-07-10)

1. Created Task #10914016 "Add test3visualsearch diagnostic endpoint (MM-style ApiInvoker call)": parent Epic #10681024 (Bing API upgrade - C3 work), Closed, Raul, iteration 2026.03, tags `20260706; backend`, P2
2. PR #6889085 (snrcode, Bing_UX, merged 2026-07-10) linked as artifact link
3. test3visualsearch mirrors MultimediaCustomApiController.HandleCustomApiRequest/HandleApiResponse; built directly from IApiInvoker (not IUpstreamInvoker wrapper); isolated Test3VisualSearchService; diagnostic-only, production /visualsearch untouched
4. Added Related links to #10837557 (testvisualsearch diagnostic endpoint), #10902822 (troubleshoot VisualSearch via ApiInvoker), #10775149 (ApiInvoker bug evidence), #10460173 (Monitor Bing API migration and new proxy quality story)
5. Week of Mon 2026-07-06 uses tag `20260706` (same tag as 07-08 session — no new weekly tag yet)
6. Note: az CLI needed `az login` + azure-devops extension; PR artifact links require REST PATCH (relations/-, rel=ArtifactLink, attributes.name="Pull Request") since `relation add` can't set the link name
7. Updated memory files

## Last Actions (2026-07-08)

1. Created Task #10902822 "Troubleshoot VisualSearch API unreliability via ApiInvoker": parent Epic #10681024 (Bing API upgrade - C3 work), Active, Raul, iteration 2026.03, tags `20260706; backend`, P1
2. This week's tag: 20260706 (Monday July 7, 2026)
3. Task tracks ongoing time spent troubleshooting VisualSearch unreliability through ApiInvoker
4. Added Related links to #10775149 (prior troubleshooting task), #10837557 (diagnostic endpoint), #10703212 (HTTP workaround)
5. Created Task #10902859 "Investigate wrong temperature unit in weather notifications (IcM 826588822)": parent Epic #10465721 (Operational Fixes, C2), Active, Raul, iteration 2026.03, tags `20260706; backend`, P1
6. IcM 826588822 is a Sev 2 incident: users get weather notifs in wrong temp unit (C vs F) despite correct prefs
7. Created Task #10908349 "Assess complexity and request security group permissions for IcM 831050152": parent Epic #10465721 (Operational Fixes, C2), Active, Raul, iteration 2026.03, tags `20260706; backend`, P2
8. Need to request permissions to security group to review dashboard before assessing fix complexity
9. Updated memory files

## Last Actions (2026-06-09)

1. Created Task #10803357 "[iOS] Add iOS app on Mac telemetry flag": parent US #10727656 (Operational fixes, C3 Work), Active, Raul, iteration 2026.03, tags `20260601; iOS`, P2
2. Linked PR #6778326 (Sapphire repo, iOS) to #10803357
3. Added Related link between #10803357 and #10801790 (sibling iOS telemetry tasks)
4. Created Task #10803397 "[Android][iOS] Add MIME type to network telemetry": parent US #10727656 (Operational fixes, C3 Work), Active, Raul, iteration 2026.03, tags `20260601; Android; iOS`, P2
5. Linked PR #6778184 (Sapphire repo, cross-platform) to #10803397
6. Added Related links: #10803397 ↔ #10801791, #10801790, #10803357 (sibling network telemetry tasks)
7. Created Task #10801791 "[Android] Add host to NetworkTraceLog telemetry": parent US #10727656 (Operational fixes, C3 Work), Active, Raul, iteration 2026.03, tags `20260601; Android`, P2
8. Created Task #10801790 "[iOS] Add host to DiagnosticFetcher telemetry": parent US #10727656 (Operational fixes, C3 Work), Active, Raul, iteration 2026.03, tags `20260601; iOS`, P2
9. Both #10801791/#10801790 driven by IcM 813652080 (API latency investigation telemetry gap)
10. Linked PR #6773896 (Sapphire repo, Android) to #10801791
11. Linked PR #6773887 (Sapphire repo, iOS) to #10801790
12. Added Related link between #10801791 and #10801790 (same feature, cross-platform)
13. Updated memory files

## Last Actions (2026-06-02)

1. Created Task #10778049 "Sapphire: accept empty (but not null) q and cc on Suggestions endpoint": parent C3 epic #10681024 (Bing API upgrade - C3 work), Active, Raul, iteration 2026.03, tags `20260601; backend`, P2
2. Linked PR #6750428 (snrcode repo, Bing_UX project, merged 2026-06-01) as artifact link
3. Added Related links to #10656625 (Suggestions endpoint Part 5, original impl) and #10775149 (sibling ApiInvoker troubleshooting)
4. Mapped full C3 Work (#10611444) children (11 pre-existing): #10681024 Bing API, #10681055 Homepage refresh, #10611454 Zero Input Query Refactoring, #10611476 Hub/Tab modernization, #10611477 Watch modernization, #10611478 Navigation bar modernization, #10611479 Multimodal search modernization, #10681154 iOS Technical Excellence, #10736428 Android Technical Excellence, #10707308 US AppConfig monitoring, #10727656 US Operational fixes
5. Created new C3 Epic #10779009 "Notification Volume Reduction": parent C3 Work #10611444, Active, Raul, iteration 2026.03, P1; Related to C2 Epic #10459429 (Notifications - Throttle testing)
6. Created Task #10779012 "Investigate notification volume reduction and author RFC" under Epic #10779009: Active, Raul, iteration 2026.03, tags `20260601; backend`, P2
7. Linked RFC PR #6719109 (ScaffoldingWiki repo) as artifact link
8. Updated memory files

## Last Actions (2026-06-01)

1. Tagged this week's Bing API monitor work under US #10460173 (C3 Bing API epic #10681024)
2. Updated Tasks #10460175, #10460177, #10460178: added tag `20260601; backend`, set State New → Active → Closed (dashboards done)
3. Iteration already `SAN SA\Month\2026.03` on all three; assigned to Raul
4. Excluded #10460176 (assigned to Gemma Fornons Sera, already Active)
5. Created Task #10774210 "Create Bing API monitors and configure IcM routing with correct severity": parent epic #10681024 (directly under epic, not US), Active, Raul, iteration 2026.03, tags `20260601; backend`, P2, Related to US #10460173
6. Created Task #10774241 "Monitor Bing API flight deployment rollout and usage increase": parent epic #10681024, Active, Raul, iteration 2026.03, tags `20260601; backend`, P1, flight started today; Related to #10774210 (monitors) and US #10460173
7. Note: distinct from C2 Bing API epic #10459410; US #10460173 and Tasks #10774210, #10774241 live under C3 epic #10681024 (Bing API upgrade - C3 work, flight & monitoring, assigned Gemma); siblings: #10681141, #10681138, #10460157
8. Created Task #10775149 "Collect evidence and help troubleshoot ApiInvoker bug with VisualSearch": parent epic #10681024, Active, Raul, iteration 2026.03, tags `20260601; backend`, P1; Related to #10652759 (VisualSearch Part 2) and #10703212 (VisualSearch HTTP workaround)
9. Created Task #10783476 "Add treadmill-ready end-to-end tests for Sapphire API endpoints": parent C3 epic #10681024, Active, Raul, iteration 2026.03, tags `20260601; backend`, P2; PR #6709524 (snrcode, Bing_UX project) linked as artifact; Related to endpoint tasks #10653095 (Search), #10656400 (Trends), #10656625 (Suggestions), #10657196 (Places); VisualSearch out of scope for that PR
10. Updated memory files

## Previous Actions (2026-05-15)

1. Created Task #10718267 "[Android] CFS: redirect Robolectric runtime downloads through Azure Artifacts"
2. Parented under Epic #10611444 (C3 Work)
3. Assigned to Raul Portugues, iteration 2026.03, Active
4. Linked PR #6699850 (Sapphire repo) as artifact link
5. Added Related links to #10714322 (OneCameraSDK CFS) and #10372775 (Android CFS config)
6. Updated memory files

## Previous Actions (2026-05-14)

1. Created Task #10714322 "[Android] CFS compliance for OneCameraSDK — replace public Maven repos with Azure Artifacts feed"
2. Parented under Epic #10611444 (C3 Work)
3. Assigned to Raul Portugues, iteration 2026.03, Active
4. Linked PR #6524394 (OneCameraSDK repo, OneCore project) as artifact link
5. Added Related link to #10372775 (Android CFS config under SFI)
6. Updated memory files

## Previous Actions (2026-05-13)

1. Created User Story #10707308 "Improve monitoring for AppConfig service"
2. Parented under Epic #10611444 (C3 Work)
3. Assigned to Raul Portugues, iteration 2026.03, New
4. Created Task #10707309 "Review monitoring and logging of AppConfig service"
5. Parented under User Story #10707308
6. Assigned to Raul Portugues, iteration 2026.03, New
7. Discovered C3 Work hierarchy: Epic #10611444 with 8 child epics
8. Updated memory files

## Previous Actions (2026-05-12)

1. Created Task #10703199 "Set up Bicep infra deployment pipeline for WorldCup Notifications"
2. Parented under Epic #10459543 (Notifications → C2 Work)
3. Assigned to Raul Portugues, iteration 2026.03, Active
4. Linked PR #6687977 (SapphirePlatform repo) as artifact link
5. Helped Nicolas set up Bicep IaC with 6 modules and a 3-stage pipeline (validate/approve/deploy)
6. Created Task #10703212 "Add isolated HTTP workaround for Sapphire VisualSearch upstream"
7. Parented under User Story #10442031 ([BE] New Sapphire Proxy API → Bing API upgrade → C2 Work)
8. Assigned to Raul Portugues, iteration 2026.03, Active
9. Linked PR #6672495 (snrcode repo) as artifact link
10. Added Related link to #10652759 (VisualSearch Part 2)
11. Updated memory files

## Previous Actions (2026-05-07)

1. Created Task #10684833 "Create Grafana dashboard for Sapphire Bing API Proxy monitoring (snrcode)"
2. Parented under Epic #10459410 (Bing API upgrade → C2 Work)
3. Assigned to Raul Portugues, iteration 2026.03, Active
4. Added Related link to #10399204 (prior Grafana metrics integration task)
5. Dashboard: uid cfl5s5bq95se8b, folder "Bing APIs metrics", 12 panels covering all 6 Sapphire Geneva metrics
6. Updated memory files

## Previous Actions (2026-04-29)

1. Created Task #10656625 "Implement Sapphire Suggestions endpoint with Autosuggest API proxy (Part 5)"
2. Parented under User Story #10442031 ([BE] New Sapphire Proxy API → Bing API upgrade → C2 Work)
3. Assigned to Raul Portugues, iteration 2026.03, Active
4. Linked PR #6646621 (snrcode repo) as artifact link
5. Added Related links to Parts 1-4 (#10647581, #10652759, #10653095, #10656400)
6. Also created Task #10656400 (Part 4, PR #6646472) earlier this session
7. Updated memory files

## Previous Actions (2026-04-28)

1. Created Task #10653095 "Implement Sapphire Search endpoint with related searches (Part 3)"
2. Parented under User Story #10442031 ([BE] New Sapphire Proxy API → Bing API upgrade → C2 Work)
3. Assigned to Raul Portugues, iteration 2026.03, Active
4. Linked PR #6642851 (snrcode repo) as artifact link
5. Added Related links to Part 1 (#10647581) and Part 2 (#10652759)
6. Updated memory files

## Previous Actions (2026-04-13)

1. Created Task #10588420 "[Android] Fix ad fetch retry storm — add exponential backoff and circuit breaker"
2. Parented under Epic #10465721 (Operational Fixes → C2 Work)
3. Assigned to Raul Portugues, iteration 2026.03, area path SAN SA
4. Linked PR #6585380 (Sapphire repo) as artifact link
5. Description covers: problem (270k errors/hr from 2 devices), fix (exp backoff + circuit breaker), scope (Android FeedRepository.collectAdsFetchTask)
6. Updated memory files

## Previous Actions (2026-03-17, session 2)

1. Completed pending memory updates (Epic #10495923 and Task #10495859 parent restructuring)
2. Adopted existing Task #10461699 (created by Nicolas Lattuada under SFI #10372598) for PR #6469827
3. Unlinked Task #10461699 from old parent (SFI Feature #10372598)
4. Set new parent: Task #10461699 → Epic #10495923 (Security Vulnerabilities)
5. Updated Task #10461699: assigned to Raul, iteration 2026.03, P1, expanded description with all 3 vulns
6. Set state to Active (left open per user request)
7. Linked PR #6469827 as artifact link
8. Added Related links: #10461699 ↔ #10495859 (sibling), #10461699 ↔ #10399947 (related security bug)
9. Updated memory files

## Previous Actions (2026-03-17, session 1)

1. Resumed previous session to complete pending work for Task #10495859 (WebPush dashboard)
2. Set parent link: Task #10495859 → Epic #10459429 (initial placement under Throttle testing)
3. Added Related link: Task #10495859 ↔ Task #10399204
4. Updated Task #10495859 state from New → Closed
5. Updated memory files with Notifications epic hierarchy

## Previous Actions (2026-03-10, session 2)

1. Fetched all 12 previously unfetched children of Epic #10459254 (C2 Work)
2. Discovered Epic #10465721 "Operational Fixes" — new bucket for unplanned C2 work, created by Marina Sauca Ortiz
3. Fetched #10465721 children: Task #10465729 (closed iOS versioning fix) and Task #10465748 (new centralize versioning)
4. Updated entities.md and context.md with full C2 hierarchy (13 child epics mapped)
5. Did NOT find a user story specifically titled "operational time lost" — the closest match is Epic #10465721 "Operational Fixes" which tracks unplanned ops work

## Previous Actions (2026-03-10, session 1)

1. Completed pending memory updates from previous session (US #10464832, corrected parents for #10399198 and #10446975)
2. Created Task #10464841 "Confirm Bing China endpoints do not require extra work" as child of US #10442031
3. Created User Story #10464892 "Review other backends and miniapps using BingAPIs" as child of Epic #10459410
4. Created Task #10464894 "Review miniapps BingAPI usage" under US #10464892
5. Created Task #10464895 "Review backend services BingAPI usage" under US #10464892
6. Linked US #10464892 as Related to #10377293 and #10399205 (prior BingAPI evaluations)
7. Cross-linked both tasks (#10464894 ↔ #10464895) as Related
8. Updated memory files with all new work items and hierarchy
