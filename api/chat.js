
import { OpenAI } from 'openai';
import { getProductRecommendations } from '../lib/productMatcher.js';
import { getCachedProducts } from '../lib/shopifySync.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Missing message field' });
    }

    console.log('📩 Incoming message:', message);

    const products = await getCachedProducts();
    console.log(`📦 Loaded ${products.length} products`);

    const systemPrompt = createSystemPrompt(products);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

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
              query: { type: 'string', description: 'Search query to match products' },
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

    if (response.message.function_call?.arguments) {
      try {
        const { query, preferences = [], max_results = 3 } = JSON.parse(response.message.function_call.arguments);
        console.log('🧠 GPT wants to recommend with:', { query, preferences });

        recommendations = await getProductRecommendations(
          products,
          query,
          preferences,
          max_results
        );
      } catch (parseError) {
        console.error('❌ Failed to parse function_call arguments:', parseError);
      }
    } else {
      console.warn('⚠️ GPT response missing function_call.arguments:', response.message);
    }

    res.status(200).json({
      message: response.message.content || 'Here are some products I recommend:',
      products: recommendations,
      conversationId: req.body.conversationId || generateId()
    });

  } catch (error) {
    console.error('🔥 Chat API error:', error);
    res.status(500).json({ message: 'Internal Server Error – see logs' });
  }
}

function createSystemPrompt(products) {
  return `You are a helpful product recommendation assistant for a fragrance/cosmetics store. 

Your role:
- Help users find products based on their preferences
- Ask clarifying questions when needed
- Use the recommend_products function when you have enough information
- Be conversational and friendly

Available product categories: 

Key guidelines:
- Always use the function to make specific recommendations
- Keep responses concise but helpful
- Focus on scent profiles, ingredients, and use cases
- Ask about preferences like: scent families, occasions, skin type, etc.`;
}
}

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
