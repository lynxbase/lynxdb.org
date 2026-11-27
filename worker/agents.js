/*
  Which requests get a blog page as Markdown instead of HTML.

  A request wants Markdown when it asks for it (an Accept header that ranks text/markdown at least as
  high as text/html), when Cloudflare has verified it as an AI bot, or when its User-Agent names an AI
  agent or crawler from AGENTS. Search engines (Googlebot, Bingbot, Applebot, PetalBot, Brave) are
  not listed and keep the HTML their index is built from; so do link previews (facebookexternalhit,
  Twitterbot, Slackbot, LinkedInBot, Discordbot), which read the Open Graph tags of the HTML.

  AGENTS is drawn from github.com/ai-robots-txt/ai.robots.txt (robots.json, November 2026) and the
  operators' own pages (OpenAI, Anthropic, Google, Meta, Perplexity, Mistral). Each entry is matched
  as a case-insensitive substring of the User-Agent, so it must be specific enough not to occur in a
  browser's or a search engine's: generic names on that list (Code, Dot, Spider, Operator, Trae, Muse)
  are left out, and so are tokens that only robots.txt knows (Google-Extended, Applebot-Extended).
*/

export const AGENTS = [
  // OpenAI: training, ChatGPT search, ChatGPT fetching a page for a user, the agent, Codex
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ChatGPT Agent', 'Codex',
  // Anthropic: training, Claude's search, Claude fetching for a user, Claude Code, older names
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'Claude-Code', 'Claude-Agent', 'Claude-Web', 'anthropic-ai',
  // Google, apart from Googlebot: Vertex AI, Gemini's URL context and Deep Research, NotebookLM, agents
  'Google-CloudVertexBot', 'CloudVertexBot', 'GoogleOther', 'GoogleAgent-URLContext', 'GoogleAgent-Mariner',
  'Google-Agent', 'Gemini-Deep-Research', 'Google-Gemini-CLI', 'Google-NotebookLM', 'NotebookLM',
  'Google-GeminiNotebook', 'Google-Firebase',
  // Meta: training, Meta AI fetching for a user, Meta AI's index, the agent
  'meta-externalagent', 'meta-externalfetcher', 'meta-webindexer', 'FacebookBot', 'HatchFeed',
  // Perplexity: its index and its fetches for a user
  'PerplexityBot', 'Perplexity-User',
  // Microsoft and Amazon: Azure AI Search, Alexa and Rufus answers, Bedrock, Q Business, Nova Act
  'AzureAI-SearchBot', 'Amazonbot', 'Amzn-SearchBot', 'Amzn-User', 'bedrockbot', 'amazon-kendra',
  'amazon-QBusiness', 'NovaAct',
  // xAI, Mistral, DeepSeek, Cohere
  'GrokBot', 'Grok Bot', 'xAI-Grok', 'MistralAI-User', 'MistralAI-Index', 'MistralAI-Training', 'DeepSeekBot',
  'cohere-ai', 'cohere-training-data-crawler',
  // assistants and models from China, Japan, Korea and Russia
  'Bytespider', 'DoubaoBot', 'TikTokSpider', 'QwenBot', 'TongyiBot', 'ERNIEBot', 'YiyanBot', 'Hunyuan',
  'ChatGLM-Spider', 'KimiBot', 'Kimi-User', 'Kimi-SearchBot', 'Kimi-Agent', 'MoonshotBot', 'MiniMaxAgent',
  'PanguBot', 'YiBot', 'SBIntuitionsBot', 'Cotoyogi', 'ICC-Crawler', 'WRTNBot', 'YandexAdditional',
  // AI search and answer engines
  'DuckAssistBot', 'YouBot', 'PhindBot', 'kagi-fetcher', 'Andibot', 'iaskspider', 'iAskBot', 'LinerBot',
  'Liner-User', 'ExaBot', 'ExaSearchBot', 'ExaUser', 'LinkupBot', 'AIWebIndex', 'AddSearchBot',
  'Channel3Bot', 'KeenableBot', 'ZanistaBot', 'Querit-SearchBot', 'QueritBot', 'GeneralRetrievalBot',
  'Haiku-SearchBot', 'Aranet-SearchBot',
  // coding agents and agent platforms
  'Cursor', 'opencode', 'qodercli', 'Devin', 'Manus-User', 'AGI Agent', 'TwinAgent', 'atlassian-bot',
  'Poggio-Citations', 'GeistHaus-PageFetcher', 'ElevenlabsBot', 'Diffbot-User',
  // datasets and data providers for models and agents
  'CCBot', 'AI2Bot', 'Diffbot', 'TavilyBot', 'FirecrawlAgent', 'Crawl4AI', 'ShapBot', 'Shap-User',
  'Cloudflare-AutoRAG', 'CloudflareBrowserRenderingCrawler', 'Mozilla-Tabstack', 'Brightbot', 'Crawlspace',
  'TerraCotta', 'Terra Cotta', 'ApifyBot', 'ApifyWebsiteContentCrawler', 'AgentDataBot', 'HenkBot',
  'Timpibot', 'Kangaroo Bot', 'omgili', 'Webzio-Extended', 'Panscient', 'VelenPublicWebCrawler',
  'Factset_spyderbot', 'ISSCyberRiskCrawler', 'Poseidon Research Crawler', 'ElevenlabsCrawler',
];

const LOWER = AGENTS.map(name => name.toLowerCase());

// the entry of AGENTS that the User-Agent names, or null
export function agentOf(userAgent) {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua) return null;
  const i = LOWER.findIndex(name => ua.includes(name));
  return i < 0 ? null : AGENTS[i];
}

// Cloudflare's categories of verified bots that read pages for a model or an assistant
const VERIFIED = new Set(['AI Crawler', 'AI Assistant', 'AI Search']);

// the quality an Accept header gives a type: its own entry, else its family's (text/*), else */*
function quality(accept, type) {
  let best = { rank: 0, q: 0 };
  for (const part of accept.split(',')) {
    const [range, ...params] = part.trim().toLowerCase().split(';').map(s => s.trim());
    const rank = range === type ? 3 : range === `${type.split('/')[0]}/*` ? 2 : range === '*/*' ? 1 : 0;
    if (rank <= best.rank) continue;
    const q = params.find(p => p.startsWith('q='));
    best = { rank, q: q ? Number(q.slice(2)) || 0 : 1 };
  }
  return best.q;
}

// why the request gets Markdown: 'accept', 'verified', the agent's name, or null for HTML
export function markdownReason(request) {
  const accept = request.headers.get('accept') ?? '';
  if (/text\/markdown/i.test(accept) && quality(accept, 'text/markdown') > 0
      && quality(accept, 'text/markdown') >= quality(accept, 'text/html')) return 'accept';
  if (VERIFIED.has(request.cf?.verifiedBotCategory)) return 'verified';
  return agentOf(request.headers.get('user-agent'));
}
