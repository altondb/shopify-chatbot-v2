// api/chat.js - Main chat endpoint
import { OpenAI } from 'openai';
import { getProductRecommendations } from '../lib/productMatcher';
import { getCachedProducts } from '../lib/shopifySync';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { message, conversationHistory = [] } = req.body;

    // Get product catalog
    const products = await getCachedProducts();

    // Create system prompt with product context
    const systemPrompt = createSystemPrompt(products);

    // Build conversation
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages,
      max_tokens: 500,
      temperature: 0.7,
      functions: [
        {
          name: 'recommend_products',
          description: 'Recommend specific products based on user preferences',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query to match products'
              },
              preferences: {
                type: 'array',
                items: { type: 'string' },
                description: 'User preferences like scent notes, product types'
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of products to recommend',
                default: 3
              }
            },
            required: ['query']
          }
        }
      ],
      function_call: 'auto'
    });

    const response = completion.choices[0];
    let recommendations = [];

    // Handle function calls
    if (response.message.function_call) {
      const { query, preferences = [], max_results = 3 } = 
        JSON.parse(response.message.function_call.arguments);
      
      recommendations = await getProductRecommendations(
        products, 
        query, 
        preferences, 
        max_results
      );
    }

    res.status(200).json({
      message: response.message.content || 'Here are my recommendations:',
      products: recommendations,
      conversationId: req.body.conversationId || generateId()
    });

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ 
      message: 'Sorry, I encountered an error. Please try again.' 
    });
  }
}

function createSystemPrompt(products) {
  return `You are a helpful product recommendation assistant for a fragrance/cosmetics store. 

Your role:
- Help users find products based on their preferences
- Ask clarifying questions when needed
- Use the recommend_products function when you have enough information
- Be conversational and friendly

Available product categories: ${getUniqueCategories(products).join(', ')}

Key guidelines:
- Always use the function to make specific recommendations
- Keep responses concise but helpful
- Focus on scent profiles, ingredients, and use cases
- Ask about preferences like: scent families, occasions, skin type, etc.`;
}

function getUniqueCategories(products) {
  return [...new Set(products.map(p => p.product_type).filter(Boolean))];
}

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
