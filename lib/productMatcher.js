// lib/productMatcher.js
export async function getProductRecommendations(products, query, preferences = [], maxResults = 3) {
  try {
    // Score products based on relevance
    const scoredProducts = products.map(product => ({
      ...product,
      score: calculateRelevanceScore(product, query, preferences)
    }));

    // Filter and sort by score
    const filtered = scoredProducts
      .filter(product => product.score > 0 && product.available)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return filtered.map(product => formatProductResponse(product));
  } catch (error) {
    console.error('Product matching error:', error);
    return [];
  }
}

function calculateRelevanceScore(product, query, preferences) {
  let score = 0;
  const queryLower = query.toLowerCase();
  const searchText = product.searchable_text;

  // Direct title/description matches (highest weight)
  if (product.title.toLowerCase().includes(queryLower)) {
    score += 100;
  }

  // Description matches
  if (product.description && product.description.toLowerCase().includes(queryLower)) {
    score += 50;
  }

  // Product type matches
  if (product.product_type && product.product_type.toLowerCase().includes(queryLower)) {
    score += 75;
  }

  // Tag matches
  const matchingTags = product.tags.filter(tag => 
    tag.toLowerCase().includes(queryLower) || 
    queryLower.includes(tag.toLowerCase())
  );
  score += matchingTags.length * 30;

  // Scent note matches (for fragrance products)
  if (product.scent_notes && product.scent_notes.length > 0) {
    const scentMatches = product.scent_notes.filter(note =>
      note.toLowerCase().includes(queryLower) ||
      queryLower.includes(note.toLowerCase())
    );
    score += scentMatches.length * 40;
  }

  // Preference matching
  preferences.forEach(preference => {
    const prefLower = preference.toLowerCase();
    
    if (searchText.includes(prefLower)) {
      score += 35;
    }
    
    // Special handling for scent families
    if (product.scent_notes) {
      const scentFamilyMatch = product.scent_notes.some(note =>
        note.toLowerCase().includes(prefLower) ||
        prefLower.includes(note.toLowerCase())
      );
      if (scentFamilyMatch) {
        score += 45;
      }
    }
  });

  // Fuzzy matching for common terms
  score += fuzzyMatch(searchText, queryLower);

  // Boost popular/featured products (if you have this data)
  if (product.tags.includes('featured') || product.tags.includes('bestseller')) {
    score += 20;
  }

  return score;
}

function fuzzyMatch(text, query) {
  let score = 0;
  const words = query.split(' ').filter(word => word.length > 2);
  
  words.forEach(word => {
    if (text.includes(word)) {
      score += 15;
    }
    
    // Partial matches for longer words
    if (word.length > 4) {
      const partial = word.substring(0, word.length - 1);
      if (text.includes(partial)) {
        score += 8;
      }
    }
  });
  
  return score;
}

function formatProductResponse(product) {
  return {
    id: product.id,
    title: product.title,
    description: truncateDescription(product.description),
    price: formatPrice(product.price),
    image_url: product.image_url,
    url: product.url,
    vendor: product.vendor,
    scent_notes: product.scent_notes?.slice(0, 3), // Top 3 notes
    product_type: product.product_type,
    relevance_score: Math.round(product.score) // For debugging
  };
}

function truncateDescription(description, maxLength = 150) {
  if (!description) return '';
  
  if (description.length <= maxLength) {
    return description;
  }
  
  return description.substring(0, maxLength).trim() + '...';
}

function formatPrice(price) {
  if (!price) return null;
  
  const numPrice = parseFloat(price);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(numPrice);
}

// Enhanced search for complex queries
export async function searchProductsAdvanced(products, searchParams) {
  const {
    categories = [],
    priceRange = null,
    scentFamilies = [],
    availability = true,
    sortBy = 'relevance'
  } = searchParams;

  let filtered = products.filter(product => {
    // Availability filter
    if (availability && !product.available) return false;
    
    // Category filter
    if (categories.length > 0) {
      const hasCategory = categories.some(cat =>
        product.product_type?.toLowerCase().includes(cat.toLowerCase())
      );
      if (!hasCategory) return false;
    }
    
    // Price range filter
    if (priceRange && product.price) {
      const price = parseFloat(product.price);
      if (price < priceRange.min || price > priceRange.max) return false;
    }
    
    // Scent family filter
    if (scentFamilies.length > 0 && product.scent_notes) {
      const hasScent = scentFamilies.some(family =>
        product.scent_notes.some(note =>
          note.toLowerCase().includes(family.toLowerCase())
        )
      );
      if (!hasScent) return false;
    }
    
    return true;
  });

  // Sorting
  switch (sortBy) {
    case 'price_low':
      filtered.sort((a, b) => parseFloat(a.price || 0) - parseFloat(b.price || 0));
      break;
    case 'price_high':
      filtered.sort((a, b) => parseFloat(b.price || 0) - parseFloat(a.price || 0));
      break;
    case 'name':
      filtered.sort((a, b) => a.title.localeCompare(b.title));
      break;
    default: // relevance - already handled by scoring
      break;
  }

  return filtered.map(formatProductResponse);
}
