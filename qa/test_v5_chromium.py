import json, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa'
results=[]
errors=[]

def check(name, cond, detail=''):
    results.append({'name':name,'ok':bool(cond),'detail':detail})
    if not cond:
        raise AssertionError(f'{name}: {detail}')

def build_page(filename, scripts):
    html=(ROOT/filename).read_text(encoding='utf-8')
    css=(ROOT/'css/styles.css').read_text(encoding='utf-8')
    html=html.replace('<link rel="stylesheet" href="css/styles.css">', f'<style>{css}</style>')
    for src in scripts:
        code=(ROOT/src).read_text(encoding='utf-8')
        pref='<script>window.__FORCE_DEMO__=true;</script>' if src=='js/config.js' else ''
        html=html.replace(f'<script src="{src}"></script>', pref+f'<script>{code}</script>')
    return html

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])

    # CLIENTE DESKTOP
    ctx=browser.new_context(viewport={'width':1365,'height':768})
    page=ctx.new_page()
    page.on('console', lambda m: errors.append(f'cliente console {m.type}: {m.text}') if m.type=='error' else None)
    page.on('pageerror', lambda e: errors.append('cliente pageerror: '+str(e)))
    page.set_content(build_page('index.html',['js/config.js','js/mock-data.js','js/supabase-rest.js','js/app.js']), wait_until='load')
    page.wait_for_selector('#menuRoot:not(.hidden)')
    check('Cardápio abriu no Chromium', page.locator('#menuRoot:not(.hidden)').count()==1)
    check('Prato do dia semanal apareceu', page.locator('#dailySpecialSection:not(.hidden)').count()==1)
    check('Prato do dia identifica o dia da semana', 'Prato do dia' in page.locator('#dailySpecialCard').inner_text())

    page.get_by_role('button', name='Pratos Executivos').click()
    salmao=page.locator('#cat-pratos-executivos .product-card').filter(has_text='Salmão grelhado').first
    check('Produto executivo localizado', salmao.count()==1)
    check('Card não repete nome da categoria', salmao.locator('.product-meta').count()==0, salmao.inner_text())
    page.screenshot(path=str(QA/'DEPURACAO_CARDAPIO_V5.png'), full_page=True)
    ctx.close()

    # ADMIN DESKTOP
    ctxa=browser.new_context(viewport={'width':1440,'height':900})
    admin=ctxa.new_page()
    admin.on('console', lambda m: errors.append(f'admin console {m.type}: {m.text}') if m.type=='error' else None)
    admin.on('pageerror', lambda e: errors.append('admin pageerror: '+str(e)))
    admin.set_content(build_page('admin.html',['js/config.js','js/mock-data.js','js/supabase-rest.js','js/admin.js']), wait_until='load')
    admin.fill('#adminEmail','admin@demo.local'); admin.fill('#adminPassword','123456'); admin.click('#loginBtn')
    admin.wait_for_selector('#adminView:not(.hidden)')
    check('Login ADM funcionou', admin.locator('#adminView:not(.hidden)').count()==1)
    check('Produtos separados por categorias', admin.locator('.admin-category-card').count()>=5, str(admin.locator('.admin-category-card').count()))
    check('Cada categoria tem cabeçalho próprio', admin.locator('.admin-category-header').count()==admin.locator('.admin-category-card').count())
    admin.screenshot(path=str(QA/'DEPURACAO_ADMIN_PRODUTOS_V5.png'), full_page=True)

    admin.click('#newProductBtn')
    admin.wait_for_selector('#productDialog[open]')
    check('Cadastro separado em quatro blocos', admin.locator('#productDialog .form-section-card').count()==4, str(admin.locator('#productDialog .form-section-card').count()))
    admin.click('#closeProductDialog')

    admin.locator('.admin-tab[data-tab="special"]').click()
    check('Prato do dia tem sete dias da semana', admin.locator('.weekday-row').count()==7, str(admin.locator('.weekday-row').count()))
    check('Campo antigo de data foi removido', admin.locator('#specialDate').count()==0)
    check('Seletor de dia da semana existe', admin.locator('#specialWeekday').count()==1)
    # programa segunda-feira no modo demo
    admin.locator('[data-new-weekday="1"]').click()
    admin.select_option('#specialProduct', index=1)
    admin.fill('#specialPrice','29.90')
    admin.fill('#specialNote','Especial de segunda')
    admin.locator('#specialForm button[type="submit"]').click()
    admin.wait_for_timeout(200)
    monday=admin.locator('.weekday-row').filter(has_text='Segunda-feira').first
    check('Programação semanal salva no ADM', 'Nenhum prato definido' not in monday.inner_text(), monday.inner_text())
    admin.screenshot(path=str(QA/'DEPURACAO_ADMIN_PRATO_SEMANAL_V5.png'), full_page=True)
    ctxa.close()

    # CLIENTE MOBILE + WHATSAPP (regressão V4)
    device=p.devices.get('Pixel 7') or {'viewport':{'width':412,'height':915},'user_agent':'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36','device_scale_factor':2.625,'is_mobile':True,'has_touch':True}
    ctxm=browser.new_context(**device)
    mob=ctxm.new_page()
    mob.on('console', lambda m: errors.append(f'mobile console {m.type}: {m.text}') if m.type=='error' else None)
    mob.on('pageerror', lambda e: errors.append('mobile pageerror: '+str(e)))
    mob.set_content(build_page('index.html',['js/config.js','js/mock-data.js','js/supabase-rest.js','js/app.js']), wait_until='load')
    mob.wait_for_selector('#menuRoot:not(.hidden)')
    mob.get_by_role('button', name='Marmitas').click()
    isca=mob.locator('#cat-marmitas .product-card').filter(has_text='Isca de tilápia').first
    isca.click(); mob.wait_for_selector('#itemDialog[open]')
    mob.locator('#sizePicker .size-option').filter(has_text='Pequena').click(); mob.locator('#addItemBtn').click()
    check('Carrinho mobile contabiliza item', mob.locator('#cartCountTop').inner_text()=='1', mob.locator('#cartCountTop').inner_text())
    mob.locator('#mobileCartBar').click(); mob.locator('#checkoutBtn').click()
    mob.fill('#customerName','Luiz Teste'); mob.locator('input[value="Entrega"]').check(force=True); mob.fill('#customerAddress','Rua Teste, 123'); mob.fill('#customerDistrict','Centro'); mob.select_option('#paymentMethod', label='Pix')
    mob.evaluate("window.__WHATSAPP_NAVIGATOR__=function(url){window.__CAPTURED_WHATSAPP__=url;}")
    mob.locator('#sendWhatsappBtn').click(); mob.wait_for_timeout(100)
    wa=mob.evaluate("window.__CAPTURED_WHATSAPP__||window.__TEST_LAST_WHATSAPP_URL__||''")
    check('WhatsApp mobile continua usando wa.me', wa.startswith('https://wa.me/'), wa)
    msg=urllib.parse.parse_qs(urllib.parse.urlparse(wa).query).get('text',[''])[0]
    check('Mensagem começa pelo PEDIDO', msg.startswith('*PEDIDO:*'), msg[:80])
    check('Nome do cliente continua no final', msg.rstrip().endswith('*Nome do cliente:* Luiz Teste'), msg[-100:])
    mob.screenshot(path=str(QA/'DEPURACAO_MOBILE_V5.png'), full_page=True)
    ctxm.close()
    browser.close()

summary={'passed':sum(r['ok'] for r in results),'total':len(results),'errors':errors,'results':results}
(QA/'resultado_chromium_v5.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
report=['DEPURAÇÃO CHROMIUM — CANTINHO DO PETISCO V5','='*58,f"Resultado: {summary['passed']}/{summary['total']} verificações aprovadas",f"Erros JavaScript: {len(errors)}",'', 'Testes realizados no Chromium real em desktop e emulação Pixel 7.','Modo demo foi usado apenas para não alterar o banco real durante a depuração.','']
for r in results: report.append(f"[{'OK' if r['ok'] else 'FALHOU'}] {r['name']}")
if errors: report += ['', 'ERROS:']+errors
(QA/'DEPURACAO_CHROMIUM_V5.txt').write_text('\n'.join(report)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
if errors or summary['passed']!=summary['total']: raise SystemExit(1)
