from pathlib import Path
from playwright.sync_api import sync_playwright
import json, re
ROOT=Path('/mnt/data/cantinho_v28_work/teste-cantinho-do-petisco-v28-historico-relogio')

def qa_html():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    css=(ROOT/'css/styles.css').read_text(encoding='utf-8')
    # inline CSS
    html=re.sub(r'<link rel="stylesheet" href="css/styles\.css\?v=28">', '<style>'+css+'</style>', html)
    # remove resources not needed in QA
    html=re.sub(r'<link rel="manifest"[^>]*>', '', html)
    html=re.sub(r'<link rel="apple-touch-icon"[^>]*>', '', html)
    pre='''<script>\nwindow.__FORCE_DEMO__=true;\nwindow.__QA_WHATSAPP_URL__='';\nwindow.__WHATSAPP_NAVIGATOR__=u=>{window.__QA_WHATSAPP_URL__=u};\nwindow.__qaLocalStorage={_d:Object.create(null),getItem(k){return Object.prototype.hasOwnProperty.call(this._d,k)?this._d[k]:null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]},clear(){this._d=Object.create(null)}};\nwindow.__qaSessionStorage={_d:Object.create(null),getItem(k){return Object.prototype.hasOwnProperty.call(this._d,k)?this._d[k]:null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]},clear(){this._d=Object.create(null)}};\n</script>'''
    html=html.replace('<body data-menu-mode="delivery">','<body data-menu-mode="delivery">'+pre,1)
    scripts=['config.js','mock-data.js','supabase-rest.js','delivery.js','app.js','pwa-client.js']
    for fn in scripts:
        code=(ROOT/'js'/fn).read_text(encoding='utf-8')
        # QA environment has opaque origin; substitute storage APIs only in test copy.
        code=re.sub(r'\blocalStorage\b','window.__qaLocalStorage',code)
        code=re.sub(r'\bsessionStorage\b','window.__qaSessionStorage',code)
        tag=f'<script src="js/{fn}?v=28"></script>'
        html=html.replace(tag,'<script>\n'+code.replace('</script>','<\\/script>')+'\n</script>')
    return html

results=[]
def check(name, ok, detail=''):
    results.append({'name':name,'ok':bool(ok),'detail':str(detail)})

def run_page(browser, viewport, shot, reduced=False):
    context=browser.new_context(viewport=viewport, reduced_motion='reduce' if reduced else 'no-preference')
    page=context.new_page()
    errors=[]
    page.on('console', lambda m: errors.append('console:'+m.text) if m.type=='error' else None)
    page.on('pageerror', lambda e: errors.append('pageerror:'+str(e)))
    page.set_content(qa_html(), wait_until='domcontentloaded', timeout=30000)
    page.wait_for_function("document.querySelectorAll('.product-card').length > 0", timeout=10000)
    return context,page,errors

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])

    # Desktop, first-time user
    ctx,page,errors=run_page(browser,{'width':1440,'height':1000},'desktop')
    btn=page.locator('#openHistoryTop')
    check('Desktop: cardápio carrega',page.locator('.product-card').count()>0,page.locator('.product-card').count())
    check('Desktop: botão histórico usa ícone de relógio',btn.locator('svg.history-clock-icon').count()==1 and '↶' not in btn.inner_text(),btn.inner_text())
    check('Desktop: primeira visita recebe movimento leve', 'history-attention' in (btn.get_attribute('class') or ''), btn.get_attribute('class'))
    anim=btn.evaluate("e=>getComputedStyle(e).animationName")
    duration=btn.evaluate("e=>getComputedStyle(e).animationDuration")
    check('Desktop: animação periódica configurada',anim=='historyAttention' and duration=='4.8s',f'{anim} {duration}')
    page.wait_for_timeout(3650)
    transform=btn.evaluate("e=>getComputedStyle(e).transform")
    check('Desktop: movimento realmente ocorre no Chromium',transform not in ('none','matrix(1, 0, 0, 1, 0, 0)'),transform)
    btn.click()
    page.wait_for_timeout(120)
    check('Desktop: primeiro clique abre explicação',page.locator('#historyIntroDialog').evaluate('e=>e.open'))
    intro=page.locator('#historyIntroDialog')
    introtext=intro.inner_text()
    check('Desktop: explicação informa repetir pedido','pedir novamente' in introtext.lower(),introtext[:180])
    check('Desktop: explicação informa acrescentar itens','acrescentar outros itens' in introtext.lower(),introtext[:180])
    page.screenshot(path=str(ROOT/'qa_v28_history_intro_desktop.png'),full_page=True)
    page.locator('#historyIntroContinue').click()
    page.wait_for_timeout(150)
    check('Desktop: após entender abre histórico',page.locator('#historyDialog').evaluate('e=>e.open'))
    check('Desktop: flag de apresentação salva',page.evaluate("window.__qaLocalStorage.getItem('cantinho_petisco_history_intro_seen_v1')")=='1')
    check('Desktop: movimento para após primeira explicação','history-attention' not in (btn.get_attribute('class') or ''),btn.get_attribute('class'))
    page.locator('#closeHistoryBottom').click(); page.wait_for_timeout(80)
    btn.click(); page.wait_for_timeout(100)
    check('Desktop: segundo clique pula explicação',not page.locator('#historyIntroDialog').evaluate('e=>e.open') and page.locator('#historyDialog').evaluate('e=>e.open'))
    page.locator('#closeHistoryBottom').click()
    page.locator('#openCartTop').click(); page.wait_for_timeout(80)
    check('Desktop: carrinho continua abrindo', 'open' in (page.locator('#cartDrawer').get_attribute('class') or ''))
    check('Desktop: zero erros JavaScript',len(errors)==0,errors)
    ctx.close()

    # Mobile, new user
    ctx,page,errors=run_page(browser,{'width':390,'height':844},'mobile')
    btn=page.locator('#openHistoryTop')
    icon=btn.locator('svg.history-clock-icon')
    label=btn.locator('span').last
    check('Mobile: relógio visível',icon.is_visible())
    check('Mobile: texto recolhe e preserva ícone',not label.is_visible() and icon.is_visible(),f'label={label.is_visible()} icon={icon.is_visible()}')
    box=btn.bounding_box();
    check('Mobile: botão dentro da viewport',box and box['x']>=0 and box['x']+box['width']<=390,box)
    btn.click(); page.wait_for_timeout(120)
    dlg=page.locator('#historyIntroDialog'); db=dlg.bounding_box()
    check('Mobile: explicação abre no primeiro toque',dlg.evaluate('e=>e.open'))
    check('Mobile: modal cabe na tela',db and db['x']>=0 and db['x']+db['width']<=390 and db['height']<844,db)
    body_overflow=page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth')
    check('Mobile: sem rolagem horizontal',body_overflow,page.evaluate('[document.documentElement.scrollWidth,document.documentElement.clientWidth]'))
    page.screenshot(path=str(ROOT/'qa_v28_history_intro_mobile.png'),full_page=True)
    page.locator('#historyIntroContinue').click(); page.wait_for_timeout(100)
    check('Mobile: histórico abre após explicação',page.locator('#historyDialog').evaluate('e=>e.open'))
    page.screenshot(path=str(ROOT/'qa_v28_history_mobile_after_intro.png'),full_page=True)
    check('Mobile: zero erros JavaScript',len(errors)==0,errors)
    ctx.close()

    # Reduced motion accessibility
    ctx,page,errors=run_page(browser,{'width':390,'height':844},'reduced',reduced=True)
    btn=page.locator('#openHistoryTop')
    check('Acessibilidade: reduz movimento quando solicitado',btn.evaluate("e=>getComputedStyle(e).animationName")=='none',btn.evaluate("e=>getComputedStyle(e).animationName"))
    check('Acessibilidade: destaque continua visível sem animação','history-attention' in (btn.get_attribute('class') or ''))
    check('Acessibilidade: zero erros JavaScript',len(errors)==0,errors)
    ctx.close()

    browser.close()

out={'passed':sum(r['ok'] for r in results),'failed':sum(not r['ok'] for r in results),'results':results}
(ROOT/'resultado_chromium_v28.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(out,ensure_ascii=False,indent=2))
