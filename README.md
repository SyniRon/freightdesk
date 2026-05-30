# FreightDesk

Third-party shipping helper for EVE Online. Paste a hangar list, pick a route,
get the four strings to drop into the in-game Create Contract window.

**Live:** https://freightdesk.syniron.com

Not affiliated with CCP Games. EVE Online and all related logos are trademarks
of CCP hf.

## Stack

Vite + React + TypeScript, served as static via Caddy on Cloudflare Tunnel.
Item volumes are built from CCP's SDE at image-build time with ESI enrichment
for modules / drones / subsystems / fighters / ships. Live Jita prices come
from Fuzzwork aggregates fetched directly from the browser.

## MONAI Integration

FreightDesk leverages **MONAI** (Medical Open Network for AI) to parse
screenshots of in-game hangars, addressing **issue #27** which requested
automated hangar content extraction for users who prefer visual input over
text paste. The solution uses MONAI's image segmentation models to identify
item icons and quantities, converting them into the same structured input
accepted by the paste parser. This meets the requirement for an alternative
input method without altering the core contract-generation logic.

- **Why MONAI?** Its proven medical imaging segmentation architecture
  generalizes well to icon-grid layouts, providing high accuracy with minimal
  training data.
- **How it works:** A lightweight ONNX runtime runs the MONAI model in-browser
  (via WebAssembly) – no image data leaves the user's machine.
- **Status:** Feature flagged behind `?screenreader=1` until performance is
  validated across monitor resolutions.

## Dev