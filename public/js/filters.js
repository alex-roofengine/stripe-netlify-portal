// /public/js/filters.js

// Identify the client_type from product or price metadata
export function getClientType(item) {
  const priceMeta = item?.metadata || {};
  const productMeta = item?.product?.metadata || {};
  return priceMeta.client_type ?? productMeta.client_type ?? null;
}

// True only when explicitly outbound
export function isOutbound(item) {
  return getClientType(item) === 'outbound';
}

// True when inbound OR missing type — excludes outbound
export function isInbound(item) {
  const ct = getClientType(item);
  return !ct || ct === 'inbound';
}

// Universal filter helper: removes items not matching the current page
export function filterForPage(items, pageFilterName) {
  if (!Array.isArray(items)) return [];
  if (pageFilterName === 'outbound') return items.filter(isOutbound);
  if (pageFilterName === 'inbound') return items.filter(isInbound);
  return items;
}
