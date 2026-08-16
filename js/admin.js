(() => {
  'use strict';
  const api = window.supabaseRest;
  const C = window.APP_CONFIG;
  const money = new Intl.NumberFormat(C.LOCALE,{style:'currency',currency:C.CURRENCY});
  const state = { categories:[], products:[], specials:[], editing:null, imageRemoved:false };
  const $ = s => document.querySelector(s);
  const els = {
    login:$('#loginView'), admin:$('#adminView'), loginForm:$('#loginForm'), loginMessage:$('#loginMessage'), loginBtn:$('#loginBtn'), identity:$('#adminIdentity'),
    table:$('#productsTableBody'), empty:$('#adminEmpty'), search:$('#adminSearch'), clearSearch:$('#clearAdminSearch'), filter:$('#adminCategoryFilter'),
    productDialog:$('#productDialog'), productForm:$('#productForm'), specialForm:$('#specialForm'), specialList:$('#specialList'), toast:$('#toastRegion')
  };
  const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normalize = (s='') => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function toast(msg,type=''){const d=document.createElement('div');d.className=`toast ${type}`;d.textContent=msg;els.toast.appendChild(d);setTimeout(()=>d.remove(),3200);}
  function slugify(s=''){return normalize(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,130)||'produto';}
  function cat(id){return state.categories.find(c=>c.id===id)}
  function product(id){return state.products.find(p=>p.id===id)}
  function imgUrl(path){return path?api.publicImageUrl(path):''}

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
    state.categories.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));state.products.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
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
    const activeProducts=state.products.filter(p=>p.active).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    $('#specialProduct').innerHTML='<option value="">Selecione...</option>'+activeProducts.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.size?` · ${escapeHtml(p.size)}`:''} — ${p.price!=null?money.format(Number(p.price)):'sem preço'}</option>`).join('');
  }
  function statusPill(p){
    if(!p.active)return '<span class="status-pill off">Inativo</span>'; if(!p.available)return '<span class="status-pill off">Indisponível</span>'; return '<span class="status-pill ok">Disponível</span>';
  }
  function renderProducts(){
    const q=normalize(els.search.value),filter=els.filter.value;
    const rows=state.products.filter(p=>(!filter||p.category_id===filter)&&(!q||normalize(`${p.name} ${p.size||''}`).includes(q)));
    els.empty.classList.toggle('hidden',!!rows.length);$('#productsTableWrap').classList.toggle('hidden',!rows.length);
    els.table.innerHTML=rows.map(p=>`<tr><td><div class="product-cell"><div class="thumb">${p.image_path?`<img src="${escapeHtml(imgUrl(p.image_path))}" alt="">`:'🍽️'}</div><div><div class="row-title">${escapeHtml(p.name)}</div><div class="row-sub">${p.size?`Tamanho ${escapeHtml(p.size)} · `:''}${escapeHtml(p.slug||'')}</div></div></div></td><td>${escapeHtml(cat(p.category_id)?.name||'—')}</td><td>${p.price!=null?money.format(Number(p.price)):'—'}</td><td>${statusPill(p)}</td><td><div class="row-actions"><button class="edit-row" data-edit="${escapeHtml(p.id)}" type="button">Editar</button></div></td></tr>`).join('');
    els.table.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openProduct(b.dataset.edit));
  }
  function renderSpecials(){
    const list=[...state.specials].sort((a,b)=>String(b.special_date).localeCompare(String(a.special_date)));
    els.specialList.innerHTML=list.length?list.map(s=>{const p=product(s.product_id);return `<div class="special-row"><div><strong>${escapeHtml(new Date(`${s.special_date}T12:00:00`).toLocaleDateString('pt-BR'))}</strong><small>${s.active?'Ativo':'Inativo'}</small></div><div><strong>${escapeHtml(p?.name||'Produto removido')}</strong><small>${escapeHtml(s.note||'Sem observação')}</small></div><div>${s.special_price!=null?money.format(Number(s.special_price)):'Preço normal'}</div><button type="button" data-del-special="${escapeHtml(s.id)}">Excluir</button></div>`}).join(''):'<p class="row-sub">Nenhum prato do dia cadastrado.</p>';
    els.specialList.querySelectorAll('[data-del-special]').forEach(b=>b.onclick=()=>deleteSpecial(b.dataset.delSpecial));
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
    const row={id:$('#specialId').value||null,special_date:$('#specialDate').value,product_id:$('#specialProduct').value,special_price:$('#specialPrice').value===''?null:Number($('#specialPrice').value),note:$('#specialNote').value.trim()||null,active:$('#specialActive').checked};
    if(!row.special_date||!row.product_id)throw new Error('Escolha a data e o produto.');await api.saveSpecial(row);await reloadData();els.specialForm.reset();$('#specialActive').checked=true;$('#specialId').value='';toast('Prato do dia salvo.','success');
  }
  async function deleteSpecial(id){if(!confirm('Excluir este prato do dia?'))return;await api.deleteSpecial(id);await reloadData();toast('Prato do dia excluído.','success');}

  function initEvents(){
    els.loginForm.addEventListener('submit',async e=>{e.preventDefault();els.loginBtn.disabled=true;els.loginBtn.textContent='Entrando…';els.loginMessage.classList.add('hidden');try{const s=await api.login($('#adminEmail').value.trim(),$('#adminPassword').value);if(!(await api.isAdmin()))throw new Error('Usuário autenticado, mas sem permissão de administrador.');await enterAdmin(s);}catch(err){api.logout();showLogin(err.message||'Falha no login.');}finally{els.loginBtn.disabled=false;els.loginBtn.textContent='Entrar';}});
    $('#logoutBtn').onclick=()=>{api.logout();location.reload();};
    document.querySelectorAll('.admin-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.admin-tab').forEach(x=>x.classList.toggle('active',x===b));$('#productsTab').classList.toggle('hidden',b.dataset.tab!=='products');$('#specialTab').classList.toggle('hidden',b.dataset.tab!=='special');});
    els.search.addEventListener('input',()=>{els.clearSearch.classList.toggle('hidden',!els.search.value);renderProducts();});els.clearSearch.onclick=()=>{els.search.value='';els.clearSearch.classList.add('hidden');renderProducts();els.search.focus();};els.filter.onchange=renderProducts;
    $('#newProductBtn').onclick=()=>openProduct();
    els.productForm.addEventListener('submit',async e=>{e.preventDefault();const btn=$('#saveProductBtn');btn.disabled=true;const old=btn.textContent;try{await saveProduct();}catch(err){toast(err.message||'Não foi possível salvar.','error');}finally{btn.disabled=false;btn.textContent=old;}});
    $('#closeProductDialog').onclick=()=>els.productDialog.close();
    $('#cancelProductDialog').onclick=()=>els.productDialog.close();
    $('#deleteProductBtn').onclick=()=>deleteProduct($('#productId').value);
    $('#productImage').onchange=()=>{const file=$('#productImage').files?.[0];if(!file)return;const u=URL.createObjectURL(file);$('#imagePreview').src=u;$('#imagePreviewBox').classList.remove('hidden');state.imageRemoved=false;};
    $('#removeImageBtn').onclick=()=>{$('#productImage').value='';$('#imagePreview').removeAttribute('src');$('#imagePreviewBox').classList.add('hidden');state.imageRemoved=true;};
    els.specialForm.addEventListener('submit',async e=>{e.preventDefault();try{await saveSpecial();}catch(err){toast(err.message||'Não foi possível salvar.','error');}});
  }
  initEvents();boot();
})();
