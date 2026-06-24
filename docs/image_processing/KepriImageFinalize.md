# KepriImageFinalize

## Overview
A one-stop image finalisation node designed to be placed at the very end of an image processing workflow (typically after Background Removal).

It replaces complex chains of resizing and compositing nodes with a single, highly configurable node, making it perfect for API-driven workflows where aspect ratios and backgrounds need to be changed programmatically.

## Features
1. **Resize by longest edge**: Scales the image so its longest side matches a target pixel count, preserving aspect ratio.
2. **Crop / Pad to Aspect Ratio**: Fits the image into a specific ratio (`1:1`, `4:3`, `16:9`, etc.). It automatically pads with transparency/color if the image is too small, or center-crops if the image is too wide.
3. **Background Compositing**: Merges the foreground object onto a chosen background:
   - **Transparent**: Passes the alpha mask through.
   - **Solid Color**: Fills the background with a specific colour, chosen via an in-node colour picker (click the swatch → native RGB picker) with an **opacity slider** (alpha). Opacity `1.0` = solid colour, `0.0` = transparent, in between = semi-transparent coloured background.
   - **Image Preset**: Composites the object onto a reference photo (like concrete, wood, marble). Uses a `cover` scaling mode to ensure the background fills the entire frame without stretching or leaving black bars.

## Inputs
| Name | Type | Default | Description |
|---|---|---|---|
| `image` | IMAGE | *Required* | The cut-out image from upstream nodes `[B, H, W, 3]` or `[B, H, W, 4]`. |
| `longest_edge` | INT | `2048` | Target size for the longest side (e.g. `2048` for high-res e-commerce). |
| `aspect_ratio` | COMBO | `1:1` | Target crop ratio: `original`, `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `2:3`, `3:2`, `5:4`, `4:5`. |
| `background_mode` | COMBO | `color` | Choose between `transparent`, `color`, or `image_preset`. |
| `background_color` | KEPRI_COLOR | `#FFFFFFFF` | Background colour for `background_mode == color`. In-node picker (swatch → native RGB picker) + opacity slider (alpha). Value is `#RRGGBB` or `#RRGGBBAA`. |
| `mask` | MASK | *Optional* | Alpha mask from background removal. Required for `transparent` and `color` modes to composite cleanly. |
| `background_image` | IMAGE | *Optional* | Preset photo used when `background_mode == image_preset`. |

## Outputs
| Name | Type | Description |
|---|---|---|
| `image` | IMAGE | Final resized, cropped, and composited RGB image. |
| `mask`  | MASK  | Final alpha mask. In `color` mode it carries the resulting opacity (object opaque; background at the colour's alpha). |