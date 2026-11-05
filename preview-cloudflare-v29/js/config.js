window.APP_CONFIG = Object.freeze({
  RESTAURANT_NAME: 'Cantinho do Petisco',
  WHATSAPP_NUMBER: '5511947406124',
  SUPABASE_URL: 'https://cantinho-petisco-v29-api.luizemsaopaulo.workers.dev',
  SUPABASE_PUBLISHABLE_KEY: 'cf-v29',
  STORAGE_BUCKET: 'product-images',
  DEMO_MODE: false,
  DEV_ISOLATED: false,
  PREVIEW_MODE: true,
  CURRENCY: 'BRL',
  LOCALE: 'pt-BR',
  TIME_ZONE: 'America/Sao_Paulo',
  DELIVERY_HIDDEN_CATEGORY_SLUGS: Object.freeze(['pratos-executivos', 'cervejas', 'bebidas-alcoolicas']),

  // V24 — chave ORS oculta na Edge Function; regras de taxa/distância vêm do Supabase.
  DELIVERY_API_URL: 'https://ubhxzrfhokzkdndjlrwt.supabase.co',
  DELIVERY_PUBLISHABLE_KEY: 'sb_publishable_r35TmLO8isOzUJz9lwXpFA_eQ9AnHzu',
  DELIVERY_FUNCTION_NAME: 'calc-delivery'
});
