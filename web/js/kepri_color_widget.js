/**
 * Kepri colour picker widget for ComfyUI (with alpha).
 *
 * Registers a custom widget type "KEPRI_COLOR". It draws two rows:
 *   1. a rounded colour swatch labelled "<name> (#RRGGBBAA)" — click it to
 *      open the browser's native colour picker (sets the RGB part);
 *   2. an opacity slider — click / drag to set the alpha (AA) part.
 * The single stored value is an 8-digit hex string "#RRGGBBAA", sent as-is to
 * the Python node. Declare a node input as
 *     ("KEPRI_COLOR", {"default": "#FFFFFFFF"})
 * to use it.
 *
 * The widget auto-hides on a node that also has a "background_mode" combo:
 * it is only shown while that combo == "color".
 *
 * Robustness notes (learned from live testing):
 *   - slider drag is captured at the window level (does not rely on litegraph
 *     routing pointermove to widget.mouse, which is version-dependent);
 *   - the native colour <input> is positioned under the cursor at opacity 0
 *     (an off-screen input never delivers "change" inside Electron/ComfyUI).
 *
 * Part of comfyui-kepri (KEPRI). Original implementation.
 */

import { app } from "/scripts/app.js";

const DEFAULT_COLOR = "#FFFFFFFF";
const HEX_RGB = /^#?[0-9a-fA-F]{6}$/;
const HEX_RGBA = /^#?[0-9a-fA-F]{8}$/;

// Always return an uppercase "#RRGGBBAA" (alpha defaults to FF / opaque).
function normalizeRGBA(value) {
    if (typeof value !== "string") return DEFAULT_COLOR;
    let v = value.startsWith("#") ? value.slice(1) : value;
    if (HEX_RGB.test("#" + v)) v = v + "FF";
    if (!HEX_RGBA.test("#" + v)) return DEFAULT_COLOR;
    return ("#" + v).toUpperCase();
}

const rgbOf = (rgba) => rgba.slice(0, 7);             // "#RRGGBB"
const alphaByteOf = (rgba) => parseInt(rgba.slice(7, 9), 16); // 0..255
const withRGB = (rgba, rgb6) => (rgb6 + rgba.slice(7, 9)).toUpperCase();
const withAlpha = (rgba, byte) =>
    (rgba.slice(0, 7) + byte.toString(16).padStart(2, "0")).toUpperCase();

function readableTextColor(rgb6) {
    const h = rgb6.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? "#222222" : "#DDDDDD";
}

// Small checkerboard so transparency is visible behind the swatch.
function drawCheckerboard(ctx, x, y, w, h, cell) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    for (let yy = 0; yy < h; yy += cell) {
        for (let xx = 0; xx < w; xx += cell) {
            const on = ((xx / cell) + (yy / cell)) % 2 === 0;
            ctx.fillStyle = on ? "#bbbbbb" : "#777777";
            ctx.fillRect(x + xx, y + yy, cell, cell);
        }
    }
    ctx.restore();
}

const HIDDEN_SIZE = [0, -4]; // collapses the widget slot (cancels the 4px gap)

function makeColorWidget(name, inputData) {
    let initial = DEFAULT_COLOR;
    if (Array.isArray(inputData) && inputData[1] && inputData[1].default) {
        initial = inputData[1].default;
    }

    const widget = {
        name,
        type: "KEPRI_COLOR",
        value: normalizeRGBA(initial),
        options: { default: normalizeRGBA(initial) },
        hidden: false,
        _swatch: null,
        _slider: null,
    };

    const MARGIN = 15;

    widget.computeSize = function (width) {
        if (this.hidden) return [0, HIDDEN_SIZE[1]];
        return [width, 52];
    };

    widget.draw = function (ctx, node, width, posY, height) {
        if (this.hidden) return;
        const value = normalizeRGBA(this.value);
        const rgb6 = rgbOf(value);
        const aByte = alphaByteOf(value);

        // ---- row 1: colour swatch ----
        const swH = 22;
        const swX = MARGIN;
        const swY = posY + 2;
        const swW = width - MARGIN * 2;
        this._swatch = { x0: swX, x1: swX + swW, y0: swY, y1: swY + swH };

        drawCheckerboard(ctx, swX, swY, swW, swH, 6);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(swX, swY, swW, swH, 8);
        else ctx.rect(swX, swY, swW, swH);
        // fill with the colour at its alpha (over the checkerboard)
        ctx.globalAlpha = aByte / 255;
        ctx.fillStyle = rgb6;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = readableTextColor(rgb6);
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${this.name} (${value})`, width * 0.5, swY + swH * 0.68);

        // ---- row 2: opacity slider ----
        const trH = 6;
        const trX = MARGIN;
        const trY = posY + 36;
        const pctW = 40; // room for "100%"
        const trW = width - MARGIN * 2 - pctW;
        this._slider = { x0: trX, x1: trX + trW, y0: posY + 28, y1: posY + 50 };

        ctx.fillStyle = "#444";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(trX, trY, trW, trH, 3);
        else ctx.rect(trX, trY, trW, trH);
        ctx.fill();

        const t = aByte / 255;
        ctx.fillStyle = "#7a7a7a";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(trX, trY, Math.max(trW * t, 1), trH, 3);
        else ctx.rect(trX, trY, Math.max(trW * t, 1), trH);
        ctx.fill();

        // knob
        ctx.fillStyle = "#ddd";
        ctx.beginPath();
        ctx.arc(trX + trW * t, trY + trH / 2, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#cccccc";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`${Math.round(t * 100)}%`, width - MARGIN, trY + trH);
    };

    const setAlphaFromX = function (self, x) {
        if (!self._slider) return;
        const w = self._slider.x1 - self._slider.x0;
        let t = (x - self._slider.x0) / Math.max(w, 1);
        t = Math.min(1, Math.max(0, t));
        self.value = withAlpha(normalizeRGBA(self.value), Math.round(t * 255));
    };

    const inside = (r, pos) =>
        r && pos[0] >= r.x0 && pos[0] <= r.x1 && pos[1] >= r.y0 && pos[1] <= r.y1;

    widget.mouse = function (event, pos, node) {
        if (this.hidden) return false;
        if (event.type !== "pointerdown") return false;
        const self = this;

        // -- opacity slider: set on click, then capture the drag at window
        //    level so it keeps tracking even if litegraph stops routing
        //    pointermove to this widget. --
        if (inside(this._slider, pos)) {
            setAlphaFromX(self, pos[0]);
            node.setDirtyCanvas(true, true);

            const startClientX = event.clientX;
            const startLocalX = pos[0];
            const scale = (app.canvas && app.canvas.ds && app.canvas.ds.scale) || 1;
            const onMove = (e) => {
                // delta in client px → node-local px (translation cancels out)
                const localX = startLocalX + (e.clientX - startClientX) / scale;
                setAlphaFromX(self, localX);
                node.setDirtyCanvas(true, true);
            };
            const onUp = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            return true;
        }

        // -- swatch: open the native RGB picker, keep current alpha --
        if (inside(this._swatch, pos)) {
            const picker = document.createElement("input");
            picker.type = "color";
            picker.value = rgbOf(normalizeRGBA(this.value));
            // Position it under the cursor at opacity 0: an off-screen input
            // never fires "change" inside Electron / the ComfyUI desktop app.
            picker.style.position = "fixed";
            picker.style.left = (event.clientX || 0) + "px";
            picker.style.top = (event.clientY || 0) + "px";
            picker.style.width = "1px";
            picker.style.height = "1px";
            picker.style.opacity = "0";
            picker.style.border = "0";
            picker.style.padding = "0";
            picker.style.pointerEvents = "none";
            document.body.appendChild(picker);

            const apply = (close) => {
                self.value = withRGB(normalizeRGBA(self.value), picker.value);
                if (node.graph) node.graph._version++;
                node.setDirtyCanvas(true, true);
                if (close && picker.parentNode) picker.remove();
            };
            picker.addEventListener("input", () => apply(false));
            picker.addEventListener("change", () => apply(true));
            // safety net: drop the element if the dialog is dismissed
            picker.addEventListener("blur", () => apply(true));
            picker.click();
            return true;
        }

        return false;
    };

    return widget;
}

// --- conditional visibility: show the KEPRI_COLOR widget only while the
//     node's "background_mode" combo == "color" -------------------------- //
function setColorWidgetVisible(node, widget, visible) {
    if (!widget) return;
    widget.hidden = !visible;
    const sz = node.computeSize();
    node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
    node.setDirtyCanvas(true, true);
}

function wireConditionalVisibility(node) {
    const widgets = node.widgets || [];
    const colorWidget = widgets.find((w) => w.type === "KEPRI_COLOR");
    const modeWidget = widgets.find((w) => w.name === "background_mode");
    if (!colorWidget || !modeWidget) return;

    const update = () =>
        setColorWidgetVisible(node, colorWidget, modeWidget.value === "color");

    const prev = modeWidget.callback;
    modeWidget.callback = function (...args) {
        const r = prev ? prev.apply(this, args) : undefined;
        update();
        return r;
    };

    // defer one tick so a loaded workflow's restored combo value is applied
    setTimeout(update, 0);
}

app.registerExtension({
    name: "kepri.colorWidget",
    getCustomWidgets() {
        return {
            KEPRI_COLOR: (node, inputName, inputData) => ({
                widget: node.addCustomWidget(makeColorWidget(inputName, inputData)),
                minWidth: 150,
                minHeight: 52,
            }),
        };
    },
    nodeCreated(node) {
        wireConditionalVisibility(node);
    },
});
