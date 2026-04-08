"use strict";

/**
 * categorize.js — AI-assisted spend categorization.
 *
 * In production mode this calls the Groq Chat Completions API.
 * When opts.mock=true (or no API key) a rule-based heuristic is used instead,
 * making the CLI fully functional without network access.
 */

// We use dynamic import for node-fetch so the module works with both
// CommonJS and modern ESM environments.
const _fetchImpl = () => import("node-fetch").then((m) => m.default);

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = ["energy", "capital", "behavior"];

/**
 * Categorise a natural-language spend description.
 *
 * @param {string} description        - User-supplied text
 * @param {object} [opts]
 * @param {string} [opts.apiKey]      - Groq API key
 * @param {boolean}[opts.mock]        - Force mock mode
 * @param {string} [opts.model]       - Groq model id (default: llama3-8b-8192)
 * @returns {Promise<{category: string, confidence: number, reasoning: string}>}
 */
async function categorizeSpend(description, opts = {}) {
  if (!description || description.trim() === "") {
    throw new Error("categorizeSpend: description must not be empty");
  }

  if (opts.mock || !opts.apiKey) {
    return _mockCategorize(description);
  }

  return _groqCategorize(description, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock (rule-based) categorization
// ─────────────────────────────────────────────────────────────────────────────

const ENERGY_KEYWORDS  = /\b(kwh|solar|wind|electricity|power|ev|electric\s+vehicle|battery|grid|renewable|generator|heat\s*pump|hvac)\b/i;
const CAPITAL_KEYWORDS = /\b(invest|fund|loan|bond|grant|donation|charity|capital|usd|eur|redirect|finance|portfolio|impact\s+invest)\b/i;
const BEHAVIOR_KEYWORDS = /\b(commut|carpool|transit|walk|bike|cycle|recycle|compost|diet|vegan|vegetarian|habit|reduce|reuse|offset)\b/i;

function _mockCategorize(description) {
  const eScore = (description.match(ENERGY_KEYWORDS)  || []).length;
  const cScore = (description.match(CAPITAL_KEYWORDS) || []).length;
  const bScore = (description.match(BEHAVIOR_KEYWORDS)|| []).length;

  const total = eScore + cScore + bScore || 1; // avoid /0
  const scores = [eScore / total, cScore / total, bScore / total];
  const maxIdx = scores.indexOf(Math.max(...scores));

  const category   = CATEGORIES[maxIdx];
  const confidence = Math.max(...scores);

  const reasonMap = {
    energy:   "Description mentions energy-related terms (kWh, solar, electricity, EV, etc.).",
    capital:  "Description mentions capital or financial terms (invest, fund, USD, donation, etc.).",
    behavior: "Description mentions behavioural change terms (commute, recycle, diet, etc.).",
  };

  return {
    category,
    confidence: +confidence.toFixed(4),
    reasoning: confidence === 1 / total
      ? "No distinctive keywords found; defaulting to energy category."
      : reasonMap[category],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Groq API categorization
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are a sustainability impact classifier.
Classify the user's description into exactly ONE of these three categories:
- energy   (kWh saved, renewable energy, electric vehicles, grid optimisation)
- capital  (impact investing, redirected funds, donations, green bonds)
- behavior (lifestyle changes, commuting, diet, recycling, carbon offsets)

Respond with a JSON object in this exact format (no markdown):
{"category":"<energy|capital|behavior>","confidence":<0.0-1.0>,"reasoning":"<brief explanation>"}`;

async function _groqCategorize(description, { apiKey, model = "llama3-8b-8192" }) {
  const fetch = await _fetchImpl();

  const body = {
    model,
    messages: [
      { role: "system",  content: SYSTEM_PROMPT },
      { role: "user",    content: description },
    ],
    temperature: 0.1,
    max_tokens:  256,
  };

  const res = await fetch(GROQ_API_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data     = await res.json();
  const raw      = data.choices?.[0]?.message?.content?.trim() ?? "";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse Groq response as JSON: ${raw}`);
  }

  const category = parsed.category?.toLowerCase();
  if (!CATEGORIES.includes(category)) {
    throw new Error(`Groq returned unknown category "${parsed.category}"`);
  }

  return {
    category,
    confidence: Number(parsed.confidence) || 0,
    reasoning:  String(parsed.reasoning  || ""),
  };
}

module.exports = { categorizeSpend, CATEGORIES };
