import pathlib
css = pathlib.Path('dist/main.css').read_text(); js = pathlib.Path('dist/main.js').read_text().replace('</script', '<\\/script')
html = f'''<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Care Coordination Platform – synthetic prototype</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{css}</style></head>
<body><div id="root"></div><script>{js}</script></body></html>'''
pathlib.Path('/mnt/user-data/outputs').mkdir(parents=True, exist_ok=True)
pathlib.Path('/mnt/user-data/outputs/care-coordination-platform.html').write_text(html)
print(len(html)//1024, 'KB')
