# Measurement Plan: FreightDesk Multi-Shipment Workspace Launch

## 1. Overview & Purpose

This document defines the analytics instrumentation, key performance indicators, and dashboard requirements for the FreightDesk Multi-Shipment Workspace feature (multi-box paste with cross-contract collateral rebalancing). The measurement plan supports the marketing campaign “Multi-Shipment Workspace Launch” and will track user adoption, engagement with the rebalancing advisor, and downstream contract creation. Data collected will inform feature optimization and campaign iteration across Pre-launch, Launch, and Sustain phases.

## 2. Objectives & Goals

| Goal | Dimension | Metric Definition |
|------|-----------|-------------------|
| Drive adoption of multi-box paste | Adoption | % of active FreightDesk users who attempt multi-box mode within 7 days of exposure |
| Enable cost optimization via rebalancing | Engagement | % of multi-box sessions where user acts on a rebalancing suggestion (moves collateral) |
| Increase successful multi-contract creation | Conversion | % of users who complete a multi-box session and subsequently create at least two contracts in-game |
| Validate product-market fit | Retention | % of users who return to multi-box mode within 30 days of first use |

## 3. Events & Properties

All events are sent server-side via the existing analytics pipeline (PostHog / Segment). Event names use `snake_case` with a `freightdesk_multibox_` prefix.

### 3.1 User Identity & Session

| Event | Trigger | Properties |
|-------|---------|------------|
| `multibox_session_start` | User opens multi-box workspace (toggle or new URL) | `session_id` (UUID), `source` (paste_page / direct_nav / campaign_link), `box_count_at_start` (int) |
| `multibox_session_end` | User closes workspace or navigates away | `session_id`, `duration_seconds`, `total_boxes_created`, `boxes_with_items`, `rebalancing_actions_taken`, `suggestion_viewed` (bool) |

### 3.2 Workspace Interaction

| Event | Trigger | Properties |
|-------|---------|------------|
| `multibox_box_added` | User clicks “Add contract box” | `session_id`, `new_box_index` (0‑based), `total_boxes` after addition |
| `multibox_box_removed` | User removes a box (with confirmation) | `session_id`, `removed_box_index`, `was_non_empty` (bool) |
| `multibox_paste` | User pastes item list into a box | `session_id`, `box_index`, `item_count`, `parse_success` (bool), `parse_duration_ms` |
| `multibox_parse_error` | PARSER returns errors | `session_id`, `box_index`, `error_type` (unrecognized_item / ambiguous_name / invalid_quantity), `raw_input_truncated` |

### 3.3 Rebalancing Advisor

| Event | Trigger | Properties |
|-------|---------|------------|
| `multibox_rebalance_viewed` | User opens/reloads the rebalancing suggestion panel | `session_id`, `suggestion_count`, `total_collateral_imbalance`, `formula_type` (max / sum / rate / flat) |
| `multibox_rebalance_action` | User moves items between boxes (via drag‑and‑drop or suggestion “move” button) | `session_id`, `from_box_index`, `to_box_index`, `item_count_moved`, `collateral_value_moved`, `rewward_delta_before_after` |
| `multibox_rebalance_dismissed` | User closes suggestion without acting | `session_id`, `reason` (not_useful / too_complex / will_handle_later) – optional feedback |

### 3.4 Conversion & Downstream

| Event | Trigger | Properties |
|-------|---------|------------|
| `multibox_contract_prepared` | User exports box data (copy manifest or open EVE‑client integration) | `session_id`, `box_index`, `contract_volume`, `contract_collateral`, `reward_formula` |
| `multibox_cost_estimate_viewed` | User clicks “Get advice” for a specific box or all boxes | `session_id`, `estimated_cost`, `confidence_score` (based on market data age) |

### 3.5 Marketing Channel Attribution

Use UTM parameters on all external links. Store `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` in session start event. Additionally track:

| Event | Trigger | Properties |
|-------|---------|------------|
| `campaign_email_click` | Click on email link (tracked via Mailchimp/Postmark webhooks) | `email_id`, `user_id`, `landing_page` |
| `campaign_reddit_view` | View of Reddit announcement post (Reddit pixel) | separate, stitched by user_id if available |
| `in_app_tooltip_impression` | In-app tooltip/banner for multi-box | `tooltip_id`, `page`, `user_segment` (new / returning) |

## 4. KPIs (Key Performance Indicators)

### 4.1 Adoption & Funnel

| KPI | Formula | Target | Phase |
|-----|---------|--------|-------|
| Feature Awareness | # of unique users who see any multi-box UI element / total active users in period | ≥35% | Launch (Week 2) |
| Feature Attempt | # of unique users who start a multibox session / # who were aware | ≥20% | Launch |
| Onboarding Completion | # of sessions with at least one successful paste / # session starts | ≥60% | Sustain |
| Rebalancing Engagement | # of sessions with ≥1 rebalance action / # sessions with rebalance view | ≥15% | Sustain |
| Retention (Week 4) | # of users returning to multi-box in week 4 / # of first-time users in week 1 | ≥10% | Sustain |

### 4.2 Cost Optimization Impact

| KPI | Formula | Target |
|-----|---------|--------|
| Avg collateral moved per action | Sum(collateral_value_moved) / # rebalance actions | ≥50M ISK |
| Reward reduction rate | % of sessions where user’s total reward after rebalancing is lower than original single-box estimate | ≥40% of rebalance sessions |
| Multi-contract conversion | % of users creating ≥2 contracts within 24h of session | ≥8% |

### 4.3 Campaign ROI

| KPI | Formula | Target |
|-----|---------|--------|
| Cost per acquired multibox user | Total campaign spend / # of new multibox users acquired via campaign | < $0.50/ea |
| Channel conversion rate | % of clicks from each channel that result in a session start | YouTube: ≥3%, Reddit: ≥5%, Email: ≥10% |
| Organic word‑of‑mouth | Increase in organic traffic to multibox mode from non‑UTM sources during sustain phase | +15% week‑over‑week |

## 5. Dashboards

### 5.1 Executive Summary (daily, team‑wide)

- **Widget A**: Adoption Funnel (awareness → attempt → paste → rebalance → contract) with week‑over‑week trends.
- **Widget B**: Top channels by session start attribution (stacked bar).
- **Widget C**: Rebalance engagement rate + average collateral moved per action.
- **Widget D**: User retention cohorts (weekly cohorts, % returning each subsequent week).

### 5.2 Product Analytics (real‑time, PM & engineers)

- **Widget E**: Error rate per paste (parse errors vs successful parses) – line chart.
- **Widget F**: Average number of boxes created per session (histogram).
- **Widget G**: Rebalance suggestion adoption rate by formula type (max vs others).
- **Widget H**: Event frequency: box_added, box_removed, paste, rebalance_view, rebalance_action.

### 5.3 Marketing Dashboard (campaigns, weekly)

- **Widget I**: Campaign funnel: impressions → clicks → session starts → retention (one bar per channel).
- **Widget J**: Time from first in‑app tooltip impression to first multibox session (distribution).
- **Widget K**: Cost per user by channel (table with spend, users, CPA).

## 6. Data Pipeline & Governance

- **Ingestion**: Events sent via `window.postMessage` from the client to the background script, then to the server. Server validates schema (JSON Schema available in `observability/events/schemas/multibox_events.json`).
- **Storage**: Events durable in Snowflake (raw), aggregated into Redshift for dashboards via dbt models.
- **PII**: No EVE character names or API keys are captured in events. User_id is hashed on the client before transmission.
- **Retention**: Raw events retained 90 days; aggregated metrics kept for 2 years.
- **Alerting**: If error rate (paste) exceeds 15% in any hour, alerts go to #freightdesk-alerts in Slack. Rebalance engagement dropping below 5% for 3 days triggers a review.

## 7. Success Criteria (Launch Gates)

To promote from Beta to General Availability:

1. **Adoption**: ≥1,000 unique users attempt multibox in a single week.
2. **Stability**: Paste error rate ≤8%, rebalance suggestion response time ≤2s p95.
3. **Value**: ≥20% of rebalance sessions result in the user reducing their total reward by ≥10%.
4. **Retention**: ≥15% of GA users use multibox again within 30 days.

## 8. Iteration Plan

After each campaign phase, update this measurement plan based on learnings:

- **Pre‑launch**: Measure baseline (single‑paste usage, contract creation counts). Adjust event fidelity if needed.
- **Launch Week**: Monitor real‑time dashboards for spikes/bottlenecks. Survey a sample of users via in‑app prompt (NPS for multi‑box).
- **Sustain (Weeks 2‑4)**: Run A/B tests on UI placement of the rebalance panel and suggestion granularity (move whole stack vs. move partial). Add new events for any variations.

## 9. Appendix: Schema Compliance Notes

All events must adhere to the existing analytics schema (`schemas/analytics/event.schema.json`). Use nested `properties` for custom attributes. Boolean values must be lowercase. Timestamps in UTC as ISO 8601. Do not send raw EVE item IDs as strings; encode as `int64`. For security, all pasted item names are truncated to 100 characters when logged.

---

*Version 1.0 – Drafted for Multi-Shipment Workspace Launch*  
*Last updated: 2026-05-30*  
*Owner: Product Analytics Team*