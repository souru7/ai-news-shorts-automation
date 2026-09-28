const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const Parser = require('rss-parser');
const { RSS_FEEDS, VERIFIED_FALLBACK_TOOLS } = require('./sources');
const db = require('../../database/db');
const logger = require('../../utils/logger');

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (AI News Reel Research Bot/1.0)' }
});

class ResearchService {
  /**
   * Fetch latest AI news items from trusted feeds and save to database
   */
  async discoverLatestTopics() {
    logger.info('Starting automated AI topic research...');
    const discovered = [];

    // 1. Fetch from live RSS feeds
    for (const feed of RSS_FEEDS) {
      try {
        const feedData = await parser.parseURL(feed.url);
        const recentItems = (feedData.items || []).slice(0, 5);

        for (const item of recentItems) {
          const title = (item.title || '').trim();
          const link = (item.link || '').trim();
          const content = (item.contentSnippet || item.summary || item.content || '').trim().slice(0, 500);
          const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

          // Only keep items that discuss AI tools, updates, models, or apps
          if (!this.isRelevantAiTopic(title, content)) {
            continue;
          }

          const extractedTool = this.extractToolName(title);
          discovered.push({
            id: `src-${uuidv4()}`,
            tool_name: extractedTool,
            topic: title,
            source_url: link,
            source_title: `${feed.name}: ${title}`,
            published_at: pubDate,
            summary: content
          });
        }
      } catch (err) {
        logger.warn(`Could not fetch RSS feed (${feed.name}): ${err.message}`);
      }
    }

    // 2. Ensure verified tool catalog is also present in database
    for (const item of VERIFIED_FALLBACK_TOOLS) {
      discovered.push({
        id: `verified-${uuidv4()}`,
        tool_name: item.tool_name,
        topic: item.topic,
        source_url: item.source_url,
        source_title: item.source_title,
        published_at: new Date().toISOString(),
        summary: item.summary
      });
    }

    // 3. Persist new items into database if not existing
    let insertedCount = 0;
    for (const d of discovered) {
      try {
        const exists = await db.query(
          'SELECT id FROM research_sources WHERE source_url = $1 OR topic = $2',
          [d.source_url, d.topic]
        );
        if (exists.rows.length === 0) {
          await db.query(
            `INSERT INTO research_sources 
             (id, topic, tool_name, source_url, source_title, published_at, summary, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'unprocessed')`,
            [d.id, d.topic, d.tool_name, d.source_url, d.source_title, d.published_at, d.summary]
          );
          insertedCount++;
        }
      } catch (err) {
        // duplicate URL constraint, safe to skip
      }
    }

    logger.info(`Research completed. Discovered and stored ${insertedCount} new candidate topics.`);
    return insertedCount;
  }

  /**
   * Filter headlines for actionable AI tools, features, or breakthroughs
   */
  isRelevantAiTopic(title, content) {
    const text = `${title} ${content}`.toLowerCase();
    const keywords = [
      'ai', 'llm', 'chatgpt', 'openai', 'anthropic', 'claude', 'gemini', 'midjourney',
      'deepseek', 'copilot', 'model', 'feature', 'tool', 'launch', 'release', 'update',
      'generator', 'agent', 'automation', 'app', 'browser', 'workflow'
    ];
    return keywords.some(k => text.includes(k));
  }

  /**
   * Extract or guess tool/company name from headline
   */
  extractToolName(title) {
    const commonPatterns = [
      /^(OpenAI|Anthropic|Google|Microsoft|Meta|Apple|Nvidia|Midjourney|Perplexity|Cursor|Bolt|Suno|ElevenLabs|Runway)\b/i,
      /\b([A-Z][a-zA-Z0-9\.\-]+(?: AI|\.ai|\.io|\.new)?)\b/
    ];
    for (const pat of commonPatterns) {
      const match = title.match(pat);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return title.split(' ')[0] || 'AI Tool';
  }

  /**
   * Select the freshest, non-duplicate topic for video creation
   */
  async selectNextTopic() {
    // 1. First trigger a fresh research pass
    await this.discoverLatestTopics();

    // 2. Fetch list of already used tool names or topics from completed/in-progress videos
    const usedQuery = await db.query(
      `SELECT DISTINCT LOWER(tool_name) as tool_name, LOWER(topic) as topic 
       FROM videos 
       WHERE status NOT IN ('failed')`
    );
    const usedTools = new Set(usedQuery.rows.map(r => (r.tool_name || '').toLowerCase()));
    const usedTopics = new Set(usedQuery.rows.map(r => (r.topic || '').toLowerCase()));

    // 3. Find candidates from research_sources
    const candidates = await db.query(
      `SELECT id, topic, tool_name, source_url, source_title, summary 
       FROM research_sources 
       WHERE status != 'used' 
       ORDER BY published_at DESC, researched_at DESC 
       LIMIT 50`
    );

    let selected = null;
    for (const row of candidates.rows) {
      const normTool = (row.tool_name || '').toLowerCase();
      const normTopic = (row.topic || '').toLowerCase();

      // Check if tool or topic has been used
      if (!usedTools.has(normTool) && !usedTopics.has(normTopic)) {
        selected = row;
        break;
      }
    }

    // 4. Fallback if all harvested are used: pick least recently published or fallback tool with suffix
    if (!selected) {
      const fallback = VERIFIED_FALLBACK_TOOLS[Math.floor(Math.random() * VERIFIED_FALLBACK_TOOLS.length)];
      selected = {
        id: `sel-${uuidv4()}`,
        tool_name: fallback.tool_name,
        topic: fallback.topic,
        source_url: fallback.source_url,
        source_title: fallback.source_title,
        summary: fallback.summary
      };
    }

    // Mark as selected in research_sources
    if (selected.id) {
      await db.query(`UPDATE research_sources SET status = 'used' WHERE id = $1`, [selected.id]);
    }

    logger.info(`Selected topic for Shorts production: [${selected.tool_name}] ${selected.topic}`);
    return selected;
  }
}

module.exports = new ResearchService();
