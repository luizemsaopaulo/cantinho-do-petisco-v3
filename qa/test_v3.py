import json
from pathlib import Path
from urllib.parse import unquote
from playwright.sync_api import sync_playwright
ROOT=Path('/mnt/data/cantinho-do-petisco-v3'); QA=ROOT/'qa'
def build(name):
    h=(ROOT/name).read_text(encoding='utf-8'); css=(ROOT/'css/styles.css').read_text(encoding='utf-8')
    h=h.replace('<link rel="stylesheet" href="css/styles.css">',f'<style>{css}</style>')
    scripts=['js/config.js','js/mock-data.js','js/supabase-rest.js','js/admin.js' if name=='admin.html' else 'js/app.js']
    for src in scripts:
        code=(ROOT/src).read_text(encoding='utf-8'); pref='<script>window.__FORCE_DEMO__=true;</script>' if src=='js/config.js' else ''
        h=h.replace(f'<script src="{src}"></script>',pref+f'<script>{code}</script>')
    return h
res=[]; errors=[]
def ok(name,cond,detail=''):
    res.append({'name':name,'ok':bool(cond),'detail':detail})
    if not cond: raise AssertionError(name+': '+detail)
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1440,'height':1000})
    pg.on('console',lambda m: errors.append(f'console {m.type}: {m.text}') if m.type=='error' else None)
    pg.on('pageerror',lambda e: errors.append('pageerror: '+str(e)))
    pg.set_content(build('index.html'),wait_until='load'); pg.wait_for_selector('#menuRoot:not(.hidden)')
    ok('Cardápio carregou',pg.locator('#menuRoot:not(.hidden)').count()==1)
    ok('Prato do dia aparece',pg.locator('#dailySpecialSection:not(.hidden)').count()==1)
    pg.get_by_role('button',name='Marmitas').click(); pg.wait_for_timeout(100)
    ok('Guia P/M/G aparece',pg.locator('.marmita-size-guide').count()==1)
    cards=pg.locator('#cat-marmitas .product-card'); ok('Marmitas renderizadas',cards.count()>5,str(cards.count()))
    isca=cards.filter(has_text='Isca de tilápia'); ok('Isca aparece uma vez',isca.count()==1,str(isca.count()))
    txt=isca.inner_text(); ok('Card mostra P','P' in txt,txt); ok('Card mostra G','G' in txt,txt)
    isca.click(); pg.wait_for_selector('#itemDialog[open]')
    ok('Modal abre',pg.locator('#itemDialog[open]').count()==1)
    ok('Seletor de tamanhos abre',pg.locator('#sizePickerWrap:not(.hidden)').count()==1)
    ok('Isca tem 2 tamanhos',pg.locator('#sizePicker .size-option').count()==2)
    pg.locator('#sizePicker .size-option').filter(has_text='Grande').click()
    ok('G selecionado',pg.locator('#selectedSizeLabel').inner_text()=='Tamanho G')
    ok('Preço G correto','19,99' in pg.locator('#itemDialogPrice').inner_text())
    pg.locator('#itemQtyPlus').click(); ok('Quantidade 2',pg.locator('#itemQty').inner_text()=='2')
    ok('Total no botão','39,98' in pg.locator('#addItemBtn').inner_text(),pg.locator('#addItemBtn').inner_text())
    pg.locator('#addItemBtn').click(); pg.wait_for_timeout(100)
    ok('Carrinho conta 2',pg.locator('#cartCountTop').inner_text()=='2',pg.locator('#cartCountTop').inner_text())
    ok('Carrinho flutuante aparece',pg.locator('#mobileCartBar:not(.hidden)').count()==1)
    cal=cards.filter(has_text='Calabresa acebolada'); ok('Calabresa aparece uma vez',cal.count()==1)
    cal.click(); pg.locator('#sizePicker .size-option').filter(has_text='Pequena').click(); pg.locator('#addItemBtn').click(); pg.wait_for_timeout(80)
    ok('Carrinho conta 3',pg.locator('#cartCountTop').inner_text()=='3')
    pg.locator('#openCartTop').click(); cart=pg.locator('#cartItems').inner_text()
    ok('Carrinho registra G','Isca de tilápia' in cart and 'G' in cart,cart)
    ok('Carrinho registra P','Calabresa acebolada' in cart and 'P' in cart,cart)
    pg.locator('#checkoutBtn').click(); pg.fill('#customerName','Cliente Teste'); pg.locator('input[value="Entrega"]').check(force=True); pg.fill('#customerAddress','Rua Teste, 123'); pg.fill('#customerDistrict','Centro'); pg.select_option('#paymentMethod',label='Dinheiro'); pg.fill('#changeFor','100,00')
    pg.evaluate('window.open=function(url){window.__CAPTURED_OPEN__=url;return null;}'); pg.locator('#sendWhatsappBtn').click(); pg.wait_for_timeout(80)
    wa=pg.evaluate('window.__TEST_LAST_WHATSAPP_URL__||window.__CAPTURED_OPEN__||""'); dec=unquote(wa)
    ok('WhatsApp correto','5511947406124' in wa); ok('WhatsApp contém G','Isca de tilápia (G)' in dec,dec[-500:]); ok('WhatsApp contém P','Calabresa acebolada (P)' in dec,dec[-500:]); ok('Endereço no pedido','Rua Teste, 123' in dec)
    pg.screenshot(path=str(QA/'DEPURACAO_DESKTOP_V3.png'),full_page=True)
    pg.locator('#closeCheckoutDialog').click(); pg.fill('#searchInput','salmão'); pg.wait_for_timeout(80); ok('Busca funciona',pg.locator('#menuRoot').get_by_text('Salmão grelhado',exact=False).count()>=1)
    mob=b.new_page(viewport={'width':390,'height':844}); mob.set_content(build('index.html'),wait_until='load'); mob.wait_for_selector('#menuRoot:not(.hidden)'); mob.get_by_role('button',name='Marmitas').click(); mob.locator('#cat-marmitas .product-card').filter(has_text='Isca de tilápia').click(); ok('Mobile seletor visível',mob.locator('#sizePickerWrap:not(.hidden)').count()==1); mob.locator('#sizePicker .size-option').filter(has_text='Grande').click(); mob.locator('#addItemBtn').click(); ok('Mobile carrinho visível',mob.locator('#mobileCartBar:not(.hidden)').count()==1); mob.screenshot(path=str(QA/'DEPURACAO_MOBILE_V3.png'),full_page=True)
    adm=b.new_page(viewport={'width':1280,'height':900}); adm.set_content(build('admin.html'),wait_until='load'); ok('ADM tem P/M/G',adm.locator('#productSize option').count()==4); adm.screenshot(path=str(QA/'DEPURACAO_ADMIN_V3.png'),full_page=True)
    b.close()
summary={'passed':sum(x['ok'] for x in res),'total':len(res),'errors':errors,'results':res}; (QA/'resultado_chromium_v3.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(summary,ensure_ascii=False,indent=2));
if errors or summary['passed']!=summary['total']: raise SystemExit(1)
