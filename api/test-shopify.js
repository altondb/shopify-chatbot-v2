// api/test-shopify.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({ 
        error: 'Missing Shopify credentials',
        missing: {
          domain: !SHOPIFY_DOMAIN,
          token: !SHOPIFY_ACCESS_TOKEN
        }
      });
    }

    console.log('Testing Shopify connection...');
    console.log('Domain:', SHOPIFY_DOMAIN);
    
    // Test with a simple shop info request
    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2023-10/shop.json`, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify API Error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Shopify API Error',
        status: response.status,
        message: errorText
      });
    }

    const shopData = await response.json();
    
    // Test products endpoint too
    const productsResponse = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2023-10/products.json?limit=5`, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    const productsData = await productsResponse.json();

    res.status(200).json({
      success: true,
      shop: {
        name: shopData.shop.name,
        domain: shopData.shop.domain,
        email: shopData.shop.email
      },
      products: {
        count: productsData.products?.length || 0,
        sample: productsData.products?.slice(0, 2).map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle
        })) || []
      }
    });

  } catch (error) {
    console.error('Connection test error:', error);
    res.status(500).json({ 
      error: 'Connection failed',
      message: error.message 
    });
  }
}
