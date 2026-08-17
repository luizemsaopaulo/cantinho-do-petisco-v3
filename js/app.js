(() => {
  'use strict';
  const api = window.supabaseRest;
  const C = window.APP_CONFIG;
  const money = new Intl.NumberFormat(C.LOCALE,{style:'currency',currency:C.CURRENCY});
  const whatsappMoney=value=>money.format(Number(value)).replace(/[\u00a0\u202f]/g,' ');
  const CART_KEY='cantinho_petisco_cart_v2';
  const SIZE_ORDER={P:1,M:2,G:3};
  const state={categories:[],products:[],specials:[],cart:[],query:'',category:'all',selected:null,selectedQty:1,selectedVariants:[],specialOverride:null,groupMap:new Map()};
  const $=s=>document.querySelector(s);
  const els={
    status:$('#menuStatus'),root:$('#menuRoot'),nav:$('#categoryNav'),search:$('#searchInput'),clear:$('#clearSearch'),specialSection:$('#dailySpecialSection'),specialCard:$('#dailySpecialCard'),overlay:$('#overlay'),drawer:$('#cartDrawer'),cartItems:$('#cartItems'),cartEmpty:$('#cartEmpty'),cartFooter:$('#cartFooter'),cartTotal:$('#cartTotal'),cartCountTop:$('#cartCountTop'),cartCountMobile:$('#cartCountMobile'),cartTotalMobile:$('#cartTotalMobile'),mobileCartBar:$('#mobileCartBar'),itemDialog:$('#itemDialog'),itemForm:$('#itemForm'),itemVisual:$('#itemDialogVisual'),itemCategory:$('#itemDialogCategory'),itemName:$('#itemDialogName'),itemDesc:$('#itemDialogDescription'),itemPrice:$('#itemDialogPrice'),itemAvailability:$('#itemAvailability'),itemNote:$('#itemNote'),itemQty:$('#itemQty'),addItem:$('#addItemBtn'),sizePickerWrap:$('#sizePickerWrap'),sizePicker:$('#sizePicker'),selectedSizeLabel:$('#selectedSizeLabel'),checkout:$('#checkoutDialog'),checkoutForm:$('#checkoutForm'),checkoutTotal:$('#checkoutTotal'),addressFields:$('#addressFields'),address:$('#customerAddress'),district:$('#customerDistrict'),payment:$('#paymentMethod'),changeField:$('#changeField'),changeFor:$('#changeFor'),privacy:$('#privacyDialog'),toast:$('#toastRegion')
  };
  const escapeHtml=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normalize=(s='')=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const catById=id=>state.categories.find(c=>c.id===id);
  const productById=id=>state.products.find(p=>p.id===id);
  const sizeRank=s=>SIZE_ORDER[String(s||'').toUpperCase()]||99;
  const sortVariants=list=>[...list].sort((a,b)=>sizeRank(a.size)-sizeRank(b.size)||(a.sort_order||0)-(b.sort_order||0));
  const isMarmita=p=>catById(p.category_id)?.slug==='marmitas';
  function iconFor(slug=''){if(slug.includes('bebidas-alcoolicas'))return'🥃';if(slug.includes('cervejas'))return'🍺';if(slug.includes('sucos'))return'🍹';if(slug.includes('refrigerantes'))return'🥤';if(slug.includes('porcoes'))return'🍟';if(slug.includes('massas'))return'🍝';if(slug.includes('marmitas'))return'🍱';return'🍽️';}
  function imageMarkup(p,cls='placeholder'){if(p?.image_path)return`<img src="${escapeHtml(api.publicImageUrl(p.image_path))}" alt="${escapeHtml(p.name)}" loading="lazy">`;return`<div class="${cls}" aria-hidden="true">${iconFor(p?catById(p.category_id)?.slug:'')}</div>`;}
  function toast(msg,type=''){const d=document.createElement('div');d.className=`toast ${type}`;d.textContent=msg;els.toast.appendChild(d);setTimeout(()=>d.remove(),3000);}
  const WEEKDAY_LABELS=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  function currentRestaurantWeekday(){
    try{
      const short=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:C.TIME_ZONE||'America/Sao_Paulo'}).format(new Date());
      return {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[short] ?? new Date().getDay();
    }catch{return new Date().getDay();}
  }
  async function loadMenu(){try{const data=await api.getPublicMenu();state.categories=(data.categories||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));state.products=(data.products||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));state.specials=data.daily_specials||[];restoreCart();renderNav();renderSpecial();renderMenu();renderCart();els.status.classList.add('hidden');els.root.classList.remove('hidden');}catch(e){els.status.innerHTML=`<p><strong>Não foi possível carregar o cardápio.</strong></p><p>${escapeHtml(e.message||'Verifique sua conexão e tente novamente.')}</p><button class="secondary-button" id="retryLoad">Tentar novamente</button>`;$('#retryLoad')?.addEventListener('click',()=>{els.status.innerHTML='<div class="spinner"></div><p>Carregando o cardápio…</p>';loadMenu();});}}
  function renderNav(){els.nav.innerHTML=[{slug:'all',name:'Tudo'},...state.categories].map(c=>`<button type="button" class="category-chip ${state.category===c.slug?'active':''}" data-category="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</button>`).join('');els.nav.querySelectorAll('[data-category]').forEach(btn=>btn.addEventListener('click',()=>{state.category=btn.dataset.category;renderNav();renderMenu();if(state.category!=='all'&&!state.query)document.getElementById(`cat-${state.category}`)?.scrollIntoView({behavior:'smooth',block:'start'});}));}
  function renderSpecial(){const weekday=currentRestaurantWeekday();let s=state.specials.find(x=>x.active&&Number(x.weekday)===weekday);if(!s&&C.DEMO_MODE)s=state.specials.find(x=>x.active);const p=s&&productById(s.product_id);if(!s||!p||!p.active||!p.available){els.specialSection.classList.add('hidden');return;}const price=s.special_price??p.price,desc=s.note||p.description||'Uma escolha especial da casa para hoje.';els.specialCard.innerHTML=`<div class="special-content"><span class="special-label">✦ Prato do dia · ${escapeHtml(WEEKDAY_LABELS[weekday])}</span><h3>${escapeHtml(p.name)}${p.size?` <small>Tamanho ${escapeHtml(p.size)}</small>`:''}</h3><p>${escapeHtml(desc)}</p><div class="special-price">${price!=null?money.format(Number(price)):'Consulte o valor'}</div><button class="special-action" type="button" data-special-product="${escapeHtml(p.id)}">Adicionar ao pedido</button></div>`;els.specialSection.classList.remove('hidden');els.specialCard.querySelector('[data-special-product]')?.addEventListener('click',()=>openItem(p.id,price));}
  function visibleProductsForCategory(cat){const q=normalize(state.query);return state.products.filter(p=>p.category_id===cat.id&&p.active&&(!q||normalize(`${p.name} ${p.description||''} ${p.size||''}`).includes(q)));}
  function groupProducts(cat,products){if(cat.slug!=='marmitas')return products.map(p=>({id:`single-${p.id}`,name:p.name,variants:[p],grouped:false}));const m=new Map();for(const p of products){const k=normalize(p.name);if(!m.has(k))m.set(k,{id:`group-${p.id}`,name:p.name,variants:[],grouped:true});m.get(k).variants.push(p);}return[...m.values()].map(g=>({...g,variants:sortVariants(g.variants)}));}
  function groupPriceLabel(variants){const prices=variants.filter(v=>v.available&&v.price!=null).map(v=>Number(v.price));if(!prices.length)return'Consulte';const min=Math.min(...prices),max=Math.max(...prices);return min===max?money.format(min):`A partir de ${money.format(min)}`;}
  function cardSizeMarkup(variants){const sized=variants.filter(v=>v.size);if(!sized.length)return'';return`<div class="card-size-list" aria-label="Tamanhos disponíveis">${sized.map(v=>`<span class="card-size-pill ${!v.available||v.price==null?'disabled':''}"><b>${escapeHtml(v.size)}</b><small>${v.price!=null?money.format(Number(v.price)):'sem preço'}</small></span>`).join('')}</div>`;}
  function productGroupCard(group,cat){const v=group.variants,visual=v.find(x=>x.image_path)||v.find(x=>x.featured)||v[0],can=v.some(x=>x.available&&x.price!=null),allOff=v.every(x=>!x.available),featured=v.some(x=>x.featured),desc=v.find(x=>x.description)?.description||'',meta=group.grouped?'Escolha o tamanho':(visual.size?`Tamanho ${visual.size}`:'');return`<article class="product-card ${!can?'unavailable':''} ${group.grouped?'product-card-grouped':''}" data-card-group="${escapeHtml(group.id)}"><div class="product-card-body">${meta?`<div class="product-meta">${escapeHtml(meta)}</div>`:''}<h3>${escapeHtml(group.name)}</h3>${desc?`<p class="product-description">${escapeHtml(desc)}</p>`:''}${group.grouped?cardSizeMarkup(v):''}<div class="product-bottom"><strong class="product-price">${groupPriceLabel(v)}</strong><button class="add-circle" type="button" data-open-group="${escapeHtml(group.id)}" ${!can?'disabled':''} aria-label="Escolher ${escapeHtml(group.name)}">${allOff?'×':'+'}</button></div></div><div class="product-visual">${imageMarkup(visual)}${featured?'<span class="featured-badge">Destaque</span>':''}</div></article>`;}
  function marmitaGuide(){return`<div class="marmita-size-guide" aria-label="Guia de tamanhos"><div><span class="eyebrow">Tamanhos</span><strong>Escolha o prato primeiro.</strong><small>Depois selecione o tamanho disponível.</small></div><div class="guide-sizes"><span><b>P</b><small>Pequena</small></span><span><b>M</b><small>Média</small></span><span><b>G</b><small>Grande</small></span></div></div>`;}
  function renderMenu(){const cats=state.category==='all'?state.categories:state.categories.filter(c=>c.slug===state.category),sections=[];state.groupMap=new Map();for(const c of cats){const products=visibleProductsForCategory(c);if(!products.length)continue;const groups=groupProducts(c,products);groups.forEach(g=>state.groupMap.set(g.id,g));sections.push(`<section class="menu-section" id="cat-${escapeHtml(c.slug)}"><div class="section-heading"><div><span class="eyebrow">Cardápio</span><h2>${escapeHtml(c.name)}</h2>${c.description?`<p>${escapeHtml(c.description)}</p>`:''}</div></div>${c.slug==='marmitas'?marmitaGuide():''}<div class="product-grid">${groups.map(g=>productGroupCard(g,c)).join('')}</div></section>`);}els.root.innerHTML=sections.length?sections.join(''):'<div class="no-results"><strong>Nenhum item encontrado.</strong><p>Tente buscar por outro nome.</p></div>';els.root.querySelectorAll('[data-open-group]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openGroup(b.dataset.openGroup);}));els.root.querySelectorAll('[data-card-group]').forEach(card=>card.addEventListener('click',()=>openGroup(card.dataset.cardGroup)));}
  function groupVariantsForProduct(p){if(!isMarmita(p))return[p];const k=normalize(p.name);return sortVariants(state.products.filter(x=>x.active&&x.category_id===p.category_id&&normalize(x.name)===k));}
  function chooseDefaultVariant(vars,preferredId=null){return(preferredId&&vars.find(v=>v.id===preferredId))||vars.find(v=>v.available&&v.price!=null)||vars[0]||null;}
  function openGroup(id){const g=state.groupMap.get(id);if(!g)return;state.specialOverride=null;state.selectedVariants=sortVariants(g.variants);state.selected=chooseDefaultVariant(state.selectedVariants);state.selectedQty=1;els.itemNote.value='';renderItemDialog();els.itemDialog.showModal();}
  function openItem(id,overridePrice=null){const p=productById(id);if(!p)return;state.selectedVariants=groupVariantsForProduct(p);state.specialOverride=overridePrice==null?null:{productId:p.id,price:Number(overridePrice)};state.selected=chooseDefaultVariant(state.selectedVariants,p.id);state.selectedQty=1;els.itemNote.value='';renderItemDialog();els.itemDialog.showModal();}
  function effectiveVariantPrice(p){return state.specialOverride?.productId===p.id?state.specialOverride.price:p.price;}
  function renderSizePicker(){const vars=state.selectedVariants.filter(v=>v.size);if(!vars.length){els.sizePickerWrap.classList.add('hidden');els.sizePicker.innerHTML='';els.selectedSizeLabel.textContent='';return;}els.sizePickerWrap.classList.remove('hidden');els.selectedSizeLabel.textContent=state.selected?.size?`Tamanho ${state.selected.size}`:'';els.sizePicker.innerHTML=vars.map(v=>{const price=state.specialOverride?.productId===v.id?state.specialOverride.price:v.price,disabled=!v.available||price==null,selected=state.selected?.id===v.id,label=v.size==='P'?'Pequena':v.size==='M'?'Média':v.size==='G'?'Grande':`Tamanho ${v.size}`;return`<button type="button" class="size-option ${selected?'selected':''}" data-size-variant="${escapeHtml(v.id)}" role="radio" aria-checked="${selected}" ${disabled?'disabled':''}><span class="size-letter">${escapeHtml(v.size||'—')}</span><span class="size-option-copy"><strong>${escapeHtml(label)}</strong><small>${price!=null?money.format(Number(price)):'Sem preço'}</small></span>${selected?'<span class="size-check">✓</span>':''}</button>`;}).join('');els.sizePicker.querySelectorAll('[data-size-variant]').forEach(btn=>btn.addEventListener('click',()=>{const v=productById(btn.dataset.sizeVariant);if(!v||!v.available||effectiveVariantPrice(v)==null)return;state.selected=v;renderItemDialog();}));}
  function renderAddButton(){const p=state.selected;if(!p)return;const price=effectiveVariantPrice(p),disabled=!p.available||price==null;els.addItem.disabled=disabled;els.addItem.textContent=disabled?'Indisponível':`Adicionar • ${money.format(Number(price)*state.selectedQty)}`;}
  function renderItemDialog(){const p=state.selected;if(!p)return;const cat=catById(p.category_id),price=effectiveVariantPrice(p),visual=state.selectedVariants.find(v=>v.image_path)||p;els.itemQty.textContent=String(state.selectedQty);els.itemVisual.innerHTML=imageMarkup(visual);els.itemCategory.textContent=cat?.name||'';els.itemName.textContent=p.name;els.itemDesc.textContent=p.description||state.selectedVariants.find(v=>v.description)?.description||'';els.itemPrice.textContent=price!=null?money.format(Number(price)):'Preço não informado';els.itemAvailability.textContent=p.available?'Disponível':'Indisponível';els.itemAvailability.className=p.available?'available-text':'unavailable-text';renderSizePicker();renderAddButton();}
  function saveCart(){try{localStorage.setItem(CART_KEY,JSON.stringify(state.cart));}catch{}}
  function restoreCart(){try{const rawV2=localStorage.getItem(CART_KEY),rawV1=localStorage.getItem('cantinho_petisco_cart_v1'),raw=JSON.parse(rawV2||rawV1||'[]');state.cart=Array.isArray(raw)?raw.filter(x=>productById(x.product_id)&&Number(x.qty)>0).map(x=>({...x,qty:Math.min(99,Math.max(1,Number(x.qty)||1))})):[];if(!rawV2&&rawV1&&state.cart.length)saveCart();}catch{state.cart=[];}}
  function addSelected(){const p=state.selected;if(!p)return;const price=effectiveVariantPrice(p);if(price==null||!p.available)return;const note=els.itemNote.value.trim(),key=`${p.id}|${note}|${price}`,existing=state.cart.find(x=>x.key===key);if(existing)existing.qty=Math.min(99,existing.qty+state.selectedQty);else state.cart.push({key,product_id:p.id,name:p.name,size:p.size||'',price:Number(price),qty:state.selectedQty,note});saveCart();renderCart();els.mobileCartBar.classList.remove('bump');requestAnimationFrame(()=>{els.mobileCartBar.classList.add('bump');setTimeout(()=>els.mobileCartBar.classList.remove('bump'),420);});toast(`${p.name}${p.size?` · ${p.size}`:''} adicionado ao pedido.`,'success');}
  const cartTotal=()=>state.cart.reduce((a,x)=>a+Number(x.price)*x.qty,0),cartCount=()=>state.cart.reduce((a,x)=>a+x.qty,0);
  function renderCart(){const count=cartCount(),total=cartTotal();els.cartCountTop.textContent=count;els.cartCountMobile.textContent=count;els.cartTotalMobile.textContent=money.format(total);els.cartTotal.textContent=money.format(total);els.checkoutTotal.textContent=money.format(total);els.mobileCartBar.classList.toggle('hidden',!count);els.cartEmpty.classList.toggle('hidden',!!count);els.cartFooter.classList.toggle('hidden',!count);els.cartItems.innerHTML=state.cart.map((x,i)=>`<div class="cart-line" data-line="${i}"><div><h4>${escapeHtml(x.name)}${x.size?` · <span class="cart-size">${escapeHtml(x.size)}</span>`:''}</h4>${x.note?`<p>Obs.: ${escapeHtml(x.note)}</p>`:''}<div class="cart-line-actions"><div class="mini-qty"><button type="button" data-dec="${i}" aria-label="Diminuir">−</button><strong>${x.qty}</strong><button type="button" data-inc="${i}" aria-label="Aumentar">+</button></div><button class="remove-line" type="button" data-remove="${i}">Remover</button></div></div><div class="cart-line-price">${money.format(x.price*x.qty)}</div></div>`).join('');els.cartItems.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>changeQty(+b.dataset.dec,-1));els.cartItems.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>changeQty(+b.dataset.inc,1));els.cartItems.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>removeLine(+b.dataset.remove));}
  function changeQty(i,d){if(!state.cart[i])return;state.cart[i].qty+=d;if(state.cart[i].qty<=0)state.cart.splice(i,1);else state.cart[i].qty=Math.min(99,state.cart[i].qty);saveCart();renderCart();}
  function removeLine(i){state.cart.splice(i,1);saveCart();renderCart();}
  function openCart(){els.drawer.classList.add('open');els.drawer.setAttribute('aria-hidden','false');els.overlay.classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeCart(){els.drawer.classList.remove('open');els.drawer.setAttribute('aria-hidden','true');els.overlay.classList.add('hidden');document.body.style.overflow='';}
  function buildWhatsAppMessage(){
    const name=$('#customerName').value.trim();
    const type=document.querySelector('input[name="fulfillment"]:checked')?.value||'Retirada';
    const payment=els.payment.value;
    const lines=['*PEDIDO:*'];

    state.cart.forEach(x=>{
      lines.push(`*${x.qty}x ${x.name}${x.size?` (${x.size})`:''}* — ${whatsappMoney(x.price*x.qty)}`);
      if(x.note)lines.push(`_Obs.: ${x.note}_`);
    });

    lines.push('',`*Total dos itens:* ${whatsappMoney(cartTotal())}`,`*Pagamento:* ${payment};`);

    if(payment==='Dinheiro'&&els.changeFor.value.trim()){
      lines.push(`*Troco para:* R$ ${els.changeFor.value.trim()}`);
    }

    const note=$('#orderNote').value.trim();
    if(note)lines.push('',`*Observação geral:* ${note}`);

    lines.push('');
    if(type==='Entrega'){
      lines.push('*DADOS PARA ENTREGA:*');
      lines.push(`*Endereço:* ${els.address.value.trim()}`);
      if(els.district.value.trim())lines.push(`*Bairro:* ${els.district.value.trim()}`);
    }else{
      lines.push('*RETIRADA NO LOCAL*');
    }
    lines.push(`*Nome do cliente:* ${name}`);
    return lines.join('\n');
  }

  function sendToWhatsApp(){
    const url=`https://wa.me/${C.WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppMessage())}`;
    window.__TEST_LAST_WHATSAPP_URL__=url;

    // Em celulares, navegar na própria aba é muito mais confiável do que window.open,
    // que pode ser bloqueado como popup e impedir a abertura do WhatsApp.
    if(typeof window.__WHATSAPP_NAVIGATOR__==='function'){
      window.__WHATSAPP_NAVIGATOR__(url);
      return;
    }
    window.location.assign(url);
  }
  function initEvents(){els.search.addEventListener('input',()=>{state.query=els.search.value.trim();els.clear.classList.toggle('hidden',!state.query);renderMenu();});els.clear.addEventListener('click',()=>{els.search.value='';state.query='';els.clear.classList.add('hidden');renderMenu();els.search.focus();});$('#openCartTop').onclick=openCart;els.mobileCartBar.onclick=openCart;$('#closeCart').onclick=closeCart;els.overlay.onclick=closeCart;$('#privacyBtn').onclick=()=>els.privacy.showModal();$('#itemQtyMinus').onclick=()=>{state.selectedQty=Math.max(1,state.selectedQty-1);els.itemQty.textContent=state.selectedQty;renderAddButton();};$('#itemQtyPlus').onclick=()=>{state.selectedQty=Math.min(99,state.selectedQty+1);els.itemQty.textContent=state.selectedQty;renderAddButton();};els.itemForm.addEventListener('submit',e=>{e.preventDefault();addSelected();els.itemDialog.close();});$('#closeItemDialog').onclick=()=>els.itemDialog.close();$('#closeCheckoutDialog').onclick=()=>els.checkout.close();$('#checkoutBtn').onclick=()=>{closeCart();els.checkoutTotal.textContent=money.format(cartTotal());els.checkout.showModal();};document.querySelectorAll('input[name="fulfillment"]').forEach(r=>r.addEventListener('change',()=>{const delivery=document.querySelector('input[name="fulfillment"]:checked')?.value==='Entrega';els.addressFields.classList.toggle('hidden',!delivery);els.address.required=delivery;}));els.payment.addEventListener('change',()=>els.changeField.classList.toggle('hidden',els.payment.value!=='Dinheiro'));els.checkoutForm.addEventListener('submit',e=>{e.preventDefault();if(!state.cart.length){toast('Seu pedido está vazio.','error');return;}const delivery=document.querySelector('input[name="fulfillment"]:checked')?.value==='Entrega';if(delivery&&!els.address.value.trim()){els.address.focus();return;}if(!els.checkoutForm.reportValidity())return;sendToWhatsApp();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&els.drawer.classList.contains('open'))closeCart();});}
  initEvents();loadMenu();
})();
