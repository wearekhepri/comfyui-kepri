from .nodes.segmentation.kepri_mask_merge import KepriMaskMerge
from .nodes.image_processing.kepri_image_finalize import KepriImageFinalize

NODE_CLASS_MAPPINGS = {
    "KepriMaskMerge": KepriMaskMerge,
    "KepriImageFinalize": KepriImageFinalize,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "KepriMaskMerge": "Kepri Mask Merge (Multi-Object → 1 BBox)",
    "KepriImageFinalize": "Kepri Image Finalize (Resize + Crop/Pad + Bg)",
}

# Frontend assets (custom widgets, e.g. the KEPRI_COLOR colour picker).
WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
