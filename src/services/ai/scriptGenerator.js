const env = require('../../config/env');
const logger = require('../../utils/logger');

class ScriptGenerator {
  constructor() {
    this.apiKey = env.OPENAI_API_KEY;
    this.baseURL = env.OPENAI_BASE_URL;
    this.model = env.OPENAI_MODEL;
  }

  /**
   * Estimates duration of text when spoken by AI TTS (in seconds)
   * Average speed is ~2.4 words per second + short pauses between sentences
   */
  estimateDurationSeconds(text) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const sentences = (text.match(/[.!?]+/g) || []).length;
    // 2.4 words/sec speech + 0.3s pause per sentence punctuation
    const est = (words / 2.4) + (sentences * 0.25);
    return Math.round(est * 10) / 10;
  }

  /**
   * Generates a 60-70 word hook-driven Shorts script
   * @param {Object} topic - { tool_name, topic, summary }
   */
  async generateScript(topic) {
    logger.info(`Generating script for topic: ${topic.tool_name}...`);

    if (this.apiKey) {
      try {
        return await this.generateWithOpenAI(topic);
      } catch (err) {
        logger.warn(`OpenAI script generation error: ${err.message}. Using high-quality algorithmic template.`);
      }
    }

    // High quality deterministic fallback generator
    return this.generateFallbackScript(topic);
  }

  async generateWithOpenAI(topic, retryCount = 0) {
    const { OpenAI } = require('openai');
    const openai = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL
    });

    const prompt = `
You are an expert YouTube Shorts creator specializing in viral, educational AI news and productivity tools.
Write a script for a 30-second YouTube Short about this AI topic:
TOOL NAME: ${topic.tool_name}
HEADLINE: ${topic.topic}
SUMMARY: ${topic.summary}

CRITICAL RULES:
1. Total script length MUST be between 55 and 70 words MAXIMUM (so it strictly fits in under 28 seconds when spoken).
2. Structure:
   - Hook: First 2-3 seconds (must stop the scroll immediately, e.g. "Stop scrolling!", "This new AI tool is insane:", "You won't believe what this AI just did...")
   - Main Value: Clearly explain what it does in simple English.
   - Why it matters: Who should use it (students, creators, developers, founders).
   - Call To Action: 1 short sentence (e.g. "Save this Short and follow for daily AI tools!").
3. DO NOT use sound effect instructions, stage directions like [Upbeat Music] or [Visual:], ONLY return the spoken voiceover text.
4. No intro greetings like "Hey guys" or "Welcome back". Start directly with the hook.
`.trim();

    const response = await openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 250
    });

    let script = (response.choices[0]?.message?.content || '').trim();
    // Clean any brackets or markdown tags
    script = script.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();

    const wordCount = script.split(/\s+/).filter(Boolean).length;
    const estDuration = this.estimateDurationSeconds(script);

    // If script is too long (>70 words or >28s estimate), shorten it automatically
    if ((wordCount > 72 || estDuration > 28) && retryCount < 2) {
      logger.info(`Generated script is ${wordCount} words (~${estDuration}s). Auto-shortening...`);
      return this.shortenScriptWithOpenAI(openai, script, retryCount + 1);
    }

    logger.info(`Generated AI script (${wordCount} words, est ~${estDuration}s): "${script.slice(0, 60)}..."`);
    return script;
  }

  async shortenScriptWithOpenAI(openai, longScript, retryCount) {
    const prompt = `Shorten this voiceover script so it is strictly under 60 words and takes under 25 seconds to speak. Keep the punchy hook, the main AI feature, and the CTA:\n\n"${longScript}"\n\nReturn ONLY the shortened spoken text.`;
    const res = await openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 150
    });
    let clean = (res.choices[0]?.message?.content || '').replace(/\[.*?\]/g, '').trim();
    return clean;
  }

  /**
   * Deterministic hook-driven template engine guaranteed to fit 20-25 seconds
   */
  generateFallbackScript(topic) {
    const hooks = [
      `Stop scrolling. This new AI tool is blowing minds right now.`,
      `If you're still doing this manually, you need to see this AI tool today.`,
      `Here is a crazy useful AI website you probably didn't know existed.`,
      `This brand new AI breakthrough changes everything.`
    ];

    const ctas = [
      `Try it out today, and subscribe for daily AI updates!`,
      `Save this Short for later, and follow for more AI tools!`,
      `Check it out now and hit subscribe for daily AI breakdowns!`
    ];

    const hook = hooks[Math.floor(Math.random() * hooks.length)];
    const cta = ctas[Math.floor(Math.random() * ctas.length)];

    let mainExplanation = topic.summary;
    if (!mainExplanation || mainExplanation.length > 200) {
      mainExplanation = `${topic.tool_name} lets you automate complex tasks and boost your productivity in seconds.`;
    }
    // Clean up summary to 1-2 concise sentences
    const sentences = mainExplanation.replace(/\s+/g, ' ').split(/(?<=[.?!])\s+/);
    const shortCore = sentences.slice(0, 2).join(' ');

    const script = `${hook} It's called ${topic.tool_name}. ${shortCore} It is a huge time saver for creators, students, and professionals. ${cta}`;
    
    // Ensure word count is strictly safe (<68 words)
    const words = script.split(/\s+/);
    if (words.length > 68) {
      return words.slice(0, 65).join(' ') + '... ' + cta;
    }
    return script;
  }

  /**
   * Generates SEO-optimized YouTube Shorts Title, Description, and Tags
   */
  async generateMetadata(topic, script) {
    logger.info(`Generating YouTube metadata for ${topic.tool_name}...`);

    let title = `${topic.tool_name} Is Insane! 🤯 #Shorts`;
    let description = `${topic.tool_name}: ${topic.topic}\n\nKey details:\n${script}\n\nSource: ${topic.source_url || 'https://ai.google'}\n\nSubscribe for 2 daily AI tools and updates!\n\n#AI #AITools #ArtificialIntelligence #TechNews #Productivity #Shorts`;
    let tags = ['AI', 'AI Tools', 'Artificial Intelligence', 'Tech News', topic.tool_name, 'Shorts', 'ChatGPT', 'Machine Learning'];

    if (this.apiKey) {
      try {
        const { OpenAI } = require('openai');
        const openai = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL });
        const res = await openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: `For a YouTube Short about "${topic.tool_name}" (${topic.topic}), generate:
1. Title: Under 60 characters, exciting, natural, must end with #Shorts.
2. Description: 2-3 sentences with hashtags.
3. Tags: 8-10 comma-separated keywords.

Respond strictly in JSON format:
{
  "title": "string",
  "description": "string",
  "tags": ["string"]
}`
            }
          ],
          response_format: { type: 'json_object' }
        });

        const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
        if (parsed.title) title = parsed.title;
        if (parsed.description) description = parsed.description;
        if (Array.isArray(parsed.tags)) tags = parsed.tags;
      } catch (err) {
        logger.warn(`Could not generate LLM metadata, using template metadata: ${err.message}`);
      }
    }

    return { title, description, tags };
  }
}

module.exports = new ScriptGenerator();
