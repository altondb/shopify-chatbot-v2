
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Simple in-memory cache for now
let productsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function getCachedProducts() {
  try {
    // Check if cache is still valid
    if (productsCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
      console.log(`Using cached products: ${productsCache.length} items`);
      return productsCache;
    }

    console.log('Cache expired or empty, fetching from Shopify...');
    const products = await syncShopifyProducts();
    
    // Update cache
    productsCache = products;
    cacheTimestamp = Date.now();
    
    return products;
  } catch (error) {
    console.error('Error getting cached products:', error);
    return [];
  }
}

export async function syncShopifyProducts() {
  try {
    console.log('Starting Shopify product sync...');
    
    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2023-10/products.json?limit=250`, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.products) {
      throw new Error('No products found in Shopify response');
    }

    const transformedProducts = data.products.map(product => transformProduct(product));
    
    console.log(`Synced ${transformedProducts.length} products from Shopify`);
    return transformedProducts;

  } catch (error) {
    console.error('Shopify sync error:', error);
    throw error;
  }
}

function transformProduct(shopifyProduct) {
  const mainVariant = shopifyProduct.variants?.[0];
  const mainImage = shopifyProduct.images?.[0];
  
  // Extract scent notes from tags
  const scentNotes = extractScentNotes(shopifyProduct);
  
  return {
    id: shopifyProduct.id.toString(),
    title: shopifyProduct.title,
    handle: shopifyProduct.handle,
    description: shopifyProduct.body_html?.replace(/<[^>]*>/g, '') || '', // Remove HTML tags
    product_type: shopifyProduct.product_type,
    vendor: shopifyProduct.vendor,
    tags: shopifyProduct.tags ? shopifyProduct.tags.split(', ') : [],
    price: mainVariant?.price,
    available: mainVariant?.available || false,
    image_url: mainImage?.src,
    image_alt: mainImage?.alt,
    url: `https://${SHOPIFY_DOMAIN.replace('.myshopify.com', '.com')}/products/${shopifyProduct.handle}`,
    scent_notes: scentNotes,
    searchable_text: createSearchableText(shopifyProduct, scentNotes)
  };
}

function extractScentNotes(product) {
  if (!product.tags) return [];
  
  const tags = product.tags.split(', ');
  
  // Look for scent-related tags
  const scentTags = tags.filter(tag => {
    const tagLower = tag.toLowerCase();
    return ['citrus', 'floral', 'woody', 'fresh', 'spicy', 'sweet', 'vanilla', 'bergamot', 'rose', 'sandalwood', 'musk', 'amber'].some(scent => 
      tagLower.includes(scent)
    );
  });
  
  return scentTags;
}

function createSearchableText(product, scentNotes) {
  const description = product.body_html?.replace(/<[^>]*>/g, '') || '';
  
  return [
    product.title,
    description,
    product.product_type,
    product.vendor,
    ...(product.tags ? product.tags.split(', ') : []),
    ...scentNotes
  ].join(' ').toLowerCase();
}
