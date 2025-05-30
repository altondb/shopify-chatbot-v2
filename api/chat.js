import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // Add CORS headers for Shopify
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Missing message field' });
    }

    const messages = [
      {
        role: 'system',
        content: `You are a friendly and helpful fragrance expert for a perfume store.
You give recommendations and opinions about perfumes based on user preferences.

You can talk about scent families (e.g., woody, citrus, gourmand), seasonal scents, layering tips, popular brands, and what a perfume is good for (e.g., date night, work, gym).

Ask clarifying questions if the user doesn't provide enough detail. Be engaging and fun.`,
      },
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages,
      max_tokens: 500,
      temperature: 0.8,
    });

    const response = completion.choices[0]?.message?.content ?? "Sorry, I couldn't think of a scent right now.";

    res.status(200).json({
      message: response,
      conversationId: req.body.conversationId || generateId(),
    });
  } catch (error) {
    console.error('🔥 Chatbot error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
