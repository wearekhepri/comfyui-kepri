# KepriMaskMerge

## Overview
Object detection models (like GroundingDINO) often return multiple masks for a single conceptual item (e.g., a pair of shoes results in 2 separate masks). However, downstream background removal and cropping nodes usually expect a **single unified mask**.

`KepriMaskMerge` bridges this gap.

## Features
- **Union of Masks**: Performs a logical OR (`max(dim=0)`) on all input masks. The resulting bounding box will englobe every part.
- **Noise Filtering**: Automatically drops masks whose area is below a configurable percentage of the total image area.
- **Graceful Fallback**: If zero masks are detected, or if all masks fall below the noise threshold, the node outputs a full-image white mask. This prevents the pipeline from crashing in automated backends.

## Inputs
| Name | Type | Default | Description |
|---|---|---|---|
| `masks` | MASK | *Required* | Accepts `[N, H, W]` or `[H, W]`. Usually plugged from detection nodes. |
| `min_mask_area_percent` | FLOAT | `1.0` | Masks taking up less than X% of the image area are discarded. Set to `0` to keep all masks. |

## Outputs
| Name | Type | Shape | Description |
|---|---|---|---|
| `merged_mask` | MASK | `[1, H, W]` | A single unified mask ready for downstream processing. |

## Why Union instead of Intersection?
If an object consists of disconnected parts (e.g., a pair of shoes side-by-side), their masks have **no overlap**. An intersection would result in an empty mask. The union ensures both parts are kept and bounded together.