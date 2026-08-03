/**
 * agent-market.js — Hey Buddy Phase 6 Agent & Workflow Marketplace
 *
 * Inspired by LobeHub Agent Index.
 * Provides curated community agents & templates for 1-click installation into custom fleets.
 */

import { saveFleetAgent, saveFleetWorkflow } from './agent-builder.js';
import { CAPABILITIES, TRIGGER_TYPES } from './agent-spec.js';

export const MARKET_CATALOG = [
  {
    id: 'market_code_reviewer',
    type: 'agent',
    name: 'Code Reviewer & Auditor',
    author: 'Community',
    category: 'Coding',
    avatar: '👨‍💻',
    description: 'Inspects code snippets for security vulnerabilities, performance bugs, and style consistency.',
    capabilities: [CAPABILITIES.NOTIFY_USER],
    spec: {
      name: 'Code Reviewer Agent',
      avatar: '👨‍💻',
      description: 'Inspects code snippets for security vulnerabilities and style consistency.',
      systemPrompt: 'You are a senior principal software engineer. Review code for performance, security, and cleanliness.',
      capabilities: [CAPABILITIES.NOTIFY_USER],
    },
  },
  {
    id: 'market_news_digest',
    type: 'workflow',
    name: 'Daily Tech News Digest',
    author: 'Hey Buddy Team',
    category: 'Research',
    avatar: '📰',
    description: 'Automated workflow that scrapes tech news, summarizes key articles, and delivers a morning digest.',
    spec: {
      name: 'Daily Tech News Digest',
      description: 'Scrapes tech news, summarizes articles, and pushes morning notification.',
      trigger: { type: TRIGGER_TYPES.CRON, config: { cron: '0 9 * * *' } },
      nodes: [
        { id: 'fetch_news', name: 'Scrape News Source', agentId: '', toolName: 'web_scrape', inputs: { url: 'https://news.ycombinator.com' }, dependsOn: [] },
        { id: 'summarize_digest', name: 'Summarize Digest', agentId: '', toolName: 'prompt_agent', inputs: { prompt: 'Summarize: {{fetch_news.output}}' }, dependsOn: ['fetch_news'] },
      ],
    },
  },
  {
    id: 'market_seo_optimizer',
    type: 'agent',
    name: 'SEO & Content Optimizer',
    author: 'Community',
    category: 'Writing',
    avatar: '✍️',
    description: 'Analyzes blog posts and web copy for SEO target keywords, readability, and meta tag optimization.',
    capabilities: [CAPABILITIES.WEB_SCRAPE, CAPABILITIES.NOTIFY_USER],
    spec: {
      name: 'SEO & Content Optimizer',
      avatar: '✍️',
      description: 'Analyzes blog posts and copy for SEO target keywords.',
      systemPrompt: 'You are an elite SEO strategist. Optimize content for readability, search intent, and meta structures.',
      capabilities: [CAPABILITIES.WEB_SCRAPE, CAPABILITIES.NOTIFY_USER],
    },
  },
  {
    id: 'market_api_tester',
    type: 'agent',
    name: 'REST API Tester Agent',
    author: 'DevTools Lab',
    category: 'Automation',
    avatar: '⚡',
    description: 'Dispatches automated HTTP test payloads to REST endpoints and verifies response status codes.',
    capabilities: [CAPABILITIES.HTTP_REQUEST, CAPABILITIES.NOTIFY_USER],
    spec: {
      name: 'REST API Tester Agent',
      avatar: '⚡',
      description: 'Dispatches automated HTTP test payloads to REST endpoints.',
      systemPrompt: 'You are an automated API testing agent. Construct payloads, evaluate responses, and report status.',
      capabilities: [CAPABILITIES.HTTP_REQUEST, CAPABILITIES.NOTIFY_USER],
    },
  },
];

/**
 * Render Marketplace Grid Cards
 */
export function renderMarketplaceGrid(containerEl, categoryFilter = 'All', searchQuery = '', onInstall) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const filtered = MARKET_CATALOG.filter(item => {
    const matchesCategory = categoryFilter === 'All' || item.category.toLowerCase() === categoryFilter.toLowerCase();
    const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  for (const item of filtered) {
    const card = document.createElement('div');
    card.className = 'market-card';
    card.innerHTML = `
      <div>
        <div class="market-card-header">
          <div class="market-card-avatar">${item.avatar || '📦'}</div>
          <div>
            <div class="market-card-title">${escapeHtml(item.name)}</div>
            <div class="market-card-author">By ${escapeHtml(item.author)} · ${escapeHtml(item.category)}</div>
          </div>
        </div>
        <p class="market-card-desc">${escapeHtml(item.description)}</p>
      </div>
      <button class="btn-install-agent btn-install-item" data-id="${item.id}">➕ Install to Fleet</button>
    `;

    card.querySelector('.btn-install-item')?.addEventListener('click', () => onInstall(item));
    containerEl.appendChild(card);
  }
}

/**
 * Install a Marketplace Item into the user's custom fleet.
 */
export async function installMarketplaceItem(item) {
  if (item.type === 'agent') {
    await saveFleetAgent({
      id: `agent_market_${Date.now()}`,
      ...item.spec,
    });
  } else if (item.type === 'workflow') {
    await saveFleetWorkflow({
      id: `wf_market_${Date.now()}`,
      ...item.spec,
    });
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, match => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match];
  });
}
