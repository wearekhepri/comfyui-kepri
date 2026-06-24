# KepriImageFinalize

## Overview
A one-stop image finalisation node designed to be placed at the very end of an image processing workflow (typically after Background Removal).

It replaces complex chains of crop / resize / pad / composite nodes with a single, highly configurable node, making it perfect for API-driven workflows where framing and backgrounds need to be changed programmatically.

## What it does (in order)
1. **Object-aware crop & centre**: when a `mask` is connected, the node finds the bounding box of the object and re-centres it. Padding `0` therefore means *the object is as large as possible* in the frame. Without a mask, the whole frame is treated as the object.
2. **Padding**: breathing room around the centred object — **height and width independently**, in **percent** (of the object's size) or in **pixels** (of the final output resolution). This is applied **before** the background, so it also fixes how a background image is cropped.
3. **Aspect ratio / format**: the chosen ratio (`1:1`, `4:3`, `original`, …) defines the **shape** of the final canvas; `longest_edge` defines its **resolution**. The object is scaled (never distorted, never re-cropped) to fit inside the canvas while respecting the padding.
4. **Background compositing** (last): merges the object onto the chosen background:
   - **Transparent**: passes the alpha mask through.
   - **Solid Color**: fills the background with a colour chosen via the in-node colour picker (click the swatch → native RGB picker) with an **opacity slider** (alpha). Opacity `1.0` = solid colour, `0.0` = transparent, in between = semi-transparent coloured background.
   - **Image Preset**: composites the object onto a reference photo (concrete, wood, marble…). Uses a `cover` scaling mode against the **final canvas**, so the padding fixes exactly how much of the background image shows — no stretching, no black bars.

## Padding semantics
Padding is the **minimum margin** between the centred object and the canvas edge.

When the object's aspect ratio differs from the chosen format, the two paddings cannot both be honoured exactly without distorting or re-cropping the object. The node keeps the object **centred and undistorted**: the binding axis gets exactly its padding, and the axis stretched by the format gets a *larger* margin (the extra space is filled by the background).

> Example — square object, format `4:3`, `padding 10%` (percent): vertical margin = exactly 10% of the object's height; the horizontal margin is larger because `4:3` widens the canvas.

## Inputs
| Name | Type | Default | Description |
|---|---|---|---|
| `image` | IMAGE | *Required* | The cut-out image from upstream nodes `[B, H, W, 3]` or `[B, H, W, 4]`. |
| `longest_edge` | INT | `2048` | Resolution of the **longest side of the final canvas** (e.g. `2048` for high-res e-commerce). |
| `aspect_ratio` | COMBO | `1:1` | Target canvas shape: `original`, `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `2:3`, `3:2`, `5:4`, `4:5`. `original` = the object's own bounding-box ratio. |
| `padding_unit` | COMBO | `percent` | `percent` = padding is a % of the object's size; `pixels` = padding in final-output pixels. |
| `padding_h` | FLOAT | `0.0` | Vertical margin (top **and** bottom) around the centred object. `0` = object as large as possible. |
| `padding_w` | FLOAT | `0.0` | Horizontal margin (left **and** right) around the centred object. `0` = object as large as possible. |
| `background_mode` | COMBO | `color` | `transparent`, `color`, or `image_preset`. |
| `background_color` | KEPRI_COLOR | `#FFFFFFFF` | Background colour for `background_mode == color`. In-node picker (swatch → native RGB picker) + opacity slider (alpha). Value is `#RRGGBB` or `#RRGGBBAA`. |
| `mask` | MASK | *Optional* | Alpha mask from background removal. Drives the object-aware crop and clean compositing. Without it, the whole frame is used. |
| `background_image` | IMAGE | *Optional* | Preset photo used when `background_mode == image_preset`. |

## Outputs
| Name | Type | Description |
|---|---|---|
| `image` | IMAGE | Final cropped, padded, formatted, and composited RGB image. |
| `mask`  | MASK  | Final alpha mask. In `color` mode it carries the resulting opacity (object opaque; background at the colour's alpha). |
