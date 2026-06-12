"""Build the self-contained index.html: inline three.min.js, app.js, and all
planet textures (resized/recompressed, embedded as base64 data URIs)."""
import base64
import io
import json
import pathlib

from PIL import Image

here = pathlib.Path(__file__).parent

TEXTURE_FILES = {
    "mercury": "mercurymap.jpg",
    "venus": "venusmap.jpg",
    "earth": "earthmap1k.jpg",
    "earthclouds": "earthcloudmap.jpg",
    "mars": "marsmap1k.jpg",
    "jupiter": "jupitermap.jpg",
    "saturn": "saturnmap.jpg",
    "saturnring": "saturnringcolor.jpg",
    "uranus": "uranusmap.jpg",
    "neptune": "neptunemap.jpg",
    "moon": "moonmap1k.jpg",
    "sun": "sunmap.jpg",
    "pluto": "plutomap1k.jpg",
}


def jpeg_uri(im, quality=88):
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def png_uri(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


textures = {}
total = 0
for key, fname in TEXTURE_FILES.items():
    path = here / "textures" / fname
    if not path.exists():
        print("missing:", fname)
        continue
    im = Image.open(path)
    if im.width > 1024:
        im = im.resize((1024, int(im.height * 1024 / im.width)), Image.LANCZOS)
    if key == "saturnring":
        # Ring gaps should be transparent: derive alpha from luminance.
        rgb = im.convert("RGB")
        alpha = im.convert("L")
        rgba = rgb.copy()
        rgba.putalpha(alpha)
        uri = png_uri(rgba)
    else:
        uri = jpeg_uri(im)
    textures[key] = uri
    total += len(uri)
    print(f"{key:12s} {len(uri)//1024:5d} KB")
print(f"{'total':12s} {total//1024:5d} KB")

template = (here / "template.html").read_text()
three = (here / "three.min.js").read_text()
app = (here / "app.js").read_text()

html = template.replace(
    "<!--TEXTURES-->",
    "<script>\nvar TEXTURES = " + json.dumps(textures) + ";\n</script>")
html = html.replace("<!--THREE_JS-->", "<script>\n" + three + "\n</script>")
html = html.replace("<!--APP_JS-->", "<script>\n" + app + "\n</script>")
(here / "index.html").write_text(html)
print("wrote", here / "index.html", f"{len(html)//1024} KB")
