import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, MessageSquare, Send } from 'lucide-react';
import { apiFetch } from '@/src/lib/api';
import { formatInr } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';

interface Recommendation {
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

interface AssistantResponse {
  assistantName: string;
  replyText: string;
  recommendations: Recommendation[];
  poweredBy: string;
  searchEngine: string;
  policyNote: string;
}

const SAMPLE_PROMPTS = [
  'Suggest wireless earphones under ₹1,000.',
  'I need a gift for my father under ₹2,000.',
  'Which laptop is suitable for students?',
  'Show me good running shoes.',
  'Compare wireless headphones under ₹9,000.',
];

export function AssistantPage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ query: string; reply: AssistantResponse }>>([]);

  const sendQuery = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const reply = await apiFetch<AssistantResponse>('/api/assistant/discover', {
        method: 'POST',
        body: { message: trimmed },
      });
      setHistory((prev) => [...prev, { query: trimmed, reply }]);
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(message);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold tracking-wide text-indigo-600">
          WhatsApp Business Cloud + Gemini Discovery
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
          ShelfSync AI Assistant
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Natural-language product search, recommendations, comparisons, price checks, and stock availability. Orders and Razorpay payments always happen directly on the ShelfSync website.
        </p>
      </div>

      {/* Quick Prompts */}
      <div className="mt-6">
        <p className="text-xs font-semibold text-slate-500 mb-2.5">Try an example customer message</p>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={loading}
              onClick={() => sendQuery(p)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/60 cursor-pointer"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Transcript */}
      <div className="mt-6 space-y-6">
        {history.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-8 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-indigo-600" />
            <p className="mt-3 text-sm font-medium text-slate-900">
              Ask ShelfSync AI Assistant about any product, budget, or comparison.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Powered by server-side Gemini + OpenSearch + live PostgreSQL stock &amp; pricing.
            </p>
          </div>
        ) : (
          history.map((turn, idx) => (
            <div key={idx} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex justify-end">
                <div className="max-w-lg rounded-xl bg-blue-600 px-4 py-2.5 text-sm text-white">
                  {turn.query}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-indigo-600">{turn.reply.assistantName}</span>
                  <span>
                    Model: {turn.reply.poweredBy} · Search: {turn.reply.searchEngine}
                  </span>
                </div>

                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800 rounded-xl bg-slate-50 p-4 border border-slate-200">
                  {turn.reply.replyText}
                </pre>

                {turn.reply.recommendations.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-2">
                    {turn.reply.recommendations.map((rec) => {
                      const slugPath = new URL(rec.productUrl, window.location.origin).pathname;
                      return (
                        <div
                          key={rec.id}
                          className="flex flex-col justify-between rounded-xl border border-slate-200 p-3.5"
                        >
                          <div>
                            <div className="flex items-center gap-3">
                              <img
                                src={rec.imageUrl}
                                alt={rec.name}
                                referrerPolicy="no-referrer"
                                className="h-14 w-14 rounded-lg object-cover bg-slate-100 shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-xs text-slate-500">{rec.brand}</p>
                                <p className="text-sm font-semibold text-slate-900 line-clamp-2">
                                  {rec.name}
                                </p>
                              </div>
                            </div>
                            <p className="mt-2.5 text-xs text-slate-600 line-clamp-2">{rec.reason}</p>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                            <div>
                              <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                                {formatInr(rec.priceInr)}
                              </span>
                              <p className="text-slate-500">{rec.stockStatus}</p>
                            </div>
                            <Button asChild size="sm" variant="outline">
                              <Link to={slugPath}>
                                View
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="mt-6 flex gap-3">
        <label htmlFor="assistant-input" className="sr-only">
          Ask ShelfSync AI Assistant
        </label>
        <Input
          id="assistant-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder='Ask e.g. "Suggest wireless earphones under ₹1,000"'
          className="h-11 flex-1"
        />
        <Button type="submit" size="lg" disabled={loading || !message.trim()}>
          <Send className="h-4 w-4" />
          {loading ? 'Thinking...' : 'Send'}
        </Button>
      </form>
    </div>
  );
}
