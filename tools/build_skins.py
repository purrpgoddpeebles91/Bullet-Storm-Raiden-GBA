#!/usr/bin/env python3
"""Build emulator skins for Bullet Storm Raiden from web/src/bsr-shell.js.

Outputs:
  dist/skins/BSR_GreenShell.deltaskin          Delta (iOS) skin: zip of info.json + PNGs
  dist/skins/retroarch/bsr_greenshell.png/.cfg  RetroArch overlay + README.txt
  dist/screens/skin_debug.png                  art with every input/screen frame drawn on top

Needs: node, python3, Pillow, resvg_py (pip install resvg-py).
"""
import json, os, subprocess, zipfile, io
from PIL import Image, ImageDraw
import resvg_py

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHELL_JS = os.path.join(ROOT, "web/src/bsr-shell.js")
OUT = os.path.join(ROOT, "dist/skins")
RA = os.path.join(OUT, "retroarch")
SCREENS = os.path.join(ROOT, "dist/screens")

MAP_W, MAP_H = 414, 896                      # Delta mapping size (points)
SHELL_W, SHELL_H = 1000, 2164                 # 1000/2164 == 414/896 exactly
S = MAP_W / SHELL_W                           # shell units -> mapping points
ASSETS = {"small": (828, 1792), "medium": (1125, 2436), "large": (1242, 2688)}

JS = r"""
const S = require(process.argv[1]);
const r = S.green({H: %d, bleed: true, top: 60});
process.stdout.write(JSON.stringify({W: r.W, H: r.H, screen: r.screen, meta: r.meta,
  zones: r.zones, svg: r.full(null)}));
""" % SHELL_H


def shell():
    out = subprocess.check_output(["node", "-e", JS, SHELL_JS])
    d = json.loads(out)
    assert (d["W"], d["H"]) == (SHELL_W, SHELL_H), (d["W"], d["H"])
    return d


def render(svg, w, h):
    png = resvg_py.svg_to_bytes(svg_string=svg, width=w, height=h)
    return Image.open(io.BytesIO(bytes(png))).convert("RGBA")


def rect_c(cx, cy, w, h):
    """frame in shell units centred on (cx,cy) -> dict in mapping points"""
    return {"x": round((cx - w / 2) * S, 2), "y": round((cy - h / 2) * S, 2),
            "width": round(w * S, 2), "height": round(h * S, 2)}


def layout(d):
    m = d["meta"]
    dp = m["dpad"]["c"]; dl = m["dpad"]["len"]
    L, R = m["L"], m["R"]
    ab = m["abR"] * 2 + 16                       # a bit over the drawn button
    sc = d["screen"]
    items = [
        # name, delta inputs, frame (points), extendedEdges
        ("dpad", {"up": "up", "down": "down", "left": "left", "right": "right"},
         rect_c(dp[0], dp[1], dl + 10, dl + 10), {"top": 0, "bottom": 10, "left": 10, "right": 10}),
        ("a", ["a"], rect_c(m["a"][0], m["a"][1], ab, ab), {"top": 0, "right": 10}),
        ("b", ["b"], rect_c(m["b"][0], m["b"][1], ab, ab), {"left": 6, "bottom": 8}),
        ("l", ["l"], rect_c(L["x"] + L["w"] / 2, L["y"] + L["h"] / 2 - 10, L["w"] + 20, L["h"] + 20), {"left": 10, "bottom": 0}),
        ("r", ["r"], rect_c(R["x"] + R["w"] / 2, R["y"] + R["h"] / 2 - 10, R["w"] + 20, R["h"] + 20), {"right": 10, "bottom": 0}),
        ("select", ["select"], rect_c(m["select"][0], m["select"][1], 130, 76), {}),
        ("start", ["start"], rect_c(m["start"][0], m["start"][1], 130, 76), {}),
        ("menu", ["menu"], rect_c(m["menu"][0], m["menu"][1], 70, 70), {}),
    ]
    screen = {"x": round(sc["x"] * S, 2), "y": round(sc["y"] * S, 2),
              "width": round(sc["w"] * S, 2), "height": round(sc["h"] * S, 2)}
    return items, screen


def build_delta(d, items, screen):
    os.makedirs(OUT, exist_ok=True)
    pngs = {}
    for k, (w, h) in ASSETS.items():
        pngs[k] = render(d["svg"], w, h)
    portrait = {
        "assets": {k: f"iphone_e2e_portrait_{k}.png" for k in ASSETS},
        "items": [],
        "screens": [{"outputFrame": screen}],
        "mappingSize": {"width": MAP_W, "height": MAP_H},
        "extendedEdges": {"top": 7, "bottom": 7, "left": 7, "right": 7},
        "translucent": False,
    }
    for name, inputs, frame, ext in items:
        it = {"inputs": inputs, "frame": frame}
        if ext:
            it["extendedEdges"] = ext
        portrait["items"].append(it)
    info = {
        "name": "Bullet Storm Raiden Green Shell",
        "identifier": "com.purrpgoddpeebles91.bsr.greenshell",
        "gameTypeIdentifier": "com.rileytestut.delta.game.gba",
        "debug": False,
        "representations": {"iphone": {"edgeToEdge": {"portrait": portrait}}},
    }
    js = json.dumps(info, indent=2)
    json.loads(js)
    path = os.path.join(OUT, "BSR_GreenShell.deltaskin")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("info.json", js)
        for k, im in pngs.items():
            b = io.BytesIO(); im.save(b, "PNG", optimize=True)
            z.writestr(portrait["assets"][k], b.getvalue())
    return path, pngs["large"], info


def build_retroarch(d, items, screen, art):
    os.makedirs(RA, exist_ok=True)
    w, h = 1080, round(1080 * SHELL_H / SHELL_W)     # 1080x2337
    im = render(d["svg"], w, h)
    # punch the 3:2 window transparent so the game shows through
    sx, sy = screen["x"] / MAP_W * w, screen["y"] / MAP_H * h
    sw, sh = screen["width"] / MAP_W * w, screen["height"] / MAP_H * h
    ImageDraw.Draw(im).rectangle([round(sx), round(sy), round(sx + sw) - 1, round(sy + sh) - 1], fill=(0, 0, 0, 0))
    im.save(os.path.join(RA, "bsr_greenshell.png"), optimize=True)

    descs = []
    def nx(v): return round(v / MAP_W, 4)
    def ny(v): return round(v / MAP_H, 4)
    for name, inputs, f, _ in items:
        cx, cy = f["x"] + f["width"] / 2, f["y"] + f["height"] / 2
        rx, ry = f["width"] / 2, f["height"] / 2
        if name == "dpad":
            a = rx / 3                                   # thirds of the dpad box
            for key, ox, oy in (("up", 0, -2), ("down", 0, 2), ("left", -2, 0), ("right", 2, 0)):
                descs.append(f'"{key},{nx(cx + ox * a)},{ny(cy + oy * a)},rect,{nx(a)},{ny(a)}"')
            for key, ox, oy in (("up|left", -2, -2), ("up|right", 2, -2), ("down|left", -2, 2), ("down|right", 2, 2)):
                descs.append(f'"{key},{nx(cx + ox * a)},{ny(cy + oy * a)},rect,{nx(a)},{ny(a)}"')
        else:
            key = "menu_toggle" if name == "menu" else name
            shape = "radial" if name in ("a", "b", "menu") else "rect"
            descs.append(f'"{key},{nx(cx)},{ny(cy)},{shape},{nx(rx)},{ny(ry)}"')
    lines = ["overlays = 1", 'overlay0_overlay = "bsr_greenshell.png"', "overlay0_full_screen = true",
             "overlay0_normalized = true", f"overlay0_descs = {len(descs)}"]
    lines += [f"overlay0_desc{i} = {v}" for i, v in enumerate(descs)]
    with open(os.path.join(RA, "bsr_greenshell.cfg"), "w") as fh:
        fh.write("\n".join(lines) + "\n")

    # custom viewport numbers for a phone at the overlay's own resolution
    vp = (round(sx), round(sy), round(sw), round(sh))
    readme = f"""Bullet Storm Raiden - Green Shell overlay for RetroArch (portrait, GBA cores e.g. mGBA)

Files: bsr_greenshell.cfg + bsr_greenshell.png (keep them in the same folder).

Load it:
1. Copy this folder to RetroArch's overlay directory
   (Settings > Directory > Overlay shows where; e.g. .../RetroArch/overlays/bsr/).
2. Start the game, open the Quick Menu > On-Screen Overlay
   (or Settings > On-Screen Display > On-Screen Overlay).
3. Display Overlay = ON, Overlay Preset = bsr_greenshell.cfg,
   Overlay Opacity = 1.00, Auto-Scale Overlay = OFF, hold the phone in portrait.
4. Put the game inside the shell's window:
   Settings > Video > Scaling > Aspect Ratio = Custom, then set
   Custom Aspect Ratio X/Y Position and Width/Height to the window rect.
   The window is {screen['x']/MAP_W*100:.2f}% from the left, {screen['y']/MAP_H*100:.2f}% from the top,
   {screen['width']/MAP_W*100:.2f}% wide, {screen['height']/MAP_H*100:.2f}% tall of the screen.
   On a 1080x2337 display that is X={vp[0]} Y={vp[1]} W={vp[2]} H={vp[3]};
   multiply those percentages by your own resolution otherwise.
   Save with Quick Menu > Overrides > Save Core Overrides.
The round button between the d-pad and A/B opens the RetroArch menu.
"""
    with open(os.path.join(RA, "README.txt"), "w") as fh:
        fh.write(readme)


def debug_png(items, screen, art):
    os.makedirs(SCREENS, exist_ok=True)
    im = art.copy()
    k = im.width / MAP_W
    dr = ImageDraw.Draw(im)
    def box(f, col, wdt=4):
        dr.rectangle([f["x"] * k, f["y"] * k, (f["x"] + f["width"]) * k, (f["y"] + f["height"]) * k], outline=col, width=wdt)
    box(screen, (0, 200, 255, 255), 6)
    for name, inputs, f, ext in items:
        g = dict(f); g["x"] -= ext.get("left", 7); g["y"] -= ext.get("top", 7)
        g["width"] += ext.get("left", 7) + ext.get("right", 7); g["height"] += ext.get("top", 7) + ext.get("bottom", 7)
        box(g, (255, 255, 0, 160), 2)                      # touch area incl. extendedEdges
        box(f, (255, 40, 200, 255), 4)
        dr.text((f["x"] * k + 6, f["y"] * k + 4), name, fill=(255, 255, 255, 255))
    im.save(os.path.join(SCREENS, "skin_debug.png"))


def main():
    d = shell()
    items, screen = layout(d)
    def ext(f, e):
        return (f["x"] - e.get("left", 7), f["y"] - e.get("top", 7),
                f["x"] + f["width"] + e.get("right", 7), f["y"] + f["height"] + e.get("bottom", 7))
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, b = ext(items[i][2], items[i][3]), ext(items[j][2], items[j][3])
            if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                print("WARN touch overlap:", items[i][0], items[j][0])
    ratio = screen["width"] / screen["height"]
    assert abs(ratio - 1.5) < 1e-3, ratio
    path, large, info = build_delta(d, items, screen)
    build_retroarch(d, items, screen, large)
    debug_png(items, screen, large)
    with zipfile.ZipFile(path) as z:
        json.loads(z.read("info.json"))
        print("deltaskin:", path, z.namelist())
    print("screen outputFrame:", screen)


if __name__ == "__main__":
    main()
