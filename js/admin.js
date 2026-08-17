(() => {
  'use strict';
  const api = window.supabaseRest;
  const C = window.APP_CONFIG;
  const money = new Intl.NumberFormat(C.LOCALE,{style:'currency',currency:C.CURRENCY});
  const WEEKDAYS = [
    {value:1,label:'Segunda-feira',short:'Seg'},
    {value:2,label:'Terça-feira',short:'Ter'},
    {value:3,label:'Quarta-feira',short:'Qua'},
    {value:4,label:'Quinta-feira',short:'Qui'},
    {value:5,label:'Sexta-feira',short:'Sex'},
    {value:6,label:'Sábado',short:'Sáb'},
    {value:0,label:'Domingo',short:'Dom'},
  ];
  const state = { categories:[], products:[], specials:[], editing:null, imageRemoved:false };
  const $ = s => document.querySelector(s);
  const els = {
    login:$('#loginView'), admin:$('#adminView'), loginForm:$('#loginForm'), loginMessage:$('#loginMessage'), loginBtn:$('#loginBtn'), identity:$('#adminIdentity'),
    groups:$('#productsGroups'), empty:$('#adminEmpty'), search:$('#adminSearch'), clearSearch:$('#clearAdminSearch'), filter:$('#adminCategoryFilter'),
    productDialog:$('#productDialog'), productForm:$('#productForm'), specialForm:$('#specialForm'), specialList:$('#specialList'), toast:$('#toastRegion')
  };
  const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normalize = (s='') => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function toast(msg,type=''){const d=document.createElement('div');d.className=`toast ${type}`;d.textContent=msg;els.toast.appendChild(d);setTimeout(()=>d.remove(),3200);}
  function slugify(s=''){return normalize(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,130)||'produto';}
  function cat(id){return state.categories.find(c=>c.id===id)}
  function product(id){return state.products.find(p=>p.id===id)}
  function imgUrl(path){return path?api.publicImageUrl(path):''}
  function weekdayInfo(value){return WEEKDAYS.find(d=>d.value===Number(value))||{value:Number(value),label:'Dia não definido',short:'—'};}

  async function boot(){
    if(C.DEMO_MODE) $('#demoCredentials').classList.remove('hidden');
    const session=await api.ensureSession();
    if(!session){showLogin();return;}
    try{ if(await api.isAdmin()){ await enterAdmin(session); } else { api.logout(); showLogin('Este usuário não está autorizado como administrador.'); } }
    catch(e){api.logout();showLogin(e.message||'Não foi possível validar a sessão.');}
  }
  function showLogin(message=''){
    els.login.classList.remove('hidden');els.admin.classList.add('hidden');
    els.loginMessage.classList.toggle('hidden',!message);els.loginMessage.textContent=message;
  }
  async function enterAdmin(session){
    els.login.classList.add('hidden');els.admin.classList.remove('hidden');els.identity.textContent=session.user?.email||'Administrador autorizado';
    await reloadData();
  }
  async function reloadData(){
    const data=await api.adminGetAll();state.categories=data.categories||[];state.products=data.products||[];state.specials=data.daily_specials||[];
    state.categories.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));state.products.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.name.localeCompare(b.name,'pt-BR'));
    renderMetrics();renderCategoryOptions();renderProducts();renderSpecials();
  }
  function renderMetrics(){
    $('#metricProducts').textContent=state.products.length;$('#metricAvailable').textContent=state.products.filter(p=>p.active&&p.available).length;
    $('#metricInactive').textContent=state.products.filter(p=>!p.active).length;$('#metricCategories').textContent=state.categories.length;
  }
  function renderCategoryOptions(){
    const options=state.categories.map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    const currentFilter=els.filter.value;els.filter.innerHTML='<option value="">Todas as categorias</option>'+options;els.filter.value=currentFilter;
    $('#productCategory').innerHTML=options;
    const activeProducts=state.products.filter(p=>p.active).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||(a.size||'').localeCompare(b.size||''));
    $('#specialProduct').innerHTML='<option value="">Selecione...</option>'+activeProducts.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.size?` · ${escapeHtml(p.size)}`:''} — ${p.price!=null?money.format(Number(p.price)):'sem preço'}</option>`).join('');
  }
  function statusPill(p){
    if(!p.active)return '<span class="status-pill off">Não publicado</span>';
    if(!p.available)return '<span class="status-pill off">Indisponível</span>';
    return '<span class="status-pill ok">Disponível</span>';
  }
  function renderProductRow(p){
    return `<article class="admin-product-row">
      <div class="product-cell">
        <div class="thumb">${p.image_path?`<img src="${escapeHtml(imgUrl(p.image_path))}" alt="">`:'🍽️'}</div>
        <div><div class="row-title">${escapeHtml(p.name)}</div><div class="row-sub">${p.size?`Tamanho ${escapeHtml(p.size)}`:'Sem tamanho'}${p.featured?' · Destaque':''}</div></div>
      </div>
      <div class="admin-product-price">${p.price!=null?money.format(Number(p.price)):'—'}</div>
      <div>${statusPill(p)}</div>
      <button class="edit-row" data-edit="${escapeHtml(p.id)}" type="button">Editar</button>
    </article>`;
  }
  function renderProducts(){
    const q=normalize(els.search.value),filter=els.filter.value;
    const filtered=state.products.filter(p=>(!filter||p.category_id===filter)&&(!q||normalize(`${p.name} ${p.size||''} ${p.description||''}`).includes(q)));
    els.empty.classList.toggle('hidden',!!filtered.length);els.groups.classList.toggle('hidden',!filtered.length);
    const html=[];
    for(const c of state.categories){
      const items=filtered.filter(p=>p.category_id===c.id);
      if(!items.length)continue;
      html.push(`<section class="admin-category-card">
        <header class="admin-category-header">
          <div><span class="admin-category-kicker">Categoria</span><h3>${escapeHtml(c.name)}</h3>${c.description?`<p>${escapeHtml(c.description)}</p>`:''}</div>
          <span class="admin-category-count">${items.length} ${items.length===1?'item':'itens'}</span>
        </header>
        <div class="admin-category-products">${items.map(renderProductRow).join('')}</div>
      </section>`);
    }
    els.groups.innerHTML=html.join('');
    els.groups.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openProduct(b.dataset.edit));
  }
  function renderSpecials(){
    els.specialList.innerHTML=WEEKDAYS.map(day=>{
      const s=state.specials.find(x=>Number(x.weekday)===day.value);
      const p=s?product(s.product_id):null;
      if(!s){return `<div class="weekday-row empty"><div class="weekday-name"><span>${day.short}</span><strong>${day.label}</strong></div><div class="weekday-empty">Nenhum prato definido</div><button type="button" class="edit-row" data-new-weekday="${day.value}">Definir</button></div>`;}
      return `<div class="weekday-row ${s.active?'':'inactive'}">
        <div class="weekday-name"><span>${day.short}</span><strong>${day.label}</strong></div>
        <div class="weekday-product"><strong>${escapeHtml(p?.name||'Produto removido')}${p?.size?` (${escapeHtml(p.size)})`:''}</strong><small>${escapeHtml(s.note||'Sem observação')}</small></div>
        <div class="weekday-price">${s.special_price!=null?money.format(Number(s.special_price)):'Preço normal'}<small>${s.active?'Ativo':'Inativo'}</small></div>
        <div class="weekday-actions"><button type="button" class="edit-row" data-edit-special="${escapeHtml(s.id)}">Editar</button><button type="button" class="delete-mini" data-del-special="${escapeHtml(s.id)}">Excluir</button></div>
      </div>`;
    }).join('');
    els.specialList.querySelectorAll('[data-edit-special]').forEach(b=>b.onclick=()=>editSpecial(b.dataset.editSpecial));
    els.specialList.querySelectorAll('[data-del-special]').forEach(b=>b.onclick=()=>deleteSpecial(b.dataset.delSpecial));
    els.specialList.querySelectorAll('[data-new-weekday]').forEach(b=>b.onclick=()=>prepareSpecialDay(Number(b.dataset.newWeekday)));
  }
  function resetSpecialForm(){
    els.specialForm.reset();$('#specialActive').checked=true;$('#specialId').value='';$('#cancelSpecialEdit').classList.add('hidden');
  }
  function prepareSpecialDay(day){resetSpecialForm();$('#specialWeekday').value=String(day);$('#specialProduct').focus();}
  function editSpecial(id){
    const s=state.specials.find(x=>x.id===id);if(!s)return;
    $('#specialId').value=s.id;$('#specialWeekday').value=String(s.weekday);$('#specialProduct').value=s.product_id;$('#specialPrice').value=s.special_price??'';$('#specialNote').value=s.note||'';$('#specialActive').checked=s.active!==false;$('#cancelSpecialEdit').classList.remove('hidden');
    $('#specialWeekday').scrollIntoView({behavior:'smooth',block:'center'});
  }
  function openProduct(id=null){
    state.editing=id?product(id):null;state.imageRemoved=false; const p=state.editing;
    $('#productDialogTitle').textContent=p?'Editar produto':'Novo produto';$('#productId').value=p?.id||'';$('#productName').value=p?.name||'';$('#productCategory').value=p?.category_id||state.categories[0]?.id||'';
    $('#productSize').value=p?.size||'';$('#productPrice').value=p?.price??'';$('#productOrder').value=p?.sort_order??0;$('#productDescription').value=p?.description||'';
    $('#productAvailable').checked=p?.available??true;$('#productActive').checked=p?.active??true;$('#productFeatured').checked=p?.featured??false;$('#productImage').value='';
    const box=$('#imagePreviewBox'),preview=$('#imagePreview'); if(p?.image_path){preview.src=imgUrl(p.image_path);box.classList.remove('hidden');}else{preview.removeAttribute('src');box.classList.add('hidden');}
    $('#deleteProductBtn').classList.toggle('hidden',!p); els.productDialog.showModal();
  }
  function uniqueSlug(name,size,categoryId,excludeId){
    const base=slugify(`${name}${size?`-${size}`:''}`);let s=base,i=2;const used=()=>state.products.some(p=>p.id!==excludeId&&p.category_id===categoryId&&p.slug===s);while(used())s=`${base}-${i++}`;return s;
  }
  async function saveProduct(){
    const id=$('#productId').value||null,name=$('#productName').value.trim(),category_id=$('#productCategory').value,size=$('#productSize').value.trim()||null;
    const priceRaw=$('#productPrice').value;if(!name||!category_id||priceRaw==='')throw new Error('Preencha nome, categoria e preço.');
    let image_path=state.editing?.image_path||null;if(state.imageRemoved)image_path=null;const file=$('#productImage').files?.[0];if(file){$('#saveProductBtn').textContent='Enviando foto…';image_path=await api.uploadProductImage(file);}
    const row={id,category_id,name,slug:uniqueSlug(name,size,category_id,id),size,description:$('#productDescription').value.trim()||null,price:Number(priceRaw),image_path,active:$('#productActive').checked,available:$('#productAvailable').checked,featured:$('#productFeatured').checked,sort_order:Math.max(0,Number($('#productOrder').value)||0)};
    await api.saveProduct(row);await reloadData();els.productDialog.close();toast('Produto salvo com sucesso.','success');
  }
  async function deleteProduct(id){
    const p=product(id);if(!p)return;if(!confirm(`Excluir “${p.name}”? Esta ação não pode ser desfeita.`))return;
    await api.deleteProduct(id);await reloadData();els.productDialog.close();toast('Produto excluído.','success');
  }
  async function saveSpecial(){
    const weekdayRaw=$('#specialWeekday').value;
    const row={id:$('#specialId').value||null,weekday:weekdayRaw===''?null:Number(weekdayRaw),product_id:$('#specialProduct').value,special_price:$('#specialPrice').value===''?null:Number($('#specialPrice').value),note:$('#specialNote').value.trim()||null,active:$('#specialActive').checked};
    if(row.weekday===null||!row.product_id)throw new Error('Escolha o dia da semana e o produto.');
    await api.saveSpecial(row);await reloadData();resetSpecialForm();toast(`${weekdayInfo(row.weekday).label} salva com sucesso.`,'success');
  }
  async function deleteSpecial(id){if(!confirm('Excluir a programação deste dia?'))return;await api.deleteSpecial(id);await reloadData();resetSpecialForm();toast('Programação excluída.','success');}

  function switchTab(name){
    document.querySelectorAll('.admin-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
    $('#productsTab').classList.toggle('hidden',name!=='products');$('#specialTab').classList.toggle('hidden',name!=='special');
  }
  function initEvents(){
    els.loginForm.addEventListener('submit',async e=>{e.preventDefault();els.loginBtn.disabled=true;els.loginBtn.textContent='Entrando…';els.loginMessage.classList.add('hidden');try{const s=await api.login($('#adminEmail').value.trim(),$('#adminPassword').value);if(!(await api.isAdmin()))throw new Error('Usuário autenticado, mas sem permissão de administrador.');await enterAdmin(s);}catch(err){api.logout();showLogin(err.message||'Falha no login.');}finally{els.loginBtn.disabled=false;els.loginBtn.textContent='Entrar';}});
    $('#logoutBtn').onclick=()=>{api.logout();location.reload();};
    document.querySelectorAll('.admin-tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
    els.search.addEventListener('input',()=>{els.clearSearch.classList.toggle('hidden',!els.search.value);renderProducts();});els.clearSearch.onclick=()=>{els.search.value='';els.clearSearch.classList.add('hidden');renderProducts();els.search.focus();};els.filter.onchange=renderProducts;
    $('#newProductBtn').onclick=()=>openProduct();
    els.productForm.addEventListener('submit',async e=>{e.preventDefault();const btn=$('#saveProductBtn');btn.disabled=true;const old=btn.textContent;try{await saveProduct();}catch(err){toast(err.message||'Não foi possível salvar.','error');}finally{btn.disabled=false;btn.textContent=old;}});
    $('#closeProductDialog').onclick=()=>els.productDialog.close();
    $('#cancelProductDialog').onclick=()=>els.productDialog.close();
    $('#deleteProductBtn').onclick=()=>deleteProduct($('#productId').value);
    $('#productImage').onchange=()=>{const file=$('#productImage').files?.[0];if(!file)return;const u=URL.createObjectURL(file);$('#imagePreview').src=u;$('#imagePreviewBox').classList.remove('hidden');state.imageRemoved=false;};
    $('#removeImageBtn').onclick=()=>{$('#productImage').value='';$('#imagePreview').removeAttribute('src');$('#imagePreviewBox').classList.add('hidden');state.imageRemoved=true;};
    els.specialForm.addEventListener('submit',async e=>{e.preventDefault();try{await saveSpecial();}catch(err){toast(err.message||'Não foi possível salvar.','error');}});
    $('#cancelSpecialEdit').onclick=resetSpecialForm;
  }
  initEvents();boot();
})();
