/**
 * Kepri colour picker widget for ComfyUI.
 *
 * Registers a custom widget type "KEPRI_COLOR": a rounded swatch labelled
 * "<name> (#RRGGBB)".  Clicking it opens the browser's native colour picker.
 * The stored value is a 6-digit hex string "#RRGGBB", sent as-is to the Python
 * node.  Declare a node input as  ("KEPRI_COLOR", {"default": "#FFFFFF"}).
 *
 * Opacity is handled by a separate native FLOAT widget on the Python side
 * (background_opacity) — not by this widget — to keep it robust.
 *
 * Implementation notes (the previous canvas-drawn version was unreliable):
 *   - the native <input type=color> is appended OFF-SCREEN (-9999px); an input
 *     positioned under the cursor or with pointer-events:none misbehaves;
 *   - we listen to "input" (live preview) and "change" (commit + cleanup) only.
 *     NO "blur" listener: blur fires the instant the OS dialog steals focus,
 *     which would remove the input before "change" ever lands;
 *   - hit-testing checks the X range only (the full widget row), like the
 *     reference implementations — Y bounds derived from draw() do not reliably
 *     match the pointer coordinates across litegraph versions.
 *
 * Part of comfyui-kepri (KEPRI). Original implementation.
 */

import { app } from "/scripts/app.js";

const DEFAULT_COLOR = "#FFFFFF";
const HEX6 = /^#?[0-9a-fA-F]{6}$/;

// Always return an uppercase "#RRGGBB"; tolerate a trailing alpha or "#RGB".
function normalizeHex(value) {
    if (typeof value !== "string") return DEFAULT_COLOR;
    let v = value.startsWith("#") ? value.slice(1) : value;
    if (v.length === 3) v = v.split("").map((c) => c + c).join("");
    if (v.length >= 6) v = v.slice(0, 6);
    return HEX6.test("#" + v) ? ("#" + v).toUpperCase() : DEFAULT_COLOR;
}

function readableTextColor(hex6) {
    const h = hex6.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? "#222222" : "#DDDDDD";
}

function makeColorWidget(name, inputData) {
    let initial = DEFAULT_COLOR;
    if (Array.isArray(inputData) && inputData[1] && inputData[1].default) {
        initial = inputData[1].default;
    }

    const widget = {
        name,
        type: "KEPRI_COLOR",
        value: normalizeHex(initial),
        options: { default: normalizeHex(initial) },
    };

    const MARGIN = 15;
    const SW_H = 22;

    widget.computeSize = function (width) {
        return [width, SW_H];
    };

    widget.draw = function (ctx, node, width, posY, height) {
        const value = normalizeHex(this.value);
        const x = MARGIN;
        const w = width - MARGIN * 2;
        const y = posY + (height - SW_H) / 2;
        const r = 8;

        ctx.fillStyle = value;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, SW_H, r);
        else ctx.rect(x, y, w, SW_H);
        ctx.fill();
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = readableTextColor(value);
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${this.name} (${value})`, width * 0.5, y + SW_H * 0.68);
    };

    widget.mouse = function (event, pos, node) {
        if (event.type !== "pointerdown") return false;
        // X range only — the whole widget row is clickable.
        if (pos[0] < MARGIN || pos[0] > node.size[0] - MARGIN) return false;

        const self = this;
        const picker = document.createElement("input");
        picker.type = "color";
        picker.value = normalizeHex(this.value);
        picker.style.position = "absolute";
        picker.style.left = "-9999px";
        picker.style.top = "-9999px";
        document.body.appendChild(picker);

        const commit = (remove) => {
            self.value = normalizeHex(picker.value);
            if (node.graph) node.graph._version++;
            node.setDirtyCanvas(true, true);
            if (remove && picker.parentNode) picker.remove();
        };
        picker.addEventListener("input", () => commit(false));   // live preview
        picker.addEventListener("change", () => commit(true));   // commit + cleanup
        picker.click();
        return true;
    };

    return widget;
}

app.registerExtension({
    name: "kepri.colorWidget",
    getCustomWidgets() {
        return {
            KEPRI_COLOR: (node, inputName, inputData) => ({
                widget: node.addCustomWidget(makeColorWidget(inputName, inputData)),
                minWidth: 150,
                minHeight: 22,
            }),
        };
    },
});
