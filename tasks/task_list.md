# FreightDesk Multi-Shipment Workspace Launch – Task List

**Campaign Owner:** Product Marketing Lead  
**Depends on:** [#14 Over-cap Advisory (single-paste)](https://github.com/FreightDesk/core/issues/14) – must be shipped and verified stable before Launch Week tasks begin.  
**Start date (Pre-launch):** T – 7 days (relative to #14 release)  
**End date (Sustain):** T + 28 days  

---

## Pre-launch Prep (T – 7 to T – 1)

| # | Task | Owner | Deadline | Status |
|---|------|-------|----------|--------|
| P1 | Resolve open questions: single-paste vs. toggle mode UI | Product Manager | T – 7 | [ ] |
| P2 | Decide granularity of rebalancing suggestions (whole stack vs. partial) | Product Manager + Lead Engineer | T – 7 | [ ] |
| P3 | Define per-box collateral surface for user (Fuzzwork value vs. EVE hangar display) | Product Manager, Data Analyst | T – 6 | [ ] |
| P4 | Wire up analytics events for multi-box creation, paste, rebalance clicks | Engineering (frontend) | T – 5 | [ ] |
| P5 | Create sneaky-peek teaser GIF (multi-box UI + one rebalance tooltip) | Content Creator | T – 3 | [ ] |
| P6 | Draft forum teaser post ("Big update for multi-contract haulers – coming soon") | Community Manager | T – 3 | [ ] |
| P7 | Prepare Discord preview channel & invite power users | Community Manager | T – 2 | [ ] |
| P8 | Final QA pass – multi-box paste + rebalance on staging environment | QA Engineer | T – 2 | [ ] |
| P9 | Code freeze for feature branch (no further changes unless blocking) | Lead Engineer | T – 1 | [ ] |

---

## Launch Week (T – 0 to T + 6)

| # | Task | Owner | Deadline | Status |
|---|------|-------|----------|--------|
| L1 | Deploy multi-box workspace to production | Engineering (DevOps) | T – 0 (00:00 UTC) | [ ] |
| L2 | Publish official blog post: full feature walkthrough (text + video embed) | Content Creator, Product Marketing | T – 0 (08:00 UTC) | [ ] |
| L3 | Upload YouTube tutorial video (12–15 min, walkthrough + rebalancing examples) | Content Creator | T – 0 (08:00 UTC) | [ ] |
| L4 | Post Reddit announcement in r/Eve and r/evenewbies (link to blog + video) | Community Manager | T – 0 (09:00 UTC) | [ ] |
| L5 | Send email blast to existing FreightDesk users (with call-to-action “Try split paste”) | Marketing Automation | T – 0 (10:00 UTC) | [ ] |
| L6 | Cross-post to Twitter/X with teaser GIF + blog link | Social Media Coordinator | T – 0 (12:00 UTC) | [ ] |
| L7 | Engage in Reddit AMA thread – answer questions, share tips | Product Manager + Community Manager | T + 0 (evening) | [ ] |
| L8 | Activate targeted ads (if budget allows): EVE YouTube channels, Reddit sidebar | Paid Media Spec. | T + 1 | [ ] |
| L9 | Monitor in-app feature usage (multi-box creation rate, rebalance click rate) | Data Analyst | Daily via dashboard | [ ] |
| L10 | Fix any critical bugs reported within first 48 hours | Engineering (on-call) | T + 0 to T + 2 | [ ] |

---

## Sustain & Optimize (T + 7 to T + 28)

| # | Task | Owner | Deadline | Status |
|---|------|-------|----------|--------|
| S1 | Set up A/B test for landing page: single-paste vs. multi-box champion | Marketing Lead + Engineer | T + 7 | [ ] |
| S2 | Publish “User Story” post featuring an industrialist who saved ISK using rebalance | Content Creator | T + 10 | [ ] |
| S3 | Run social media engagement campaign: “Show us your best multi-box split” (contest) | Community Manager | T + 12 | [ ] |
| S4 | Review analytics: compare activation rate, time-to-first-rebalance, churn | Data Analyst | T + 14 | [ ] |
| S5 | Adjust targeted ad copy/creative based on early data | Paid Media Spec. | T + 16 | [ ] |
| S6 | Launch retargeting ads for users who visited multi-box page but didn’t try it | Paid Media Spec. | T + 18 | [ ] |
| S7 | Product team debrief – gather user feedback (Discord, support tickets, survey) | Product Manager | T + 21 | [ ] |
| S8 | Publish second blog post: “Lessons from the Multi-Shipment Launch” | Product Marketing | T + 24 | [ ] |
| S9 | Close A/B test, document winner, roll out winning landing page permanently | Engineer + Marketing | T + 28 | [ ] |

---

## Risk Items & Blocker Log

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| #14 slips past T – 7 | Campaign delayed – no feature to market | Maintain 1-week buffer after #14 release; fallback to “Coming Soon” teaser-only phase | Product Manager |
| Rebalance suggestions incorrect due to Fuzzwork data lag | User trust damage; manual overrides needed | Include clear tooltip: “Estimate – verify in-game prices” | Data Analyst |
| Multi-box UI confuses existing single-paste users | Drop in retention | In-app migration guide + opt-in toggle | UX Designer |

---

## Review Schedule

- **Daily standup (Launch Week):** 09:00 UTC, 15 minutes, check task status + blocker triage.
- **Weekly checkpoint (Sustain):** Every Monday at 10:00 UTC, 30 minutes, review analytics & adjust plan.
- **Post-mortem:** T + 30 days, document successes, failures, and process improvements.