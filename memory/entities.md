# Entities Database

Auto-populated knowledge base of ticket management entities.

## Organizations

| Name | URL | Notes |
|------|-----|-------|
| msasg | https://msasg.visualstudio.com | Default org |

## Projects

| Project | Org | Area Path | Iteration Path | Notes |
|---------|-----|-----------|----------------|-------|
| SAN SA | msasg | SAN SA\\Scaffolding\\Fundamental | SAN SA\\OKR | Scaffolding team |

## Work Items

| ID | Type | Title | Parent | Project | Status | Notes |
|----|------|-------|--------|---------|--------|-------|
| 9980777 | Epic | 🔔 Notification | - | SAN SA | - | Notifications epic |
| 10318714 | User Story | Cost Optimization | 9980777 | SAN SA | New | Cost optimization for notifications |
| 10318715 | Task | Reduce traces logged in Just4You service | 10318714 | SAN SA | New | Just4You trace reduction |
| 10318716 | Task | Fix Just4You pipeline for trace reduction | 10318714 | SAN SA | New | Pipeline fix for trace work |
| 10327209 | Task | Add integration tests in Just4You project | 10318714 | SAN SA | New | Prerequisite for trace reduction work; e2e tests disabled |
| 10332845 | Task | Add unit test for schema of telemetry events | 10332803 | SAN SA | Closed | IcM repair item; closed as not practical to unit test library schema |
| 10365097 | Task | Remove redundant bastions in PME subscription | 10318714 | SAN SA | Closed | 34 bastions removed, $5k/mo savings |
| 10317577 | Epic | Fundamentals | - | SAN SA | - | Top-level epic containing SFI feature and BingAPI feature |
| 10377255 | Feature | Fix BingAPI usage in the codebase | 10317577 | SAN SA | - | Under Fundamentals epic |
| 10377293 | User Story | Evaluate all usages of BingAPI | 10377255 | SAN SA | - | Assigned: Gemma Fornons Sera |
| 10399198 | Task | Increase API limits to reduce 429s | 10464832 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.02; Related: 10399204, 10399205, 10446975 |
| 10399204 | Task | Integrate bingapis.com metrics into our Grafana dashboard | 10377255 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.02; Related: 10377293, 10399198; Grafana dashboard link in description |
| 10399205 | Task | Evaluate current BingAPI impact across our services | 10377293 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.02; Related: 10377293, 10399198, 10399204, 10406404; Loop doc link with impact analysis of 9 AppIDs |
| 10399351 | User Story | New endpoints for bing API calls | 10377255 | SAN SA | Active | Assigned: Gemma Fornons Sera |
| 10406404 | Task | Document missing Bing API App ID B5DB19752CCFB2A8DBC11E7390600F78C2B22A56 | 10377293 | SAN SA | New | Assigned: Raul Portugues; 10th BingAPI AppID found in iOS TrendingSearch; Related: 10399205 |
| 10372598 | Feature | SFI | 10317577 | SAN SA | New | SFI security tracking feature; iteration SAN SA\Month\2026.01 |
| 10372775 | User Story | Android CFS config | 10372598 | SAN SA | WIP | Assigned: George Marques |
| 10373713 | User Story | Move Binary Files to Git LFS | 10372598 | SAN SA | Active | Assigned: Nicolas Lattuada; Tag: Common Infrastructure, Status:Red |
| 10373714 | User Story | NGP Untagged Assets by Service | 10372598 | SAN SA | New | Tag: Global and Trusted, Status:Red |
| 10373715 | User Story | Non-SDK Style CSProj | 10372598 | SAN SA | New | Tag: Common Infrastructure, Status:Red |
| 10373716 | User Story | Perform Code Signing | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373717 | User Story | Service Accounts Usage | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373718 | User Story | Suspicious Non-Default Branch | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373719 | User Story | Tenant Production Isolation | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373720 | User Story | [SFI-AR1.2.2] 1P Image Gallery | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373721 | User Story | [SFI-AR1.2.6] VMSS Flex Auto OS Upgrades | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373722 | User Story | [SFI-ES4.1.1] ES Standards: Pipeline Templates | 10372598 | SAN SA | New | Tag: Unified Platform, Status:Red |
| 10373723 | User Story | [SFI-ES4.2.4] Network Isolation for CFS endpoints | 10372598 | SAN SA | WIP | Assigned: George Marques; Tag: security, Status:Red |
| 10373724 | User Story | [SFI-ID2.3.20] Microsoft Graph migration | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373725 | User Story | [SFI-ID4.1.1] Entra ID Apps Safe Secrets | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373726 | User Story | [SFI-ID4.2.1] Storage Accounts Safe Secrets | 10372598 | SAN SA | New | Assigned: Raul Portugues; Tag: security, Status:Red |
| 10373727 | User Story | [SFI-ID4.3.2] Event Hub Safe Secrets | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373728 | User Story | [SFI-ID4.7.1] Rotation of High Value Secrets | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373729 | User Story | [SFI-NS2.2.1] Secure PaaS Resources | 10372598 | SAN SA | WIP | Assigned: Jiarui Gui; Tag: security, Status:Red |
| 10373730 | User Story | [SFI-PS2.1] Continuous SDL | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373731 | User Story | [SFI-SM2.1.1] Missing/Misconfigured Azure Security Pack | 10372598 | SAN SA | New | Tag: security, Status:Red |
| 10373732 | User Story | ADO Security Posture Management | 10372598 | SAN SA | New | Tag: security, Status:Yellow |
| 10373733 | User Story | MAI EO Compliance Data | 10372598 | SAN SA | New | Tag: security, Status:Yellow |
| 10373734 | User Story | Microsoft Screening | 10372598 | SAN SA | New | Tag: security, Status:Yellow |
| 10373735 | User Story | [SFI-ES5.2] 1ES Open Source Vulnerabilities | 10372598 | SAN SA | New | Tag: security, Status:Yellow |
| 10373736 | User Story | [SFI-ID4.2.3] Cosmos DB Safe Secrets | 10372598 | SAN SA | New | Assigned: Raul Portugues; Tag: security, Status:Yellow |
| 10373737 | User Story | [SFI-ID4.2.7] Redis Cache Safe Secrets | 10372598 | SAN SA | New | Tag: security, Status:Yellow |
| 10373738 | User Story | 2.02 Svc Account Expiration | 10372598 | SAN SA | New | Tag: Livesite, Status:Green |
| 10373739 | User Story | Upgrade to .NET 10 and .NET Standard 2.0 | 10372598 | SAN SA | New | Tag: security, Status:Green |
| 10373740 | User Story | [SFI-ES1.6.3] Area Path Hygiene | 10372598 | SAN SA | New | Tag: Global and Trusted, Status:Green |
| 10373741 | User Story | [SFI-ID2.1.1][SFI-ID2.1.2] MISE Compliance | 10372598 | SAN SA | New | Tag: security, Status:Green |
| 10373742 | User Story | [SFI-NS2.1] IP allocations with Service Tags | 10372598 | SAN SA | New | Tag: security, Status:Green |
| 10373743 | User Story | [SFI-NS2.6.1] Disable default outbound connectivity | 10372598 | SAN SA | New | Tag: security, Status:Green |
| 10389811 | User Story | [SFI-TI2.3.3] Disable Anonymous Access to Azure Blob Storage | 10372598 | SAN SA | New | Assigned: Raul Portugues; storage account stntjo4unotification; Related: 10373726 |
| 10396348 | Task | Disable local auth and enable managed identity for societas-test Event Hub namespace | 10373727 | SAN SA | New | Assigned: Raul Portugues; Resource: societas-test in dev-superapp-ai (NonProd); Related: 7714109 |
| 10399947 | Bug | C1: Replace insecure Math.random() with crypto.randomInt() for PAT secret generation | 10372598 | SAN SA | New | Assigned: Raul Portugues; Severity: 1-Critical; security audit ManageApps; PR #6410936; Related: 10373730, 10373728 |
| 10438778 | Task | Migrate [PME][CD] SapphireAppConfig pipeline to WebXTPT | 10373722 | SAN SA | Closed | Assigned: Raul Portugues; PR #6450847; 1ESPT drift management fix |
| 10459254 | Epic | C2 Work | - | SAN SA | New | Top-level C2 planning epic; 14 child epics |
| 10385745 | Epic | Home page refresh | 10459254 | SAN SA | New | C2; Assigned: Soran Zana Alatas |
| 10459402 | Epic | Visual search - Default to SRP | 10459254 | SAN SA | New | C2 |
| 10459404 | Epic | News/discovery feed | 10459254 | SAN SA | New | C2 |
| 10459405 | Epic | SFI (Service Feature Integration) | 10459254 | SAN SA | New | C2; Assigned: Nicolas Lattuada |
| 10459406 | Epic | Releases - biweekly cadence | 10459254 | SAN SA | New | C2; Assigned: Tianpei Li |
| 10459407 | Epic | MiniApps - sunset ManageappsFeatureFlag | 10459254 | SAN SA | New | C2; Assigned: Samuel Morin |
| 10459408 | Epic | iOS - Swift 6 migration planning | 10459254 | SAN SA | New | C2; Assigned: Tianpei Li |
| 10459411 | Epic | iOS - platform updates bundle | 10459254 | SAN SA | New | C2; Assigned: Paula Boyano Ivars |
| 10459422 | Epic | User Voice + Data improvements | 10459254 | SAN SA | New | C2; Assigned: Claire Wang |
| 10459540 | Epic | Rewards | 10459254 | SAN SA | New | C2 |
| 10459543 | Epic | Notifications | 10459254 | SAN SA | New | C2; children: 10459429, 10459431, 10459531 |
| 10459429 | Epic | Notifications - Throttle testing and increasing engagement | 10459543 | SAN SA | New | C2; P1; Assigned: Raul Portugues; child of Notifications epic |
| 10459431 | Epic | Notifications - Personalized mini flight | 10459543 | SAN SA | New | C2; P3; unassigned; child of Notifications epic |
| 10459531 | Epic | End to end notifications testing | 10459543 | SAN SA | New | C2; P1; Assigned: Jiarui Gui; child of Notifications epic |
| 10495923 | Epic | Security Vulnerabilities | 10459254 | SAN SA | New | C2; Assigned: Raul Portugues; iteration 2026.03; child of C2 Work; children: 10495859, 10461699 |
| 10461699 | Task | Remove traffictype authentication bypass vulnerabilities from injection and user services | 10495923 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; P1; created by Nicolas Lattuada; moved from SFI #10372598; PR #6469827; 3 auth bypass vulns fixed; Related: 10495859, 10399947 |
| 10495859 | Task | Create WebPush service monitoring dashboard in Grafana | 10495923 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.03; P2; WebPush Grafana dashboard with 21 panels; Related: 10399204; moved from parent #10459429 to #10495923 |
| 10465721 | Epic | Operational Fixes | 10459254 | SAN SA | New | C2; "keep the lights on" unplanned work bucket; Created: Marina Sauca Ortiz |
| 10465729 | Task | [iOS] Fix versioning of BingVisualSearch on Release Candidate 33.0 | 10465721 | SAN SA | Closed | Assigned: Marina Sauca Ortiz |
| 10465748 | Task | [iOS] Centralize app versioning to avoid version mismatches in the future | 10465721 | SAN SA | New | Follow-up from #10465729 |
| 10466091 | Task | Notification Hub registration debugging for IcM 731993800 | 10465721 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.03; IcM 731993800; ops time tracking |
| 10466092 | Task | Notification broadcast endpoint auditing | 10465721 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.03; ops time tracking |
| 10459410 | Epic | Bing API upgrade | 10459254 | SAN SA | Active | P1; Assigned: Gemma Fornons Sera; core metric: "Token brokers no longer in use" |
| 10446982 | Task | Add authentication to the Sapphire Bing token broker or decommission it | 10459410 | SAN SA | - | Pre-existing task under Bing API upgrade epic; Related: 10460157 |
| 10446969 | Task | (Child of Bing API upgrade) | 10459410 | SAN SA | - | Existing child of epic #10459410 |
| 10446975 | Task | Request capacity increase for 91B3... appID via capacity council | 10464832 | SAN SA | New | Assigned: Raul Portugues; created by Michael Grande; Tag: retrospective; iteration 2026.03; Related: 10446517, 10399198; "Bing API Leaks: Request sent 2026-02-25" |
| 10441934 | Task | (Child of Bing API upgrade) | 10459410 | SAN SA | - | Existing child of epic #10459410 |
| 10442031 | User Story | [BE] New Sapphire Proxy API | 10459410 | SAN SA | Active | Assigned: Raul Portugues; created by Gemma; iteration 2026.02; Tag: backend; children: 10446977, 10446980, 10464841; Related: 10460173 |
| 10446977 | Task | Coordinate with Bing API team on APIinvoker work (C2) | 10442031 | SAN SA | Closed | Assigned: Raul Portugues; Tag: retrospective; Related: 10464841, 10446980; agreement and collaboration established |
| 10446980 | Task | Implement anti-abuse/anti-scraping protections on new proxy endpoints | 10442031 | SAN SA | New | Assigned: Raul Portugues; Tag: retrospective; Related: 10464841, 10446977 |
| 10464841 | Task | Confirm Bing China endpoints do not require extra work | 10442031 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03; Related: 10446977, 10446980 |
| 10464832 | User Story | BingAPI capacity planning and limit increases | 10459410 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03; child of Epic #10459410; children: 10399198, 10446975 |
| 10464892 | User Story | Review other backends and miniapps using BingAPIs | 10459410 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03; child of Epic #10459410; children: 10464894, 10464895; Related: 10377293, 10399205 |
| 10464894 | Task | Review miniapps BingAPI usage | 10464892 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03; Related: 10464895 |
| 10464895 | Task | Review backend services BingAPI usage | 10464892 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03; Related: 10464894 |
| 10460157 | User Story | Deprecate and decommission token machines | 10459410 | SAN SA | New | P1; Assigned: Raul Portugues; iteration 2026.03; child of Epic #10459410; Related: 10446982 |
| 10460159 | Task | Inventory all token machines and their Azure resources | 10460157 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03; Related: 10460160, 10460161, 10460162 |
| 10460160 | Task | Request Azure permissions to modify and delete token machine resources | 10460157 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03; Related: 10460159, 10460161, 10460162 |
| 10460161 | Task | Evaluate all consumers of token machines | 10460157 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03; Related: 10460159, 10460160, 10460162 |
| 10460162 | Task | Execute deletion of token machine Azure resources | 10460157 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03; Related: 10460159, 10460160, 10460161 |
| 10588420 | Task | [Android] Fix ad fetch retry storm — add exponential backoff and circuit breaker | 10465721 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03; PR #6585380; Sapphire repo; ad auction retry loop fix |
| 10647581 | Task | Scaffold Sapphire answer with heartbeat endpoint (Part 1) | 10442031 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6573397; snrcode repo; Related: 10652759 |
| 10652759 | Task | Implement Sapphire VisualSearch endpoint with cc/setlang forwarding (Part 2) | 10442031 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6642567; snrcode repo; Related: 10647581, 10653095 |
| 10653095 | Task | Implement Sapphire Search endpoint with related searches (Part 3) | 10442031 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6642851; snrcode repo; Related: 10647581, 10652759, 10656400 |
| 10656400 | Task | Implement Sapphire Trends endpoint with Trending Topics API proxy (Part 4) | 10442031 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6646472; snrcode repo; Related: 10647581, 10652759, 10653095, 10656625 |
| 10656625 | Task | Implement Sapphire Suggestions endpoint with Autosuggest API proxy (Part 5) | 10442031 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6646621; snrcode repo; Related: 10647581, 10652759, 10653095, 10656400 |
| 10657145 | Task | Add Sapphire VisualSearch request size limit (2.5MB) to RequestLimitsConfig | 10442031 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6642343; snrcode repo; Related: 10652759 |
| 10657196 | Task | Implement Sapphire Places Autosuggest endpoint (Part 6) | 10442031 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6647270; snrcode repo; Related: 10653095, 10656400, 10656625 |
| 10660885 | Task | Wire up Sapphire Search endpoint routing, DI, and config (Part 7) | 10442031 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6647416; snrcode repo; Related: 10653095 |
| 10670473 | Task | Remove MCP module from notification userservice | 10495923 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.03; PR #6651169; SapphirePlatform repo; Related: 10461699 |
| 10676010 | Task | [Android][iOS] Add sapphire/legacy dimension to search API diagnostic telemetry | 10442031 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6662807; Sapphire repo; Related: 10653095, 10656400 |
| 10684833 | Task | Create Grafana dashboard for Sapphire Bing API Proxy monitoring (snrcode) | 10459410 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; Grafana uid: cfl5s5bq95se8b; Geneva: BingExp_CoreUX_Partners_Prod / snr.Partners.Sapphire; 12 panels, 6 metrics; Related: 10399204 |
| 10703199 | Task | Set up Bicep infra deployment pipeline for WorldCup Notifications | 10459543 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.03; PR #6687977; SapphirePlatform repo; helped Nicolas with Azure Bicep infra |
| 10703212 | Task | Add isolated HTTP workaround for Sapphire VisualSearch upstream | 10442031 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6672495; snrcode repo; ApiInvoker workaround for VisualSearch; Related: 10652759 |
| 10611444 | Epic | C3 Work | - | SAN SA | Active | Top-level C3 planning epic; Created: Soran Zana Alatas; Related: 10459254 (C2 Work) |
| 10681024 | Epic | Bing API upgrade - C3 work (flight & monitoring) | 10611444 | SAN SA | Active | Assigned: Gemma Fornons Sera; Tags: Android, backend, iOS |
| 10681055 | Epic | Homepage refresh - C3 work | 10611444 | SAN SA | Active | Assigned: Marina Sauca Ortiz; Tags: Android, iOS |
| 10707308 | User Story | Improve monitoring for AppConfig service | 10611444 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03 |
| 10707309 | Task | Review monitoring and logging of AppConfig service | 10707308 | SAN SA | New | Assigned: Raul Portugues; iteration 2026.03 |
| 10712776 | Task | Fix NestJS version mismatch breaking SapphireAppConfig deploy pipeline | 10465721 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.03; P1; PR #6691603; SapphirePlatform repo; NestJS version mismatch from Dependabot; Related: 10438778, 10707308 |
| 10714322 | Task | [Android] CFS compliance for OneCameraSDK — replace public Maven repos with Azure Artifacts feed | 10611444 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6524394; OneCameraSDK repo (OneCore project); Related: 10372775 |
| 10718267 | Task | [Android] CFS: redirect Robolectric runtime downloads through Azure Artifacts | 10611444 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6699850; Sapphire repo; fixes 6 CFSClean violations; Related: 10714322, 10372775 |
| 10732113 | Task | Decommission Notification Center Portal (remove studio + server) | 10611444 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6706239; Sapphire-Notifications-JustForYou repo; removes notification-center-studio and notification-center-server |
| 10732173 | Task | Remove flaky E2E tests and simplify JustForYou CI pipeline | 10611444 | SAN SA | Active | Assigned: Raul Portugues; iteration 2026.03; PR #6342669; Sapphire-Notifications-JustForYou repo; pipeline from 266 to 106 lines; Related: 10327209 |
| 10681024 | Epic | Bing API upgrade - C3 work (flight & monitoring) | 10611444 | SAN SA | Active | P2; Assigned: Gemma Fornons Sera; children: 10681141, 10460173, 10681138, 10460157, 10774210, 10774241, 10775149, 10783476 |
| 10460173 | User Story | Monitor Bing API migration and new proxy quality | 10681024 | SAN SA | Work in Progress | P1; Assigned: Raul Portugues; iteration 2026.03; IcM repair item 791185924; children: 10460175, 10460176, 10460177, 10460178 |
| 10460175 | Task | Create Grafana dashboard for current (old) Bing API quality baseline | 10460173 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; dashboard done; Related: 10460176, 10460177, 10460178 |
| 10460176 | Task | Implement telemetry and monitoring for the new Sapphire proxy API | 10460173 | SAN SA | Active | Assigned: Gemma Fornons Sera; iteration 2026.03; Tag: backend |
| 10460177 | Task | Create Grafana dashboard for new Sapphire proxy API quality | 10460173 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; dashboard done; Related: 10460175, 10460176, 10460178 |
| 10460178 | Task | Create Grafana dashboard for API migration adoption tracking | 10460173 | SAN SA | Closed | Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; dashboard done; Related: 10460175, 10460176, 10460177 |
| 10774210 | Task | Create Bing API monitors and configure IcM routing with correct severity | 10681024 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; Related: 10460173 |
| 10774241 | Task | Monitor Bing API flight deployment rollout and usage increase | 10681024 | SAN SA | Active | P1; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; flight started 2026-06-01; Related: 10774210, 10460173 |
| 10775149 | Task | Collect evidence and help troubleshoot ApiInvoker bug with VisualSearch | 10681024 | SAN SA | Active | P1; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; Related: 10652759, 10703212 |
| 10783476 | Task | Add treadmill-ready end-to-end tests for Sapphire API endpoints | 10681024 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; PR 6709524 (snrcode, Bing_UX); Related: 10653095, 10656400, 10656625, 10657196 |
| 10778049 | Task | Sapphire: accept empty (but not null) q and cc on Suggestions endpoint | 10681024 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; PR #6750428; snrcode repo; null vs empty-string fix for q/cc on Suggestions; Related: 10656625, 10775149 |
| 10779009 | Epic | Notification Volume Reduction | 10611444 | SAN SA | Active | C3; P1; Assigned: Raul Portugues; iteration 2026.03; reduce volume in top 3 categories to cut OS opt-out; muid-hash cohort experiment; Related: 10459429 (C2 Throttle testing) |
| 10779012 | Task | Investigate notification volume reduction and author RFC | 10779009 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; PR #6719109; ScaffoldingWiki repo; RFC-2026.05.21-Notification-Volume-Reduction-Experiment.md |
| 10801791 | Task | [Android] Add host to NetworkTraceLog telemetry | 10727656 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, Android; PR #6773896; Sapphire repo; IcM 813652080; Related: 10801790 |
| 10801790 | Task | [iOS] Add host to DiagnosticFetcher telemetry | 10727656 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, iOS; PR #6773887; Sapphire repo; IcM 813652080; Related: 10801791, 10803357 |
| 10803357 | Task | [iOS] Add iOS app on Mac telemetry flag | 10727656 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, iOS; PR #6778326; Sapphire repo; adds isIOSAppOnMac to deviceInfo payload; Related: 10801790, 10803397 |
| 10803397 | Task | [Android][iOS] Add MIME type to network telemetry | 10727656 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, Android, iOS; PR #6778184; Sapphire repo; adds Content-Type to network telemetry; Related: 10801791, 10801790, 10803357 |
| 10807151 | Task | Implement notification volume reduction experiment for JustForYou | 10779009 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; PR #6767157; Sapphire-Notifications-JustForYou repo; pt-br cap 3/day; Related: 10807152, 10779012 |
| 10807152 | Task | Implement notification volume reduction experiment for BreakingNews and TopStory | 10779009 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; PR #6767158; Sapphire-Notifications-JustForYou repo; BreakingNews 1/day TopStory 2/day pt-br; Related: 10807151, 10779012 |
| 10807667 | Task | Add BroadcastBearerToken Key Vault reference to BreakingNewsBuilder prod config | 10779009 | SAN SA | Active | P1; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; PR #6782936; Sapphire-Notifications-JustForYou repo; prevents deploy pipeline from wiping broadcast auth token; Related: 10807152 |
| 10837557 | Task | Add testvisualsearch diagnostic endpoint using ApiInvoker loopback | 10681024 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, backend; PR #6792111; snrcode repo; diagnostic /sapphire/api/v1/testvisualsearch via ApiInvoker loopback; Related: 10775149, 10652759 |
| 10810881 | Task | [Android] Add status code to network telemetry | 10727656 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, Android; PR #6777362; Sapphire repo; IcM 813652080; Related: 10810882, 10801791, 10803397 |
| 10810882 | Task | [iOS] Add status code to fetcher failure telemetry | 10727656 | SAN SA | Active | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260601, iOS; PR #6777307; Sapphire repo; IcM 813652080; Related: 10810881, 10801790, 10803397 |
| 10902822 | Task | Troubleshoot VisualSearch API unreliability via ApiInvoker | 10681024 | SAN SA | Active | P1; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260706, backend; ongoing troubleshooting of unreliable VisualSearch upstream via ApiInvoker; Related: 10775149, 10837557, 10703212 |
| 10902859 | Task | Investigate wrong temperature unit in weather notifications (IcM 826588822) | 10465721 | SAN SA | Active | P1; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260706, backend; IcM 826588822 Sev 2; Celsius/Fahrenheit mismatch in weather notifs despite correct prefs |
| 10908349 | Task | Assess complexity and request security group permissions for IcM 831050152 | 10465721 | SAN SA | Closed | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260706, backend; IcM 831050152; need security group permissions to review dashboard |
| 10661965 | Task | Unblock deployments for Breaking News Builder and Just4You Builder | 10465721 | SAN SA | Closed | P2; Assigned/Created: Raul Portugues; iteration 2026.03; created 2026-04-30; cowork with Nicolas Lattuada; fixed 6mo-stale deploy pipelines (BNB + J4Y), deployed direct to prod, added /broadcast tracing + secret auth, reduced logs; Related: 10466092 |
| 10914016 | Task | Add test3visualsearch diagnostic endpoint (MM-style ApiInvoker call) | 10681024 | SAN SA | Closed | P2; Assigned: Raul Portugues; iteration 2026.03; Tags: 20260706, backend; PR #6889085 (snrcode, Bing_UX); test3visualsearch mirrors MM HandleCustomApiRequest/HandleApiResponse via IApiInvoker; isolated Test3VisualSearchService; Related: 10837557, 10902822, 10775149, 10460173 |

## People

| Name | Alias | Role | Notes |
|------|-------|------|-------|
| Gemma Fornons Sera | - | Team member | Assigned to User Story #10377293 (Evaluate BingAPI usages) |
| George Marques | - | Team member | SFI work items |
| Nicolas Lattuada | - | Team member | SFI work items |
| Jiarui Gui | - | Team member | SFI work items |
