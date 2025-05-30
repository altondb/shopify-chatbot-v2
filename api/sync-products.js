// lib/shopifySync.js
import { kv } from '@vercel/kv'; // or your preferred database

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN; // your-store.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PRODUCTS_CACHE_KEY = 'shopify_products';
const CACHE_DURATION = 24 * 60 * 60; // 24 hours

export async function syncShopifyProducts() {
  try {
    console.log('Starting Shopify product sync...');
    
    let allProducts = [];
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const query = `
        query getProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            edges {
              node {
                id
                title
                handle
                description
                productType
                vendor
                tags
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      price
                      availableForSale
                      selectedOptions {
                        name
                        value
                      }
                    }
                  }
                }
                images(first: 3) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
                metafields(first: 10) {
                  edges {
                    node {
                      namespace
                      key
                      value
                      type
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

      const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2023-10/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({
          query,
          variables: {
            first: 50,
            after: cursor
          }
        })
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(`Shopify API error: ${JSON.stringify(data.errors)}`);
      }

      const products = data.data.products.edges.map(edge => transformProduct(edge.node));
      allProducts.push(...products);

      hasNextPage = data.data.products.pageInfo.hasNextPage;
      cursor = data.data.products.edges[data.data.products.edges.length - 1]?.cursor;
    }

    // Cache products
    await kv.set(PRODUCTS_CACHE_KEY, allProducts, { ex: CACHE_DURATION });
    
    console.log(`Synced ${allProducts.length} products from Shopify`);
    return allProducts;

  } catch (error) {
    console.error('Shopify sync error:', error);
    throw error;
  }
}

function transformProduct(shopifyProduct) {
  const mainVariant = shopifyProduct.variants.edges[0]?.node;
  const mainImage = shopifyProduct.images.edges[0]?.node;
  
  // Extract scent notes from metafields or tags
  const scentNotes = extractScentNotes(shopifyProduct);
  
  return {
    id: shopifyProduct.id,
    title: shopifyProduct.title,
    handle: shopifyProduct.handle,
    description: shopifyProduct.description,
    product_type: shopifyProduct.productType,
    vendor: shopifyProduct.vendor,
    tags: shopifyProduct.tags,
    price: mainVariant?.price,
    available: mainVariant?.availableForSale,
    image_url: mainImage?.url,
    image_alt: mainImage?.altText,
    url: `https://${SHOPIFY_DOMAIN.replace('.myshopify.com', '.com')}/products/${shopifyProduct.handle}`,
    variants: shopifyProduct.variants.edges.map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      price: edge.node.price,
      available: edge.node.availableForSale,
      options: edge.node.selectedOptions
    })),
    scent_notes: scentNotes,
    searchable_text: createSearchableText(shopifyProduct, scentNotes)
  };
}

function extractScentNotes(product) {
  // Look for scent notes in metafields
  const scentMetafield = product.metafields.edges.find(edge => 
    edge.node.namespace === 'custom' && edge.node.key === 'scent_notes'
  );
  
  if (scentMetafield) {
    return scentMetafield.node.value.split(',').map(note => note.trim());
  }
  
  // Fallback: extract from tags
  const scentTags = product.tags.filter(tag => 
    tag.toLowerCase().includes('note') || 
    tag.toLowerCase().includes('scent') ||
    ['citrus', 'floral', 'woody', 'fresh', 'spicy', 'sweet'].some(family => 
      tag.toLowerCase().includes(family)
    )
  );
  
  return scentTags;
}

function createSearchableText(product, scentNotes) {
  return [
    product.title,
    product.description,
    product.productType,
    product.vendor,
    ...product.tags,
    ...scentNotes
  ].join(' ').toLowerCase();
}

export async function getCachedProducts() {
  try {
    const cached = await kv.get(PRODUCTS_CACHE_KEY);
    
    if (!cached) {
      console.log('No cached products found, syncing...');
      return await syncShopifyProducts();
    }
    
    return cached;
  } catch (error) {
    console.error('Error getting cached products:', error);
    // Fallback to fresh sync
    return await syncShopifyProducts();
  }
}

// API endpoint for manual sync
// api/sync-products.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Add authentication check here
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.SYNC_SECRET}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const products = await syncShopifyProducts();
    res.status(200).json({ 
      message: 'Products synced successfully', 
      count: products.length 
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Sync failed', 
      error: error.message 
    });
  }
}
