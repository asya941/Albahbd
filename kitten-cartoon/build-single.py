"""Собирает index.html + style.css + script.js в один файл rizhik.html.
Один файл нужен, чтобы мультфильм открывался на планшете прямо из «Моих файлов»
(Android открывает файлы через content:// и не подгружает соседние style.css и script.js).
Запуск:  python3 build-single.py
"""
from pathlib import Path

here = Path(__file__).parent
html = (here / "index.html").read_text(encoding="utf-8")
css = (here / "style.css").read_text(encoding="utf-8")
js = (here / "script.js").read_text(encoding="utf-8")

css_tag = '<link rel="stylesheet" href="style.css">'
js_tag = '<script src="script.js"></script>'
assert css_tag in html and js_tag in html
html = html.replace(css_tag, "<style>\n" + css + "\n</style>")
html = html.replace(js_tag, "<script>\n" + js.replace("</script", "<\\/script") + "\n</script>")
(here / "rizhik.html").write_text(html, encoding="utf-8")
print("Готово: rizhik.html")
