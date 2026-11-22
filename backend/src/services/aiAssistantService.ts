import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env';
import { searchService } from './searchService';
import type { Product } from '../types/domain';
import { formatInr, parseNaturalSearchQuery } from '../utils/pricing';

export interface AssistantRecommendation {
  id: string;
  name: string;
  brand: string;
  priceInr: number;
  mrpInr: number;
  ratingAvg: number;
  availableQuantity: number;
  stockStatus: string;
  reason: string;
  productUrl: string;
  imageUrl: string;
}

export interface AssistantReply {
  assistantName: 'ShelfSync AI Assistant';
  replyText: string;
  followUpQuestion?: string;
  recommendations: AssistantRecommendation[];
  poweredBy: 'gemini-4-hydrogen' | 'structured-fallback';
  searchEngine: string;
  policyNote: string;
}

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!env.geminiApiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: env.geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

interface ParsedDiscoveryIntent {
  searchQuery: string;
  categorySlug?: string;
  maxPriceInr?: number;
  minPriceInr?: number;
  brand?: string;
  intentType: 'search' | 'compare' | 'price_check' | 'out_of_scope_checkout' | 'needs_clarification';
  followUpQuestion?: string;
}

function heuristicParseMessage(message: string): ParsedDiscoveryIntent {
  const lower = message.toLowerCase();

  if (/(place\s+order|buy\s+now|checkout|pay\s+now|add\s+to\s+cart|send\s+upi|card\s+number)/i.test(lower)) {
    return {
      searchQuery: message,
      intentType: 'out_of_scope_checkout',
    };
  }

  const parsedBudget = parseNaturalSearchQuery(message);
  let categorySlug: string | undefined;
  let query = parsedBudget.cleanedQuery;

  if (/laptop|ultrabook|student|coding|headphones|earbuds|earphones|smartwatch|camera|phone/i.test(lower)) {
    categorySlug = 'electronics';
  } else if (/running\s+shoes|trainers|fitness|marathon|sports/i.test(lower)) {
    categorySlug = 'sports-fitness';
  } else if (/shirt|linen|tee|kurta|fashion|sneakers/i.test(lower)) {
    categorySlug = 'fashion';
  } else if (/kettle|cooker|flask|kitchen|coffee\s+dripper/i.test(lower)) {
    categorySlug = 'home-kitchen';
  } else if (/coffee|honey|tea|grocery/i.test(lower)) {
    categorySlug = 'grocery';
  } else if (/serum|moisturizer|grooming|skincare|vitamin\s+c/i.test(lower)) {
    categorySlug = 'beauty-personal-care';
  }

  if (/gift.*father|father.*gift|dad/i.test(lower)) {
    query = 'grooming watch coffee linen shirt';
    categorySlug = undefined;
  } else if (/student.*laptop|laptop.*student/i.test(lower)) {
    query = 'laptop ultrabook';
    categorySlug = 'electronics';
  } else if (/compare/i.test(lower)) {
    return { searchQuery: query, categorySlug, intentType: 'compare' };
  }

  if (lower.trim().length < 3 || /^(hi|hello|hey|help)$/i.test(lower.trim())) {
    return {
      searchQuery: '',
      intentType: 'needs_clarification',
      followUpQuestion:
        'Hello! I am ShelfSync AI Assistant. What product are you looking for today, and do you have a budget in ₹ INR?',
    };
  }

  return {
    searchQuery: query,
    categorySlug,
    maxPriceInr: parsedBudget.maxPrice,
    minPriceInr: parsedBudget.minPrice,
    intentType: 'search',
  };
}

export const aiAssistantService = {
  async handleDiscoveryQuery(message: string): Promise<AssistantReply> {
    const baseUrl = env.frontendUrl.replace(/\/$/, '');
    const ai = getAiClient();
    let intent: ParsedDiscoveryIntent = heuristicParseMessage(message);
    let usedGemini = false;

    if (ai) {
      try {
        const parseResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Customer WhatsApp message: "${message}"`,
          config: {
            systemInstruction:
              'You are ShelfSync AI Assistant, strictly limited to product discovery, search, recommendations, comparisons, price enquiries, and availability enquiries on an Indian e-commerce store. Extract structured search intent. Available category slugs: electronics, fashion, home-kitchen, grocery, beauty-personal-care, sports-fitness. If the customer asks to checkout, add to cart, or pay on WhatsApp, set intentType to out_of_scope_checkout.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                searchQuery: { type: Type.STRING },
                categorySlug: { type: Type.STRING },
                maxPriceInr: { type: Type.NUMBER },
                minPriceInr: { type: Type.NUMBER },
                brand: { type: Type.STRING },
                intentType: { type: Type.STRING },
                followUpQuestion: { type: Type.STRING },
              },
              required: ['searchQuery', 'intentType'],
            },
          },
        });

        const rawJson = (parseResp.text || '').trim();
        if (rawJson) {
          const parsed = JSON.parse(rawJson) as ParsedDiscoveryIntent;
          intent = parsed;
          usedGemini = true;
        }
      } catch (err) {
        console.warn('[ShelfSync AI Assistant] Gemini parse fallback:', err instanceof Error ? err.message : err);
      }
    }

    if (intent.intentType === 'out_of_scope_checkout') {
      return {
        assistantName: 'ShelfSync AI Assistant',
        replyText:
          'I only help with product discovery, comparisons, pricing, and stock checks here on WhatsApp. To add items to your cart, checkout, and pay securely via Razorpay or COD, please open the ShelfSync website.',
        recommendations: [],
        poweredBy: usedGemini ? 'gemini-4-hydrogen' : 'structured-fallback',
        searchEngine: 'none',
        policyNote: 'WhatsApp Assistant never processes cart, checkout, or payments.',
      };
    }

    if (intent.intentType === 'needs_clarification' && !intent.searchQuery) {
      return {
        assistantName: 'ShelfSync AI Assistant',
        replyText:
          intent.followUpQuestion ||
          'Tell me what product you need and your budget (for example: "wireless earphones under ₹1,000" or "running shoes").',
        followUpQuestion: intent.followUpQuestion,
        recommendations: [],
        poweredBy: usedGemini ? 'gemini-4-hydrogen' : 'structured-fallback',
        searchEngine: 'none',
        policyNote: 'Discovery & availability assistant only.',
      };
    }

    // Query Aiven OpenSearch + authoritative PostgreSQL stock & pricing
    let searchRes = await searchService.searchProducts({
      q: intent.searchQuery,
      category: intent.categorySlug || undefined,
      maxPrice: intent.maxPriceInr,
      minPrice: intent.minPriceInr,
      brand: intent.brand || undefined,
      limit: 5,
    });

    // Broaden if category constraint made results empty
    if (searchRes.products.length === 0 && intent.categorySlug) {
      searchRes = await searchService.searchProducts({
        q: intent.searchQuery,
        maxPrice: intent.maxPriceInr,
        limit: 5,
      });
    }

    const topProducts: Product[] = searchRes.products.slice(0, 5);

    if (topProducts.length === 0) {
      const followUp = `I could not find an exact match${intent.maxPriceInr ? ` under ${formatInr(intent.maxPriceInr)}` : ''}. Would you like me to broaden the budget or show top-rated items in Electronics or Fashion?`;
      return {
        assistantName: 'ShelfSync AI Assistant',
        replyText: followUp,
        followUpQuestion: followUp,
        recommendations: [],
        poweredBy: usedGemini ? 'gemini-4-hydrogen' : 'structured-fallback',
        searchEngine: searchRes.engine,
        policyNote: 'Discovery & availability assistant only.',
      };
    }

    const recommendations: AssistantRecommendation[] = topProducts.map((p) => {
      const stockStatus =
        p.availableQuantity <= 0
          ? 'Out of Stock'
          : p.availableQuantity <= p.lowStockThreshold
            ? `Low Stock (${p.availableQuantity} left)`
            : `In Stock (${p.availableQuantity} available)`;

      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        priceInr: p.priceInr,
        mrpInr: p.mrpInr,
        ratingAvg: p.ratingAvg,
        availableQuantity: p.availableQuantity,
        stockStatus,
        reason: p.shortDescription,
        productUrl: `${baseUrl}/product/${p.slug}`,
        imageUrl: p.images[0]?.imageUrl || '',
      };
    });

    // Optional natural summary via Gemini grounded strictly on PostgreSQL results
    let replyText = '';
    if (ai) {
      try {
        const groundedSummary = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Customer asked: "${message}"\n\nAuthoritative ShelfSync catalogue matches:\n${recommendations
            .map(
              (r, i) =>
                `${i + 1}. ${r.name} | Price: ${formatInr(r.priceInr)} | Rating: ${r.ratingAvg}/5 | ${r.stockStatus} | Info: ${r.reason} | Link: ${r.productUrl}`
            )
            .join('\n')}`,
          config: {
            systemInstruction:
              'You are ShelfSync AI Assistant on WhatsApp. Format a concise, friendly WhatsApp response recommending ONLY the provided products with their exact prices in ₹, rating, stock status, short explanation, and direct website URL. Remind the customer to visit the ShelfSync website link to add to cart and checkout. Keep under 160 words.',
          },
        });
        replyText = (groundedSummary.text || '').trim();
        usedGemini = true;
      } catch {
        replyText = '';
      }
    }

    if (!replyText) {
      const header =
        intent.intentType === 'compare'
          ? 'Here is a side-by-side comparison from ShelfSync:'
          : `Here are the top ${recommendations.length} ShelfSync recommendations for you:`;

      const lines = recommendations.map(
        (r, i) =>
          `${i + 1}. *${r.name}*\n   Price: ${formatInr(r.priceInr)} · Rating: ${r.ratingAvg}/5 · ${r.stockStatus}\n   ${r.reason}\n   View & Buy on Website: ${r.productUrl}`
      );
      replyText = `${header}\n\n${lines.join('\n\n')}\n\nOpen any link above on ShelfSync to add to cart and checkout securely.`;
    }

    return {
      assistantName: 'ShelfSync AI Assistant',
      replyText,
      recommendations,
      poweredBy: usedGemini ? 'gemini-4-hydrogen' : 'structured-fallback',
      searchEngine: searchRes.engine,
      policyNote: 'ShelfSync AI Assistant handles product discovery only. Orders & payments happen on ShelfSync website.',
    };
  },
};
