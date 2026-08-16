(() => {
  const C = window.APP_CONFIG;

  class SupabaseRest {
    constructor() {
      this.sessionKey = 'cantinho_petisco_admin_session';
    }

    baseHeaders(token, extra = {}) {
      const headers = {
        apikey: C.SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        ...extra,
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      return headers;
    }

    async request(path, options = {}) {
      const response = await fetch(`${C.SUPABASE_URL}${path}`, options);
      if (!response.ok) {
        let detail = '';
        try {
          const body = await response.json();
          detail = body.message || body.msg || body.error_description || body.error || JSON.stringify(body);
        } catch {
          detail = await response.text();
        }
        throw new Error(detail || `Erro ${response.status}`);
      }
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    async getPublicMenu() {
      if (C.DEMO_MODE) {
        const m = window.MOCK_MENU;
        return {
          categories: structuredClone(m.categories.filter(c => c.active)),
          products: structuredClone(m.products.filter(p => p.active)),
          daily_specials: structuredClone(m.daily_specials.filter(s => s.active)),
        };
      }
      const h = { headers: this.baseHeaders() };
      const [categories, products, daily_specials] = await Promise.all([
        this.request('/rest/v1/categories?select=id,name,slug,description,sort_order,active&active=eq.true&order=sort_order.asc', h),
        this.request('/rest/v1/products?select=id,category_id,name,slug,size,description,price,image_path,active,available,featured,sort_order&active=eq.true&order=sort_order.asc', h),
        this.request('/rest/v1/daily_specials?select=id,special_date,product_id,special_price,note,active&active=eq.true&order=special_date.desc&limit=30', h),
      ]);
      return { categories, products, daily_specials };
    }

    async login(email, password) {
      if (C.DEMO_MODE) {
        if (email !== 'admin@demo.local' || password !== '123456') {
          throw new Error('No modo demonstração use admin@demo.local / 123456.');
        }
        const fake = { access_token: 'demo-token', refresh_token: 'demo-refresh', expires_at: Date.now() + 3600000, user: { email, id: 'demo-admin' } };
        sessionStorage.setItem(this.sessionKey, JSON.stringify(fake));
        return fake;
      }
      const data = await this.request('/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: this.baseHeaders(),
        body: JSON.stringify({ email, password }),
      });
      const session = {
        ...data,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      };
      sessionStorage.setItem(this.sessionKey, JSON.stringify(session));
      return session;
    }

    getSession() {
      try { return JSON.parse(sessionStorage.getItem(this.sessionKey)) || null; }
      catch { return null; }
    }

    async ensureSession() {
      let session = this.getSession();
      if (!session) return null;
      if (C.DEMO_MODE) return session;
      if ((session.expires_at || 0) - Date.now() > 60000) return session;
      if (!session.refresh_token) return null;
      try {
        const data = await this.request('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          headers: this.baseHeaders(),
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        session = { ...data, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
        sessionStorage.setItem(this.sessionKey, JSON.stringify(session));
        return session;
      } catch {
        this.logout();
        return null;
      }
    }

    logout() {
      sessionStorage.removeItem(this.sessionKey);
    }

    async isAdmin() {
      const s = await this.ensureSession();
      if (!s) return false;
      if (C.DEMO_MODE) return true;
      const out = await this.request('/rest/v1/rpc/is_admin', {
        method: 'POST',
        headers: this.baseHeaders(s.access_token),
        body: '{}',
      });
      return out === true;
    }

    async adminGetAll() {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada. Entre novamente.');
      if (C.DEMO_MODE) {
        return {
          categories: structuredClone(window.MOCK_MENU.categories),
          products: structuredClone(window.MOCK_MENU.products),
          daily_specials: structuredClone(window.MOCK_MENU.daily_specials),
        };
      }
      const h = { headers: this.baseHeaders(s.access_token) };
      const [categories, products, daily_specials] = await Promise.all([
        this.request('/rest/v1/categories?select=*&order=sort_order.asc', h),
        this.request('/rest/v1/products?select=*&order=sort_order.asc', h),
        this.request('/rest/v1/daily_specials?select=*&order=special_date.desc', h),
      ]);
      return { categories, products, daily_specials };
    }

    async saveProduct(product) {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) {
        const row = { ...product, id: product.id || `demo-${Date.now()}` };
        const i = window.MOCK_MENU.products.findIndex(p => p.id === row.id);
        if (i >= 0) window.MOCK_MENU.products[i] = structuredClone(row); else window.MOCK_MENU.products.push(structuredClone(row));
        return row;
      }
      const { id, ...body } = product;
      if (id) {
        const rows = await this.request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: this.baseHeaders(s.access_token, { Prefer: 'return=representation' }),
          body: JSON.stringify(body),
        });
        return rows?.[0] || null;
      }
      const rows = await this.request('/rest/v1/products', {
        method: 'POST',
        headers: this.baseHeaders(s.access_token, { Prefer: 'return=representation' }),
        body: JSON.stringify(body),
      });
      return rows?.[0] || null;
    }

    async deleteProduct(id) {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) { window.MOCK_MENU.products = window.MOCK_MENU.products.filter(p => p.id !== id); return true; }
      await this.request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: this.baseHeaders(s.access_token)
      });
      return true;
    }

    async saveSpecial(special) {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) {
        const row = { ...special, id: special.id || `special-${Date.now()}` };
        const i = window.MOCK_MENU.daily_specials.findIndex(x => x.id === row.id || x.special_date === row.special_date);
        if (i >= 0) window.MOCK_MENU.daily_specials[i] = structuredClone(row); else window.MOCK_MENU.daily_specials.push(structuredClone(row));
        return row;
      }
      const { id, ...body } = special;
      if (id) {
        const rows = await this.request(`/rest/v1/daily_specials?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: this.baseHeaders(s.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body)
        });
        return rows?.[0] || null;
      }
      const rows = await this.request('/rest/v1/daily_specials?on_conflict=special_date', {
        method: 'POST', headers: this.baseHeaders(s.access_token, { Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify(body)
      });
      return rows?.[0] || null;
    }

    async deleteSpecial(id) {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) { window.MOCK_MENU.daily_specials = window.MOCK_MENU.daily_specials.filter(x => x.id !== id); return true; }
      await this.request(`/rest/v1/daily_specials?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: this.baseHeaders(s.access_token)
      });
      return true;
    }

    async uploadProductImage(file) {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada.');
      if (!file) throw new Error('Selecione uma imagem.');
      if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('Use imagem JPG, PNG ou WEBP.');
      if (C.DEMO_MODE) return null;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `products/${crypto.randomUUID()}.${ext}`;
      const response = await fetch(`${C.SUPABASE_URL}/storage/v1/object/${C.STORAGE_BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          apikey: C.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${s.access_token}`,
          'Content-Type': file.type,
          'x-upsert': 'false',
        },
        body: file,
      });
      if (!response.ok) {
        let msg = 'Falha ao enviar imagem.';
        try { msg = (await response.json()).message || msg; } catch {}
        throw new Error(msg);
      }
      return path;
    }

    publicImageUrl(path) {
      if (!path) return '';
      if (/^https?:\/\//i.test(path)) return path;
      return `${C.SUPABASE_URL}/storage/v1/object/public/${C.STORAGE_BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`;
    }
  }

  window.supabaseRest = new SupabaseRest();
})();
