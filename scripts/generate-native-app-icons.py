#!/usr/bin/env python3
"""Generate Android launcher icons and the macOS ICNS from one master image."""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/branding/ierp-app-icon-source.png"
MASTER = ROOT / "assets/branding/ierp-app-icon-1024.png"
ANDROID_RES = ROOT / "apps/android/app/src/main/res"
MAC_RESOURCES = ROOT / "apps/macos/Resources"
ICONSET = MAC_RESOURCES / "iERP.iconset"


def square_master() -> Image.Image:
    source = Image.open(SOURCE).convert("RGB")
    side = min(source.size)
    left = (source.width - side) // 2
    top = (source.height - side) // 2
    master = source.crop((left, top, left + side, top + side))
    master = master.resize((1024, 1024), Image.Resampling.LANCZOS)
    MASTER.parent.mkdir(parents=True, exist_ok=True)
    master.save(MASTER, optimize=True)
    return master


def extract_foreground(master: Image.Image) -> Image.Image:
    """Extract the bright mark while discarding the blue full-bleed background."""
    pixels = master.load()
    alpha = Image.new("L", master.size)
    alpha_pixels = alpha.load()
    for y in range(master.height):
        for x in range(master.width):
            red, green, _ = pixels[x, y]
            # The approved mark is neutral white; the background has little red/green.
            neutral = min(red, green)
            alpha_pixels[x, y] = max(0, min(255, (neutral - 118) * 4))

    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("无法从主图提取白色前景")
    mark_alpha = alpha.crop(bbox)
    mark = Image.new("RGBA", mark_alpha.size, (255, 255, 255, 0))
    mark.putalpha(mark_alpha)
    return mark


def write_android(master: Image.Image, mark: Image.Image) -> None:
    densities = {
        "mdpi": (48, 108),
        "hdpi": (72, 162),
        "xhdpi": (96, 216),
        "xxhdpi": (144, 324),
        "xxxhdpi": (192, 432),
    }
    for density, (legacy_size, adaptive_size) in densities.items():
        target = ANDROID_RES / f"mipmap-{density}"
        target.mkdir(parents=True, exist_ok=True)
        master.resize((legacy_size, legacy_size), Image.Resampling.LANCZOS).save(
            target / "ic_launcher.png", optimize=True
        )
        master.resize((legacy_size, legacy_size), Image.Resampling.LANCZOS).save(
            target / "ic_launcher_round.png", optimize=True
        )

        foreground = Image.new("RGBA", (adaptive_size, adaptive_size), (0, 0, 0, 0))
        limit_width = round(adaptive_size * 0.46)
        limit_height = round(adaptive_size * 0.58)
        scale = min(limit_width / mark.width, limit_height / mark.height)
        resized = mark.resize(
            (round(mark.width * scale), round(mark.height * scale)),
            Image.Resampling.LANCZOS,
        )
        foreground.alpha_composite(
            resized,
            ((adaptive_size - resized.width) // 2, (adaptive_size - resized.height) // 2),
        )
        foreground.save(target / "ic_launcher_foreground.png", optimize=True)


def rounded_macos_master(master: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    inset = 54
    box_size = 1024 - inset * 2
    radius = 202
    mask = Image.new("L", (box_size, box_size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, box_size - 1, box_size - 1), radius=radius, fill=255
    )
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_mask = Image.new("L", canvas.size, 0)
    shadow_mask.paste(mask, (inset, inset + 16))
    shadow.putalpha(shadow_mask.filter(ImageFilter.GaussianBlur(22)))
    shadow_color = Image.new("RGBA", canvas.size, (5, 20, 60, 92))
    shadow_color.putalpha(shadow.getchannel("A"))
    canvas.alpha_composite(shadow_color)

    face = master.resize((box_size, box_size), Image.Resampling.LANCZOS).convert("RGBA")
    face.putalpha(mask)
    canvas.alpha_composite(face, (inset, inset))
    return canvas


def write_macos(master: Image.Image) -> None:
    MAC_RESOURCES.mkdir(parents=True, exist_ok=True)
    ICONSET.mkdir(parents=True, exist_ok=True)
    mac_master = rounded_macos_master(master)
    variants = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    for name, size in variants.items():
        mac_master.resize((size, size), Image.Resampling.LANCZOS).save(
            ICONSET / name, optimize=True
        )
    # Pillow writes a standards-compliant multi-resolution ICNS directly. Keep
    # the iconset beside it so every source resolution remains inspectable.
    mac_master.save(MAC_RESOURCES / "iERP.icns", format="ICNS")


def main() -> None:
    master = square_master()
    mark = extract_foreground(master)
    write_android(master, mark)
    write_macos(master)


if __name__ == "__main__":
    main()
