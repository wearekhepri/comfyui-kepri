import torch


class KepriImageFinalize:
    """
    One-stop finalisation node for the Kepri Background Removal V2 pipeline.

    After RMBG (or any background-removal step) you usually need to do the same
    boring chores at the very end of a workflow.  This node does them all in one
    torch-only pass, in the order that actually matters:

      1. Find the object (bounding box of the mask) and re-centre it.
         Without a mask, the whole frame is treated as the object.
      2. Add padding (breathing room) around the centred object — height and
         width independently, in percent (of the object) or in pixels (of the
         final output).
      3. Frame to a target aspect ratio (square, 4:3, original …).
      4. Composite onto a background — and only now, so the padding is already
         baked in:
           - transparent  (keep RGB + mask for downstream use)
           - solid color  (#RRGGBB picker + a separate background_opacity)
           - image preset (concrete, wood, marble …), cover-cropped to the
             final canvas — so the padding fixes exactly how much of the
             background image shows.

    Every parameter can be wired to a workflow API input (prompt variable) when
    the workflow is executed from Modal / RunPod / Kepri.
    """

    CATEGORY = "Kepri/Background"
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "finalize"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "longest_edge": ("INT", {"default": 2048, "min": 64, "max": 8192, "step": 8}),
                "aspect_ratio": (
                    ["original", "1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "5:4", "4:5"],
                    {"default": "1:1"},
                ),
                "background_mode": (
                    ["transparent", "color", "image_preset"],
                    {"default": "color"},
                ),
                "background_color": ("KEPRI_COLOR", {"default": "#FFFFFF", "tooltip": "Couleur de fond (mode 'color'). Clique la pastille = sélecteur de couleur natif du navigateur. Format #RRGGBB."}),
                "background_opacity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.05, "tooltip": "Opacité du fond (mode 'color' uniquement). 1 = couleur pleine, 0 = fond transparent, entre = fond semi-transparent (l'opacité est portée par la sortie mask)."}),
                # NOTE: the padding widgets are intentionally kept LAST.  ComfyUI
                # restores widget values by *position*, so appending new widgets
                # (rather than inserting them in the middle) prevents the values
                # of workflows saved before padding existed from shifting onto
                # the wrong widgets.
                "padding_unit": (
                    ["percent", "pixels"],
                    {"default": "percent"},
                ),
                "padding_h": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 1, "tooltip": "Marge verticale (haut ET bas) autour de l'objet centré. Unité = padding_unit ci-dessus. En 'percent' = % de la hauteur de l'objet (ex: 10) ; en 'pixels' = nb de px dans la résolution finale. Appliqué AVANT le fond."}),
                "padding_w": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 1, "tooltip": "Marge horizontale (gauche ET droite) autour de l'objet centré. Unité = padding_unit ci-dessus. En 'percent' = % de la largeur de l'objet (ex: 10) ; en 'pixels' = nb de px dans la résolution finale. Appliqué AVANT le fond."}),
            },
            "optional": {
                "mask": ("MASK",),
                "background_image": ("IMAGE",),
            },
        }

    # ------------------------------------------------------------------ #
    @staticmethod
    def _hex_to_rgb(hex_str, device):
        """Parse '#RRGGBB' (also '#RGB', tolerates a trailing alpha) → rgb_tensor[3].

        Falls back to white on malformed input so the node never crashes on a bad
        value coming from the API / a stale widget.
        """
        h = str(hex_str).lstrip("#").strip()
        if len(h) == 3:          # #RGB shorthand
            h = "".join([c * 2 for c in h])
        try:
            r = int(h[0:2], 16) / 255.0
            g = int(h[2:4], 16) / 255.0
            b = int(h[4:6], 16) / 255.0
        except (ValueError, IndexError):
            r = g = b = 1.0
        return torch.tensor([r, g, b], dtype=torch.float32, device=device)

    @staticmethod
    def _object_bbox(mask, thresh=0.1):
        """Union bounding box of the object across the batch.

        mask: [B,H,W] in 0..1.  Returns (y0, y1, x0, x1) with y1/x1 exclusive,
        or None when the mask is empty (caller then uses the full frame).
        """
        if mask is None:
            return None
        m = mask > thresh
        if not bool(m.any()):
            return None
        rows = m.any(dim=0).any(dim=1)   # [H] : any batch, any column
        cols = m.any(dim=0).any(dim=0)   # [W] : any batch, any row
        ys = torch.nonzero(rows, as_tuple=False).flatten()
        xs = torch.nonzero(cols, as_tuple=False).flatten()
        return (int(ys[0]), int(ys[-1]) + 1, int(xs[0]), int(xs[-1]) + 1)

    @staticmethod
    def _resize_image(img, new_h, new_w):
        """Bicubic resize of [B,H,W,C] → [B,new_h,new_w,C], clamped to 0..1."""
        return (
            torch.nn.functional.interpolate(
                img.permute(0, 3, 1, 2),
                size=(new_h, new_w),
                mode="bicubic",
                align_corners=False,
            )
            .permute(0, 2, 3, 1)
            .clamp(0.0, 1.0)
        )

    @staticmethod
    def _resize_mask(msk, new_h, new_w):
        """Bilinear resize of [B,H,W] → [B,new_h,new_w], clamped to 0..1."""
        return (
            torch.nn.functional.interpolate(
                msk.unsqueeze(1),
                size=(new_h, new_w),
                mode="bilinear",
                align_corners=False,
            )
            .squeeze(1)
            .clamp(0.0, 1.0)
        )

    @staticmethod
    def _resize_cover(img, target_h, target_w):
        """Resize *img* so it completely covers (target_h, target_w).

        The image is scaled uniformly until the smallest dimension matches
        the target, then the excess is center-cropped.  No black bars.
        img: [B, H, W, C].  Returns [B, target_h, target_w, C].
        """
        B, H, W, C = img.shape
        scale = max(target_w / W, target_h / H)
        new_w = int(round(W * scale))
        new_h = int(round(H * scale))
        img = (
            torch.nn.functional.interpolate(
                img.permute(0, 3, 1, 2),
                size=(new_h, new_w),
                mode="bicubic",
                align_corners=False,
            )
            .permute(0, 2, 3, 1)
            .clamp(0.0, 1.0)
        )
        y0 = (new_h - target_h) // 2
        x0 = (new_w - target_w) // 2
        return img[:, y0 : y0 + target_h, x0 : x0 + target_w, :]

    # ------------------------------------------------------------------ #
    def finalize(
        self,
        image,
        longest_edge,
        aspect_ratio,
        background_mode,
        background_color,
        background_opacity,
        padding_unit,
        padding_h,
        padding_w,
        mask=None,
        background_image=None,
    ):
        dev = image.device
        B, H, W, C = image.shape

        # RMBG outputs RGBA; the alpha is carried by the mask input, so drop it.
        if C == 4:
            image = image[..., :3]
            C = 3

        # -- 1. object bounding box (object-aware) -------------------------- #
        # With a mask we crop to the object and re-centre it; without a mask
        # the whole frame is treated as the "object".
        bbox = self._object_bbox(mask) if mask is not None else None
        if bbox is None:
            y0, y1, x0, x1 = 0, H, 0, W
        else:
            y0, y1, x0, x1 = bbox

        obj_img = image[:, y0:y1, x0:x1, :]
        obj_msk = mask[:, y0:y1, x0:x1] if mask is not None else None
        oh, ow = (y1 - y0), (x1 - x0)
        ratio_obj = ow / max(oh, 1)

        # -- 2. final canvas size (longest_edge + aspect ratio) ------------- #
        if aspect_ratio == "original":
            R = ratio_obj
        else:
            a, b = map(int, aspect_ratio.split(":"))
            R = a / b
        if R >= 1.0:
            Wc, Hc = longest_edge, max(1, int(round(longest_edge / R)))
        else:
            Hc, Wc = longest_edge, max(1, int(round(longest_edge * R)))

        # -- 3. object size inside the canvas, honouring the padding -------- #
        # Padding is the *minimum* margin around the centred object.  The axis
        # that is not the binding constraint just gets a larger margin (object
        # stays centred); that extra space is filled by the background.
        if padding_unit == "percent":
            pw = max(0.0, padding_w) / 100.0
            ph = max(0.0, padding_h) / 100.0
            obj_w_max = Wc / (1.0 + 2.0 * pw)   # so margin == pw * object width
            obj_h_max = Hc / (1.0 + 2.0 * ph)
        else:  # pixels, measured in the final output resolution (per side)
            obj_w_max = Wc - 2.0 * max(0.0, padding_w)
            obj_h_max = Hc - 2.0 * max(0.0, padding_h)
        obj_w_max = max(1.0, obj_w_max)
        obj_h_max = max(1.0, obj_h_max)

        scale = min(obj_w_max / ow, obj_h_max / oh)
        new_ow = min(max(1, int(round(ow * scale))), Wc)
        new_oh = min(max(1, int(round(oh * scale))), Hc)

        obj_img = self._resize_image(obj_img, new_oh, new_ow)
        if obj_msk is not None:
            obj_msk = self._resize_mask(obj_msk, new_oh, new_ow)

        # -- 4. place the object centred on the canvas ---------------------- #
        top = (Hc - new_oh) // 2
        left = (Wc - new_ow) // 2
        canvas_rgb = torch.zeros((B, Hc, Wc, 3), dtype=torch.float32, device=dev)
        canvas_alpha = torch.zeros((B, Hc, Wc), dtype=torch.float32, device=dev)
        canvas_rgb[:, top:top + new_oh, left:left + new_ow, :] = obj_img
        if obj_msk is not None:
            canvas_alpha[:, top:top + new_oh, left:left + new_ow] = obj_msk
        else:
            canvas_alpha[:, top:top + new_oh, left:left + new_ow] = 1.0

        # -- 5. background composite (last, over the padded canvas) --------- #
        alpha = canvas_alpha.unsqueeze(-1)   # [B,Hc,Wc,1]
        inv = 1.0 - alpha

        if background_mode == "transparent":
            # Cut the RGB too, not just the alpha: zero-out every pixel outside
            # the mask so tools that ignore the alpha channel (and a plain
            # SaveImage) still get the object only — no leftover background
            # left inside the bbox rectangle.
            return (canvas_rgb * alpha, canvas_alpha)

        if background_mode == "color":
            bg_col = self._hex_to_rgb(background_color, dev)
            bg_alpha = float(max(0.0, min(1.0, background_opacity)))
            bg = bg_col.view(1, 1, 1, 3).expand(B, Hc, Wc, 3)
            out = canvas_rgb * alpha + bg * inv
            # background_opacity 1 → solid colour ; 0 → transparent ; between →
            # semi-transparent coloured background (opacity carried by the mask).
            out_mask = (alpha + inv * bg_alpha).squeeze(-1)
            return (out, out_mask)

        # image_preset
        if background_image is None:
            # no preset provided → black fallback (user will see it and fix)
            bg = torch.zeros((B, Hc, Wc, 3), dtype=torch.float32, device=dev)
        else:
            bg = background_image.to(dev)
            # Strip alpha if present so both RGB and RGBA presets work.
            if bg.shape[-1] == 4:
                bg = bg[..., :3]
            # Cover the *final* canvas (object + padding) → the padding fixes
            # exactly how much of the background image is visible.
            bg = self._resize_cover(bg, Hc, Wc)
            if bg.shape[0] < B:
                bg = bg.repeat(B, 1, 1, 1)
            elif bg.shape[0] > B:
                bg = bg[:B]

        out = canvas_rgb * alpha + bg * inv
        return (out, canvas_alpha)
