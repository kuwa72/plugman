#!/usr/bin/env python3
"""Generate assets/icon.ico for Plugman.

Draws a TRS-style audio plug glyph on a Tokyo Night (#1a1b26) rounded
square, then exports a multi-size Windows .ico. Requires Pillow.
"""

from PIL import Image, ImageDraw

CANVAS = 512
BG = "#1a1b26"
FG = "#24283b"
BLUE = "#7aa2f7"
CYAN = "#7dcfff"


def draw_plug() -> Image.Image:
    """Draw the plug glyph upright on a transparent layer (oversized for rotation)."""
    layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = CANVAS // 2

    # Plug body (thick blue cylinder).
    d.rounded_rectangle([cx - 48, 236, cx + 48, 392], radius=26, fill=BLUE)

    # Strain relief collar where cable meets body.
    d.rounded_rectangle([cx - 26, 380, cx + 26, 414], radius=12, fill=BLUE)

    # Cable: thick smooth curve leaving the body, dipping down then
    # sweeping up to the right like a loose audio cable.
    d.line(
        [(cx, 400), (cx, 470), (cx + 45, 520), (cx + 110, 515),
         (cx + 160, 460), (cx + 178, 392)],
        fill=CYAN, width=26, joint="curve",
    )
    d.ellipse([cx + 165, 380, cx + 191, 406], fill=CYAN)

    # Metal shaft (cyan), with insulating ring gaps cut out in FG tone.
    d.rounded_rectangle([cx - 22, 122, cx + 22, 236], radius=18, fill=CYAN)

    # Rounded tip.
    d.ellipse([cx - 22, 92, cx + 22, 152], fill=CYAN)

    # Insulating rings (sleeve/ring gaps): two bands in FG color.
    d.rectangle([cx - 22, 168, cx + 22, 182], fill=FG)
    d.rectangle([cx - 22, 208, cx + 22, 222], fill=FG)

    # Rotate 45 degrees so the plug points up-right.
    return layer.rotate(45, resample=Image.BICUBIC, center=(cx, CANVAS // 2))


def main() -> None:
    img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Tokyo Night rounded-square background.
    d.rounded_rectangle([16, 16, CANVAS - 16, CANVAS - 16], radius=110, fill=BG)

    # Subtle inner panel for depth.
    d.rounded_rectangle([34, 34, CANVAS - 34, CANVAS - 34], radius=96, fill=FG)

    img.alpha_composite(draw_plug())

    img.save("assets/icon.png")
    img.save(
        "assets/icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("wrote assets/icon.png and assets/icon.ico")


if __name__ == "__main__":
    main()
