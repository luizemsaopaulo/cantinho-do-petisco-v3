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
  const state = { categories:[], products:[], specials:[], optionGroups:[], productOptions:[], editing:null, editingOptionGroups:[], imageRemoved:false, collapsedCategories:new Set(), categoryQueries:{}, categoriesInitialized:false };
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
  function groupsForProduct(productId){return state.optionGroups.filter(g=>g.product_id===productId).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));}
  function optionsForGroup(groupId){return state.productOptions.filter(o=>o.group_id===groupId).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));}
  function cloneProductOptionModel(productId){return groupsForProduct(productId).map(g=>({...g,options:optionsForGroup(g.id).map(o=>({...o}))}));}
  function optionSummary(productId){const groups=groupsForProduct(productId);if(!groups.length)return'';const count=groups.reduce((n,g)=>n+optionsForGroup(g.id).length,0);return` · ${groups.length} ${groups.length===1?'grupo':'grupos'} / ${count} ${count===1?'opção':'opções'}`;}
  function optionCodeBase(value=''){return slugify(value).slice(0,100)||'opcao';}
  function groupDefaultsQuantity(group){return normalize(`${group?.code||''} ${group?.name||''}`).includes('adicion');}
  function optionQuantityDefault(group,option){if(option?.allow_quantity!=null)return option.allow_quantity!==false;return groupDefaultsQuantity(group)&&!option?.is_none_option&&(option?.price_mode||'add')==='add';}
  function makeUniqueCode(base,used){let code=base||'opcao',n=2;while(used.has(code))code=`${base}-${n++}`;used.add(code);return code;}
  function normalizeEditorCodes(groups){
    const groupCodes=new Set();
    return groups.map((g,gi)=>{const groupCode=g.code&&!groupCodes.has(g.code)?(groupCodes.add(g.code),g.code):makeUniqueCode(optionCodeBase(g.name||`grupo-${gi+1}`),groupCodes);const optionCodes=new Set();return{...g,code:groupCode,options:(g.options||[]).map((o,oi)=>{const code=o.code&&!optionCodes.has(o.code)?(optionCodes.add(o.code),o.code):makeUniqueCode(optionCodeBase(o.name||`opcao-${oi+1}`),optionCodes);return{...o,code};})};});
  }
  function readOptionEditor(){
    const previous=state.editingOptionGroups||[];
    const groups=[...document.querySelectorAll('[data-option-editor-group]')].map((node,gi)=>{
      const prev=previous[gi]||{};
      const selection_type=node.querySelector('[data-group-type]').value;
      const required=node.querySelector('[data-group-required]').checked;
      const minRaw=node.querySelector('[data-group-min]').value;
      const maxRaw=node.querySelector('[data-group-max]').value;
      const options=[...node.querySelectorAll('[data-option-editor-row]')].map((row,oi)=>{
        const old=prev.options?.[oi]||{};
        const price_mode=row.querySelector('[data-option-price-mode]').value,is_none_option=row.querySelector('[data-option-none]').checked,qtyChecked=row.querySelector('[data-option-quantity]').checked,maxQtyRaw=row.querySelector('[data-option-max-qty]').value;const allow_quantity=qtyChecked&&!is_none_option&&price_mode==='add';
        return {id:old.id||null,code:old.code||null,name:row.querySelector('[data-option-name]').value.trim(),price_mode,price_value:Math.max(0,Number(row.querySelector('[data-option-price]').value)||0),is_none_option,allow_quantity,max_quantity:allow_quantity&&maxQtyRaw!==''?Math.max(1,Math.floor(Number(maxQtyRaw)||1)):null,sort_order:oi+1,active:true};
      });
      return {id:prev.id||null,code:prev.code||null,name:node.querySelector('[data-group-name]').value.trim(),selection_type,required,min_selections:minRaw===''?(required?1:null):Math.max(0,Number(minRaw)||0),max_selections:maxRaw===''?(selection_type==='single'?1:null):Math.max(0,Number(maxRaw)||0),sort_order:gi+1,active:true,options};
    });
    state.editingOptionGroups=normalizeEditorCodes(groups);
    return state.editingOptionGroups;
  }
  function renderOptionEditor(){
    const root=$('#optionGroupsEditor'),empty=$('#optionGroupsEmpty');if(!root)return;
    const groups=state.editingOptionGroups||[];empty.classList.toggle('hidden',groups.length>0);
    root.innerHTML=groups.map((g,gi)=>`<article class="option-admin-group" data-option-editor-group="${gi}">
      <div class="option-admin-group-head">
        <label class="field-label grow">Nome do grupo <input data-group-name type="text" maxlength="120" value="${escapeHtml(g.name||'')}" placeholder="Ex.: Sabores"></label>
        <label class="field-label compact-field">Tipo <select data-group-type><option value="single" ${g.selection_type==='single'?'selected':''}>Uma escolha</option><option value="multiple" ${g.selection_type==='multiple'?'selected':''}>Múltiplas</option></select></label>
        <button class="delete-mini option-remove-group" type="button" data-remove-option-group="${gi}">Excluir grupo</button>
      </div>
      <div class="option-admin-rules">
        <label class="switch-inline"><input data-group-required type="checkbox" ${g.required?'checked':''}><span>Obrigatório</span></label>
        <label class="field-label mini-field">Mínimo<input data-group-min type="number" min="0" step="1" value="${g.min_selections??''}" placeholder="Auto"></label>
        <label class="field-label mini-field">Máximo<input data-group-max type="number" min="0" step="1" value="${g.max_selections??''}" placeholder="Auto"></label>
      </div>
      <div class="option-admin-options">
        ${(g.options||[]).map((o,oi)=>{const qty=optionQuantityDefault(g,o)&&!o.is_none_option&&(o.price_mode||'add')==='add';return`<div class="option-admin-row" data-option-editor-row="${oi}">
          <label class="field-label option-name-field">Opção <input data-option-name type="text" maxlength="160" value="${escapeHtml(o.name||'')}" placeholder="Ex.: Ovo frito"></label>
          <label class="field-label option-mode-field">Preço <select data-option-price-mode><option value="add" ${o.price_mode!=='set'?'selected':''}>Somar ao preço</option><option value="set" ${o.price_mode==='set'?'selected':''}>Definir preço final</option></select></label>
          <label class="field-label option-price-field">Valor<input data-option-price type="number" min="0" step="0.01" value="${Number(o.price_value||0)}"></label>
          <label class="switch-inline quantity-option"><input data-option-quantity type="checkbox" ${qty?'checked':''} ${o.is_none_option||o.price_mode==='set'?'disabled':''}><span>Quantidade</span></label>
          <label class="field-label option-max-qty-field">Limite<input data-option-max-qty type="number" min="1" step="1" value="${o.max_quantity??''}" placeholder="Ilimitado" ${qty?'':'disabled'}><small>vazio = ilimitado</small></label>
          <label class="switch-inline none-option"><input data-option-none type="checkbox" ${o.is_none_option?'checked':''}><span>“Nenhum”</span></label>
          <button class="delete-mini" type="button" data-remove-option="${gi}:${oi}">×</button>
        </div>`;}).join('')}
        <button class="text-button option-add-row" type="button" data-add-option="${gi}">+ Adicionar opção</button>
      </div>
    </article>`).join('');
    root.querySelectorAll('[data-remove-option-group]').forEach(b=>b.onclick=()=>{readOptionEditor();state.editingOptionGroups.splice(Number(b.dataset.removeOptionGroup),1);renderOptionEditor();});
    root.querySelectorAll('[data-add-option]').forEach(b=>b.onclick=()=>{readOptionEditor();const g=state.editingOptionGroups[Number(b.dataset.addOption)];g.options ||= [];g.options.push({id:null,code:null,name:'',price_mode:'add',price_value:0,is_none_option:false,allow_quantity:groupDefaultsQuantity(g),max_quantity:null,sort_order:g.options.length+1,active:true});renderOptionEditor();});
    root.querySelectorAll('[data-remove-option]').forEach(b=>b.onclick=()=>{readOptionEditor();const [gi,oi]=b.dataset.removeOption.split(':').map(Number);state.editingOptionGroups[gi]?.options.splice(oi,1);renderOptionEditor();});
    root.querySelectorAll('[data-option-quantity]').forEach(input=>input.addEventListener('change',()=>{const row=input.closest('[data-option-editor-row]'),max=row?.querySelector('[data-option-max-qty]');if(max)max.disabled=!input.checked;}));
    root.querySelectorAll('[data-option-price-mode]').forEach(select=>select.addEventListener('change',()=>{const row=select.closest('[data-option-editor-row]'),qty=row?.querySelector('[data-option-quantity]'),max=row?.querySelector('[data-option-max-qty]'),none=row?.querySelector('[data-option-none]');if(select.value==='set'){if(qty){qty.checked=false;qty.disabled=true;}if(max){max.value='';max.disabled=true;}}else if(qty&&!none?.checked){qty.disabled=false;if(max)max.disabled=!qty.checked;}}));
    root.querySelectorAll('[data-option-none]').forEach(input=>input.addEventListener('change',()=>{const row=input.closest('[data-option-editor-row]'),qty=row?.querySelector('[data-option-quantity]'),max=row?.querySelector('[data-option-max-qty]'),mode=row?.querySelector('[data-option-price-mode]');if(input.checked){if(qty){qty.checked=false;qty.disabled=true;}if(max){max.value='';max.disabled=true;}}else if(qty&&mode?.value!=='set'){qty.disabled=false;}}));
  }
  async function saveOptionEditor(productId){
    const groups=readOptionEditor();
    for(const g of groups){if(!g.name)throw new Error('Dê um nome para todos os grupos de opções.');if(!(g.options||[]).length)throw new Error(`Adicione pelo menos uma opção em “${g.name}”.`);if(g.options.some(o=>!o.name))throw new Error(`Preencha o nome de todas as opções em “${g.name}”.`);if(g.max_selections!=null&&g.min_selections!=null&&g.max_selections<g.min_selections)throw new Error(`O máximo de “${g.name}” não pode ser menor que o mínimo.`);}
    const oldGroups=groupsForProduct(productId),oldGroupIds=new Set(oldGroups.map(g=>g.id)),oldOptions=oldGroups.flatMap(g=>optionsForGroup(g.id)),keptGroupIds=new Set(),keptOptionIds=new Set();
    for(const g of groups){
      const saved=await api.saveOptionGroup({id:g.id||null,product_id:productId,code:g.code,name:g.name,selection_type:g.selection_type,required:!!g.required,min_selections:g.min_selections,max_selections:g.max_selections,sort_order:g.sort_order,active:true});
      if(!saved?.id)throw new Error(`Não foi possível salvar o grupo “${g.name}”.`);keptGroupIds.add(saved.id);
      for(const o of g.options){const savedOption=await api.saveOption({id:o.id||null,group_id:saved.id,code:o.code,name:o.name,price_mode:o.price_mode||'add',price_value:Number(o.price_value||0),is_none_option:!!o.is_none_option,allow_quantity:!!o.allow_quantity,max_quantity:o.allow_quantity&&o.max_quantity!=null?Number(o.max_quantity):null,sort_order:o.sort_order,active:true});if(savedOption?.id)keptOptionIds.add(savedOption.id);}
    }
    for(const o of oldOptions)if(!keptOptionIds.has(o.id)&&oldGroupIds.has(o.group_id))await api.deleteOption(o.id);
    for(const g of oldGroups)if(!keptGroupIds.has(g.id))await api.deleteOptionGroup(g.id);
  }

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
    const data=await api.adminGetAll();state.categories=data.categories||[];state.products=data.products||[];state.specials=data.daily_specials||[];state.optionGroups=data.product_option_groups||[];state.productOptions=data.product_options||[];
    state.categories.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));state.products.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.name.localeCompare(b.name,'pt-BR'));
    // Na primeira entrada no painel, todas as categorias iniciam recolhidas.
    // Depois disso, recarregamentos de dados preservam o que o administrador abriu/fechou.
    if(!state.categoriesInitialized){
      state.categories.forEach(c=>state.collapsedCategories.add(c.id));
      state.categoriesInitialized=true;
    }
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
    const searchText=normalize(`${p.name} ${p.size||''} ${p.description||''} ${p.price??''}`);
    return `<article class="admin-product-row" data-product-row data-search-text="${escapeHtml(searchText)}">
      <div class="product-cell">
        <div class="thumb">${p.image_path?`<img src="${escapeHtml(imgUrl(p.image_path))}" alt="">`:'🍽️'}</div>
        <div><div class="row-title">${escapeHtml(p.name)}</div><div class="row-sub">${p.size?`Tamanho ${escapeHtml(p.size)}`:'Sem tamanho'}${p.featured?' · Destaque':''}${optionSummary(p.id)}</div></div>
      </div>
      <div class="admin-product-price">${p.price!=null?money.format(Number(p.price)):'—'}</div>
      <div>${statusPill(p)}</div>
      <button class="edit-row" data-edit="${escapeHtml(p.id)}" type="button">Editar</button>
    </article>`;
  }
  function applyCategorySearch(section,rawQuery){
    if(!section)return;
    const query=normalize(rawQuery||'');
    const rows=[...section.querySelectorAll('[data-product-row]')];
    let visible=0;
    rows.forEach(row=>{
      const show=!query||(row.dataset.searchText||'').includes(query);
      row.classList.toggle('hidden',!show);
      if(show)visible++;
    });
    const count=section.querySelector('[data-category-count]');
    if(count)count.textContent=`${visible} ${visible===1?'item':'itens'}`;
    const empty=section.querySelector('[data-category-empty]');
    if(empty)empty.classList.toggle('hidden',visible>0);
    const clear=section.querySelector('[data-clear-category-search]');
    if(clear)clear.classList.toggle('hidden',!rawQuery);
  }
  function renderProducts(){
    const q=normalize(els.search.value),filter=els.filter.value;
    const filtered=state.products.filter(p=>(!filter||p.category_id===filter)&&(!q||normalize(`${p.name} ${p.size||''} ${p.description||''}`).includes(q)));
    els.empty.classList.toggle('hidden',!!filtered.length);els.groups.classList.toggle('hidden',!filtered.length);
    const html=[];
    for(const c of state.categories){
      const items=filtered.filter(p=>p.category_id===c.id);
      if(!items.length)continue;
      const collapsed=state.collapsedCategories.has(c.id);
      const localQuery=state.categoryQueries[c.id]||'';
      html.push(`<section class="admin-category-card ${collapsed?'is-collapsed':''}" data-category-section="${escapeHtml(c.id)}">
        <header class="admin-category-header admin-category-header-collapsible">
          <button class="admin-category-toggle" data-category-toggle="${escapeHtml(c.id)}" type="button" aria-expanded="${collapsed?'false':'true'}">
            <span class="admin-category-chevron" aria-hidden="true">⌄</span>
            <span class="admin-category-title-wrap"><span class="admin-category-kicker">Categoria</span><strong class="admin-category-name">${escapeHtml(c.name)}</strong>${c.description?`<small>${escapeHtml(c.description)}</small>`:''}</span>
          </button>
          <span class="admin-category-count" data-category-count>${items.length} ${items.length===1?'item':'itens'}</span>
        </header>
        <div class="admin-category-content ${collapsed?'hidden':''}" data-category-content>
          <div class="admin-category-tools">
            <label class="search-box category-search-box">
              <span>⌕</span>
              <input type="search" value="${escapeHtml(localQuery)}" data-category-search="${escapeHtml(c.id)}" placeholder="Pesquisar somente em ${escapeHtml(c.name)}" aria-label="Pesquisar em ${escapeHtml(c.name)}">
              <button class="clear-search ${localQuery?'':'hidden'}" data-clear-category-search="${escapeHtml(c.id)}" type="button" aria-label="Limpar pesquisa da categoria">×</button>
            </label>
          </div>
          <div class="admin-category-products">${items.map(renderProductRow).join('')}</div>
          <div class="category-search-empty hidden" data-category-empty>Nenhum produto encontrado nesta categoria.</div>
        </div>
      </section>`);
    }
    els.groups.innerHTML=html.join('');
    els.groups.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openProduct(b.dataset.edit));
    els.groups.querySelectorAll('[data-category-toggle]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.categoryToggle;
      const section=b.closest('[data-category-section]');
      const content=section?.querySelector('[data-category-content]');
      const nowCollapsed=!state.collapsedCategories.has(id);
      if(nowCollapsed)state.collapsedCategories.add(id);else state.collapsedCategories.delete(id);
      section?.classList.toggle('is-collapsed',nowCollapsed);
      content?.classList.toggle('hidden',nowCollapsed);
      b.setAttribute('aria-expanded',String(!nowCollapsed));
    });
    els.groups.querySelectorAll('[data-category-search]').forEach(input=>{
      const id=input.dataset.categorySearch;
      const section=input.closest('[data-category-section]');
      applyCategorySearch(section,input.value);
      input.addEventListener('input',()=>{
        state.categoryQueries[id]=input.value;
        applyCategorySearch(section,input.value);
      });
    });
    els.groups.querySelectorAll('[data-clear-category-search]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.clearCategorySearch;
      const section=b.closest('[data-category-section]');
      const input=section?.querySelector(`[data-category-search="${CSS.escape(id)}"]`);
      state.categoryQueries[id]='';
      if(input){input.value='';applyCategorySearch(section,'');input.focus();}
    });
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
    state.editingOptionGroups=p?cloneProductOptionModel(p.id):[];
    $('#productDialogTitle').textContent=p?'Editar produto':'Novo produto';$('#productId').value=p?.id||'';$('#productName').value=p?.name||'';$('#productCategory').value=p?.category_id||state.categories[0]?.id||'';
    $('#productSize').value=p?.size||'';$('#productPrice').value=p?.price??'';$('#productOrder').value=p?.sort_order??0;$('#productDescription').value=p?.description||'';
    $('#productAvailable').checked=p?.available??true;$('#productActive').checked=p?.active??true;$('#productFeatured').checked=p?.featured??false;$('#productAllowNotes').checked=p?.allow_notes!==false;$('#productImage').value='';
    const box=$('#imagePreviewBox'),preview=$('#imagePreview'); if(p?.image_path){preview.src=imgUrl(p.image_path);box.classList.remove('hidden');}else{preview.removeAttribute('src');box.classList.add('hidden');}
    renderOptionEditor();$('#deleteProductBtn').classList.toggle('hidden',!p); els.productDialog.showModal();
  }
  function uniqueSlug(name,size,categoryId,excludeId){
    const base=slugify(`${name}${size?`-${size}`:''}`);let s=base,i=2;const used=()=>state.products.some(p=>p.id!==excludeId&&p.category_id===categoryId&&p.slug===s);while(used())s=`${base}-${i++}`;return s;
  }
  async function saveProduct(){
    const id=$('#productId').value||null,name=$('#productName').value.trim(),category_id=$('#productCategory').value,size=$('#productSize').value.trim()||null;
    const priceRaw=$('#productPrice').value;if(!name||!category_id||priceRaw==='')throw new Error('Preencha nome, categoria e preço.');
    readOptionEditor();
    let image_path=state.editing?.image_path||null;if(state.imageRemoved)image_path=null;const file=$('#productImage').files?.[0];if(file){$('#saveProductBtn').textContent='Enviando foto…';image_path=await api.uploadProductImage(file);}
    const row={id,category_id,name,slug:uniqueSlug(name,size,category_id,id),size,description:$('#productDescription').value.trim()||null,price:Number(priceRaw),image_path,allow_notes:$('#productAllowNotes').checked,notes_max_length:state.editing?.notes_max_length??null,active:$('#productActive').checked,available:$('#productAvailable').checked,featured:$('#productFeatured').checked,sort_order:Math.max(0,Number($('#productOrder').value)||0)};
    const saved=await api.saveProduct(row);if(!saved?.id)throw new Error('O produto não retornou um ID após salvar.');$('#saveProductBtn').textContent='Salvando opções…';await saveOptionEditor(saved.id);await reloadData();els.productDialog.close();toast('Produto e opções salvos com sucesso.','success');
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
    $('#expandAllCategories').onclick=()=>{state.collapsedCategories.clear();renderProducts();};
    $('#collapseAllCategories').onclick=()=>{state.categories.forEach(c=>state.collapsedCategories.add(c.id));renderProducts();};
    $('#newProductBtn').onclick=()=>openProduct();
    $('#addOptionGroupBtn').onclick=()=>{readOptionEditor();state.editingOptionGroups.push({id:null,code:null,name:'',selection_type:'single',required:false,min_selections:null,max_selections:1,sort_order:state.editingOptionGroups.length+1,active:true,options:[]});renderOptionEditor();};
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
