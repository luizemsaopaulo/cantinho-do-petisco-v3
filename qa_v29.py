from pathlib import Path
from playwright.sync_api import sync_playwright
import hashlib, json, mimetypes, sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
results=[]

def check(name, cond, detail=''):
    ok=bool(cond)
    results.append({'name':name,'ok':ok,'detail':str(detail)})
    print(('PASS' if ok else 'FAIL'), '—', name, (f'— {detail}' if detail else ''))
    return ok

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def route_local(route):
    u=urlparse(route.request.url)
    rel=u.path.lstrip('/') or 'index.html'
    fp=(ROOT/rel).resolve()
    if not str(fp).startswith(str(ROOT.resolve())) or not fp.is_file():
        route.fulfill(status=404, body='not found')
        return
    ctype=mimetypes.guess_type(fp.name)[0] or 'application/octet-stream'
    headers={'Content-Type':ctype,'Access-Control-Allow-Origin':'*'}
    route.fulfill(status=200, body=fp.read_bytes(), headers=headers)

html=(ROOT/'admin.html').read_text(encoding='utf-8').replace('<head>','<head><base href="https://local.test/">',1)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for label, viewport in [('desktop', {'width':1440,'height':1000}), ('mobile', {'width':390,'height':844})]:
        ctx = browser.new_context(viewport=viewport, accept_downloads=True)
        page = ctx.new_page()
        page.route('https://local.test/**', route_local)
        page.evaluate('window.__FORCE_DEMO__ = true;')
        errors=[]
        console_errors=[]
        page.on('pageerror', lambda e, bag=errors: bag.append(str(e)))
        page.on('console', lambda m, bag=console_errors: bag.append(m.text) if m.type=='error' else None)
        page.set_content(html, wait_until='load')
        page.locator('#adminEmail').fill('admin@demo.local')
        page.locator('#adminPassword').fill('123456')
        page.locator('#loginBtn').click()
        page.locator('#adminView:not(.hidden)').wait_for(timeout=8000)
        check(f'{label}: login ADM como usuário real', page.locator('#adminView').is_visible())

        page.locator('#adminToolsMenuBtn').click()
        menu=page.locator('#adminToolsMenu')
        check(f'{label}: menu abre por clique', menu.get_attribute('aria-hidden')=='false')
        expected = [
            ('#qrDeliveryBtn','Ver QR — Delivery'),
            ('#downloadQrDeliveryBtn','Baixar QR — Delivery'),
            ('#qrRestaurantBtn','Ver QR — Restaurante'),
            ('#downloadQrRestaurantBtn','Baixar QR — Restaurante'),
        ]
        for sel,text in expected:
            loc=page.locator(sel)
            loc.scroll_into_view_if_needed()
            check(f'{label}: opção {text} acessível no menu', loc.is_visible() and text in loc.inner_text())

        # Delivery — visualizar
        page.locator('#qrDeliveryBtn').click()
        dlg=page.locator('#qrDialog')
        dlg.wait_for(state='visible')
        check(f'{label}: modal QR Delivery abre', dlg.is_visible())
        check(f'{label}: título QR Delivery correto', 'Delivery' in page.locator('#qrDialogTitle').inner_text())
        src=page.locator('#qrDialogImage').get_attribute('src') or ''
        check(f'{label}: usa QR Delivery fornecido', src.endswith('assets/qr-cantinho-delivery.png'), src)
        page.locator('#qrDialogImage').wait_for(state='visible')
        page.wait_for_function("() => { const i=document.querySelector('#qrDialogImage'); return i && i.complete && i.naturalWidth>0; }")
        natural=page.locator('#qrDialogImage').evaluate('(img)=>[img.naturalWidth,img.naturalHeight]')
        check(f'{label}: QR Delivery renderiza 256x256', natural==[256,256], natural)
        linktxt=page.locator('#qrDialogLink').inner_text()
        check(f'{label}: identifica URL dinâmica Delivery', 'slug=principal' in linktxt, linktxt)
        page.screenshot(path=str(ROOT/f'qa_v29_qr_delivery_{label}.png'), full_page=False)

        with page.expect_download(timeout=5000) as di:
            page.locator('#downloadQrDialog').click()
        d=di.value
        check(f'{label}: download Delivery pelo modal', d.suggested_filename=='qr-cantinho-delivery.png', d.suggested_filename)
        check(f'{label}: download Delivery pelo modal preserva bytes', sha(d.path())==sha(ROOT/'assets/qr-cantinho-delivery.png'))
        page.locator('#closeQrDialog').click()

        # Delivery — baixar direto no menu
        page.locator('#adminToolsMenuBtn').click()
        with page.expect_download(timeout=5000) as di2:
            page.locator('#downloadQrDeliveryBtn').click()
        d2=di2.value
        check(f'{label}: download direto Delivery no menu', d2.suggested_filename=='qr-cantinho-delivery.png', d2.suggested_filename)
        check(f'{label}: download direto Delivery preserva bytes', sha(d2.path())==sha(ROOT/'assets/qr-cantinho-delivery.png'))

        # Restaurante — visualizar
        page.locator('#adminToolsMenuBtn').click()
        page.locator('#qrRestaurantBtn').click()
        dlg.wait_for(state='visible')
        check(f'{label}: modal QR Restaurante abre', dlg.is_visible())
        check(f'{label}: título QR Restaurante correto', 'Restaurante' in page.locator('#qrDialogTitle').inner_text())
        src=page.locator('#qrDialogImage').get_attribute('src') or ''
        check(f'{label}: usa QR Restaurante fornecido', src.endswith('assets/qr-cantinho-restaurante.png'), src)
        page.wait_for_function("() => { const i=document.querySelector('#qrDialogImage'); return i && i.complete && i.naturalWidth>0; }")
        natural=page.locator('#qrDialogImage').evaluate('(img)=>[img.naturalWidth,img.naturalHeight]')
        check(f'{label}: QR Restaurante renderiza 256x256', natural==[256,256], natural)
        linktxt=page.locator('#qrDialogLink').inner_text()
        check(f'{label}: identifica URL dinâmica Restaurante', 'slug=qr-2-restaurante' in linktxt, linktxt)
        page.screenshot(path=str(ROOT/f'qa_v29_qr_restaurante_{label}.png'), full_page=False)

        with page.expect_download(timeout=5000) as di3:
            page.locator('#downloadQrDialog').click()
        d3=di3.value
        check(f'{label}: download Restaurante pelo modal', d3.suggested_filename=='qr-cantinho-restaurante.png', d3.suggested_filename)
        check(f'{label}: download Restaurante pelo modal preserva bytes', sha(d3.path())==sha(ROOT/'assets/qr-cantinho-restaurante.png'))
        page.locator('#closeQrDialogX').click()

        page.locator('#adminToolsMenuBtn').click()
        with page.expect_download(timeout=5000) as di4:
            page.locator('#downloadQrRestaurantBtn').click()
        d4=di4.value
        check(f'{label}: download direto Restaurante no menu', d4.suggested_filename=='qr-cantinho-restaurante.png', d4.suggested_filename)
        check(f'{label}: download direto Restaurante preserva bytes', sha(d4.path())==sha(ROOT/'assets/qr-cantinho-restaurante.png'))

        # Menu URLs alinhados ao projeto atual (sem navegar externamente).
        capture = page.evaluate('''() => { window.__opened=[]; window.open=(url,target,features)=>{window.__opened.push(url); return null;}; return true; }''')
        page.locator('#adminToolsMenuBtn').click()
        page.locator('#openDeliveryQuick').click()
        opened=page.evaluate('window.__opened.slice()')
        check(f'{label}: atalho Delivery aponta para projeto atual V29', bool(opened) and 'cantinho-do-petisco-v3/?v=29' in opened[-1], opened)
        page.locator('#adminToolsMenuBtn').click()
        page.locator('#openRestaurantQuick').click()
        opened=page.evaluate('window.__opened.slice()')
        check(f'{label}: atalho Restaurante aponta para projeto atual V29', bool(opened) and 'cantinho-do-petisco-v3/restaurante.html?v=29' in opened[-1], opened)

        overflow = page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
        check(f'{label}: sem rolagem horizontal indevida', not overflow, f"scrollWidth={page.evaluate('document.documentElement.scrollWidth')} clientWidth={page.evaluate('document.documentElement.clientWidth')}")
        check(f'{label}: zero page errors', len(errors)==0, errors)
        # Ignore expected favicon/service-worker style network console only if any; here there should be none.
        check(f'{label}: zero console errors', len(console_errors)==0, console_errors)
        ctx.close()
    browser.close()

passed=sum(1 for r in results if r['ok'])
failed=len(results)-passed
summary={'passed':passed,'failed':failed,'total':len(results),'results':results,'note':'Chromium real; HTML/CSS/JS exatos carregados com subrecursos locais interceptados porque navegação HTTP/HTTPS é bloqueada por política do ambiente.'}
(ROOT/'resultado_chromium_v29.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'RESULTADO: {passed}/{len(results)} PASS; falhas={failed}')
if failed:
    sys.exit(1)
