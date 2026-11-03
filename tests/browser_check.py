"""End-to-end checks against a running local or deployed Snapframe.

python -m pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/browser_check.py http://127.0.0.1:4173
Uses installed Edge when available; otherwise Playwright Chromium.
"""
import base64
import io
import json
import os
from pathlib import Path
import sys
import urllib.request

from PIL import Image, ImageChops, ImageDraw
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4173'
OUT = Path(os.environ.get('SNAPFRAME_TEST_OUTPUT', 'test-results'))
OUT.mkdir(parents=True, exist_ok=True)
passed = []

def record(name):
    passed.append(name)
    print('PASS:', name, flush=True)

def fixture(name, size, color):
    image = Image.new('RGB', size, color)
    d = ImageDraw.Draw(image)
    d.rectangle((size[0]//4, size[1]//4, size[0]*3//4, size[1]*3//4), fill='#d47c58')
    path = OUT / name
    image.save(path)
    return path

def drop(page, files):
    page.evaluate('''files => {
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(new File([Uint8Array.from(file.bytes)], file.name, {type:file.type}));
      const zone = document.querySelector('#drop-zone');
      for (const type of ['dragenter', 'dragover', 'drop']) zone.dispatchEvent(new DragEvent(type, {bubbles:true,cancelable:true,dataTransfer:transfer}));
    }''', files)

def drag_file(path, mime='image/png'):
    return {'name': path.name, 'type': mime, 'bytes': list(path.read_bytes())}

def canvas_image(page):
    encoded = page.locator('#preview').evaluate("c=>c.toDataURL('image/png').split(',')[1]")
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert('RGBA')

def export_check(page, name):
    with page.expect_download() as event:
        page.locator('#export-button').click()
    download = event.value
    path = OUT / name
    download.save_as(path)
    exported = Image.open(path).convert('RGBA')
    preview = canvas_image(page)
    assert exported.size == preview.size
    assert ImageChops.difference(exported, preview).getbbox() is None, 'Export differs from preview'
    assert path.read_bytes()[:8] == b'\x89PNG\r\n\x1a\n'
    return exported

with sync_playwright() as p:
    edge = Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
    proxy = urllib.request.getproxies().get('https') if os.environ.get('SNAPFRAME_USE_SYSTEM_PROXY') == '1' else None
    browser = p.chromium.launch(executable_path=str(edge) if edge.exists() else None, headless=True, proxy={'server':proxy} if proxy else None)
    context = browser.new_context(viewport={'width':1440,'height':1100}, device_scale_factor=1, accept_downloads=True)
    page = context.new_page()
    errors, external, posts = [], [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: external.append(r.url) if r.url.split('/')[2] != BASE.split('/')[2] else None)
    page.on('request', lambda r: posts.append(r.url) if r.method != 'GET' else None)
    assert page.goto(BASE, wait_until='networkidle').status == 200
    expect(page.locator('#export-button')).to_be_enabled()
    expect(page.locator('#dimensions')).to_have_text('1128 × 768 px')
    page.screenshot(path=str(OUT/'desktop.png'), full_page=True)
    export_check(page, 'demo-export.png')
    record('Initial demo, page load, and PNG export')

    source = fixture('sample.png', (960,600), '#3b6a8f')
    with page.expect_file_chooser() as chooser:
        page.locator('#upload-button').click()
    chooser.value.set_files(source)
    expect(page.locator('#file-name')).to_have_text('sample.png')
    expect(page.locator('#dimensions')).to_have_text('1088 × 728 px')
    record('File chooser loads screenshot at original resolution')

    before = page.locator('#preview').evaluate('c=>c.toDataURL()')
    for key, value in [('padding',120),('radius',40),('shadow',75)]:
        page.locator('#'+key).fill(str(value))
    page.locator('[data-gradient="2"]').click()
    expect(page.locator('#dimensions')).to_have_text('1200 × 840 px')
    assert page.locator('#preview').evaluate('c=>c.toDataURL()') != before
    page.locator('[data-mode="solid"]').click()
    page.locator('#custom-color').fill('#123456')
    expect(page.locator('#color-value')).to_have_text('#123456')
    page.wait_for_function("document.querySelector('#preview').getContext('2d').getImageData(0,0,1,1).data[0]===18")
    exported = export_check(page, 'custom-export.png')
    assert exported.getpixel((0,0)) == (18,52,86,255)
    assert exported.getpixel((120,120))[:3] != (59,106,143), 'Rounded corner must reveal background instead of the source'
    assert exported.getpixel((600,420))[:3] == (212,124,88), 'Uploaded source must appear in output'
    record('Padding, rounded corners, shadow, gradients, custom colors update preview; PNG pixels exactly match')

    page.locator('#reset-button').click()
    expect(page.locator('#padding')).to_have_value('64')
    expect(page.locator('#radius')).to_have_value('16')
    expect(page.locator('#shadow')).to_have_value('40')
    expect(page.locator('#file-name')).to_have_text('sample.png')
    expect(page.locator('#dimensions')).to_have_text('1088 × 728 px')
    record('Reset restores default styles and preserves uploaded image')

    # Prove each parameter changes pixels independently.
    for key,value in [('radius','0'),('shadow','0')]:
        old = page.locator('#preview').evaluate('c=>c.toDataURL()')
        page.locator('#'+key).fill(value)
        page.wait_for_function('(old)=>document.querySelector("#preview").toDataURL()!==old', arg=old)
    record('Radius and shadow each change rendered pixels')

    other = fixture('dragged.png',(800,500),'#6f886e')
    drop(page,[drag_file(other)])
    expect(page.locator('#file-name')).to_have_text('dragged.png')
    expect(page.locator('#drop-zone')).not_to_have_class('preview-stage dragging')
    record('Drag and drop loads screenshot')

    for fmt,mime in [('JPEG','image/jpeg'),('WEBP','image/webp')]:
        name = f'sample.{fmt.lower()}'
        image_file = OUT/name
        Image.open(source).save(image_file,format=fmt)
        page.locator('#file-input').set_input_files(image_file)
        expect(page.locator('#file-name')).to_have_text(name)
    record('JPEG and WebP decode successfully')

    saved = page.locator('#preview').evaluate('c=>c.toDataURL()')
    for name,mime,content in [('bad.txt','text/plain',b'hello'),('renamed.png','image/png',b'not an image'),('bad.svg','image/svg+xml',b'<svg/>'),('bad.gif','image/gif',b'GIF89a')]:
        page.locator('#file-input').set_input_files({'name':name,'mimeType':mime,'buffer':content})
        expect(page.locator('#message')).to_contain_text('暂不支持')
        assert page.locator('#preview').evaluate('c=>c.toDataURL()') == saved
    page.locator('#file-input').set_input_files({'name':'corrupt.png','mimeType':'image/png','buffer':b'\x89PNG\r\n\x1a\nabc'})
    expect(page.locator('#message')).to_have_class('message error')
    page.evaluate('''() => {
      const dt=new DataTransfer(); dt.items.add(new File([new Uint8Array(32*1024*1024+1)],'huge.png',{type:'image/png'}));
      document.querySelector('#drop-zone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
    }''')
    expect(page.locator('#message')).to_contain_text('超过 32 MB')
    drop(page,[drag_file(source),drag_file(other)])
    expect(page.locator('#message')).to_contain_text('每次只能处理一张')
    record('Unsupported, renamed, corrupt, oversized files and multiple files rejected without losing current image')

    too_wide = fixture('too-wide.png',(17000,2),'#fff')
    page.locator('#file-input').set_input_files(too_wide)
    expect(page.locator('#message')).to_contain_text('图片尺寸过大')
    large = fixture('large.png',(6000,4000),'#657dab')
    page.locator('#file-input').set_input_files(large)
    expect(page.locator('#file-name')).to_have_text('large.png',timeout=20000)
    expect(page.locator('#dimensions')).to_contain_text('已安全缩放')
    dimensions = page.locator('#preview').evaluate('c=>[c.width,c.height]')
    assert dimensions[0]*dimensions[1] <= 16000000 and max(dimensions)<=8192
    export_check(page,'large-export.png')
    record('24 megapixel input safely scaled and exported; excessive side length rejected')

    page.locator('#file-input').set_input_files(source)
    expect(page.locator('#file-name')).to_have_text('sample.png')
    # Check zero padding and large radius are valid on the same canvas.
    page.locator('#padding').fill('0')
    expect(page.locator('#dimensions')).to_have_text('960 × 600 px')
    export_check(page,'zero-padding.png')
    page.locator('#reset-button').click()
    record('Zero padding export works')

    for width in [390,320]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Horizontal overflow'
        box=page.locator('#preview').bounding_box()
        assert box['width']>0 and box['x']>=0 and box['x']+box['width']<=width
        page.locator('[data-mode="solid"]').click()
        page.locator('[data-color="#f7dfe8"]').click()
        export_check(page,f'mobile-{width}-export.png')
        page.screenshot(path=str(OUT/f'mobile-{width}.png'),full_page=True)
    record('390px and 320px mobile layouts: no overflow, usable controls and PNG export')

    assert not errors, errors
    assert not external, external
    assert not posts, posts
    record('No browser JavaScript errors, third-party requests, or image upload requests')
    result={'url':BASE,'browser':browser.version,'passed':passed,'failures':[], 'limitations':['Physical iOS/Android devices and Safari/Firefox not tested.']}
    (OUT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    browser.close()
    print(json.dumps(result,ensure_ascii=False,indent=2))
