"""Inline three.min.js and app.js into template.html -> index.html (self-contained)."""
import pathlib

here = pathlib.Path(__file__).parent
template = (here / "template.html").read_text()
three = (here / "three.min.js").read_text()
app = (here / "app.js").read_text()

html = template.replace("<!--THREE_JS-->", "<script>\n" + three + "\n</script>")
html = html.replace("<!--APP_JS-->", "<script>\n" + app + "\n</script>")
(here / "index.html").write_text(html)
print("wrote", here / "index.html", len(html), "bytes")
