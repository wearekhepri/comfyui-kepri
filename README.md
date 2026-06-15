# ComfyUI Kepri Nodes Pack

A collection of ComfyUI custom nodes developed by **Kepri** (an inventory and cross-listing app for fashion resellers). 

We build these nodes for our own production backend pipelines (deployed on Modal / RunPod via FastAPI). They power our automated image processing, 3D asset generation, and inventory management workflows. 

They are designed to be lightweight, zero-dependency (only `torch`), and suited for API-driven ComfyUI workflows where every parameter needs to be exposed and configurable programmatically.

---

## Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/wearekhepri/comfyui-kepri.git
```

Restart ComfyUI and refresh your browser. The nodes will appear under the **Kepri** category in the Add Node menu.

*Note: Zero extra dependencies required. The nodes use the `torch` version already shipped with your ComfyUI environment.*

---

## Included Nodes

| Node Name | Category | Description | Documentation |
|---|---|---|---|
| **KepriMaskMerge** | Segmentation | Merges multiple detection masks into a single unified mask. Solves the problem of multi-part objects (like shoes) being cropped incorrectly by downstream nodes. | [Read Docs](./docs/segmentation/KepriMaskMerge.md) |
| **KepriImageFinalize** | Image Processing | One-stop image finalisation. Resizes by longest edge, crops/pads to a specific aspect ratio, and composites the result onto transparent, solid color, or photo backgrounds. | [Read Docs](./docs/image_processing/KepriImageFinalize.md) |

*(We will continuously add more nodes here as we develop our internal 2D and 3D pipelines).*

---

## Example: Background Removal Pipeline

While these nodes are general-purpose, here is an example of how they fit into a production graph (our automated Background Removal and Product Centering pipeline):

```
LoadImage
    -> ResizeImagesByLongerEdge
        -> GroundingDetector (prompt = "shoe")
            -> masks [N, H, W]
                -> [KepriMaskMerge]
                    -> merged_mask [1, H, W]
                        -> GrowMask
                            -> MaskBoundingBox+
                                -> RMBG-2.0 (background removal)
                                    -> [KepriImageFinalize]
                                        -> image (final product photo)
                                        -> mask (alpha if transparent)
                                            -> SaveImage
```

---

## License

MIT License.
