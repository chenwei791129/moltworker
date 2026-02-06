#!/usr/bin/env node
// Update Moltbot config from environment variables

const fs = require('fs');

const configPath = '/root/.clawdbot/clawdbot.json';
console.log('Updating config at:', configPath);
let config = {};

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.log('Starting with empty config');
}

// Ensure nested objects exist
config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.model = config.agents.defaults.model || {};
config.gateway = config.gateway || {};
config.channels = config.channels || {};

// Remove anthropic provider - we only use openrouter in this deployment
if (config.models?.providers?.anthropic) {
    console.log('Removing anthropic provider config (using openrouter instead)');
    delete config.models.providers.anthropic;
}

// Also clean up anthropic model references from agents.defaults.models
if (config.agents?.defaults?.models) {
    const modelsToRemove = Object.keys(config.agents.defaults.models)
        .filter(key => key.startsWith('anthropic/'));
    if (modelsToRemove.length > 0) {
        console.log('Removing anthropic model references:', modelsToRemove);
        modelsToRemove.forEach(key => delete config.agents.defaults.models[key]);
    }
}



// Gateway configuration
config.gateway.port = 18789;
config.gateway.mode = 'local';
config.gateway.trustedProxies = ['10.1.0.0'];

// Set gateway token if provided
if (process.env.CLAWDBOT_GATEWAY_TOKEN) {
    config.gateway.auth = config.gateway.auth || {};
    config.gateway.auth.token = process.env.CLAWDBOT_GATEWAY_TOKEN;
}

// Allow insecure auth for dev mode
if (process.env.CLAWDBOT_DEV_MODE === 'true') {
    config.gateway.controlUi = config.gateway.controlUi || {};
    config.gateway.controlUi.allowInsecureAuth = true;
}

// Telegram configuration
if (process.env.TELEGRAM_BOT_TOKEN) {
    config.channels.telegram = config.channels.telegram || {};
    config.channels.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
    config.channels.telegram.enabled = true;
    const telegramDmPolicy = process.env.TELEGRAM_DM_POLICY || 'pairing';
    config.channels.telegram.dmPolicy = telegramDmPolicy;
    if (process.env.TELEGRAM_DM_ALLOW_FROM) {
        // Explicit allowlist: "123,456,789" → ['123', '456', '789']
        config.channels.telegram.allowFrom = process.env.TELEGRAM_DM_ALLOW_FROM.split(',');
    } else if (telegramDmPolicy === 'open') {
        // "open" policy requires allowFrom: ["*"]
        config.channels.telegram.allowFrom = ['*'];
    }
}

// Discord configuration
// Note: Discord uses nested dm.policy, not flat dmPolicy like Telegram
// See: https://github.com/moltbot/moltbot/blob/v2026.1.24-1/src/config/zod-schema.providers-core.ts#L147-L155
if (process.env.DISCORD_BOT_TOKEN) {
    config.channels.discord = config.channels.discord || {};
    config.channels.discord.token = process.env.DISCORD_BOT_TOKEN;
    config.channels.discord.enabled = true;
    const discordDmPolicy = process.env.DISCORD_DM_POLICY || 'pairing';
    config.channels.discord.dm = config.channels.discord.dm || {};
    config.channels.discord.dm.policy = discordDmPolicy;
    // "open" policy requires allowFrom: ["*"]
    if (discordDmPolicy === 'open') {
        config.channels.discord.dm.allowFrom = ['*'];
    }
}

// Slack configuration
if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN) {
    config.channels.slack = config.channels.slack || {};
    config.channels.slack.botToken = process.env.SLACK_BOT_TOKEN;
    config.channels.slack.appToken = process.env.SLACK_APP_TOKEN;
    config.channels.slack.enabled = true;
}

// Base URL override (e.g., for Cloudflare AI Gateway)
// Usage: Set AI_GATEWAY_BASE_URL or ANTHROPIC_BASE_URL to your endpoint like:
//   https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic
//   https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openai
const baseUrl = (process.env.AI_GATEWAY_BASE_URL || process.env.ANTHROPIC_BASE_URL || '').replace(/\/+$/, '');
const apiKey = process.env.AI_GATEWAY_API_KEY;

// Debug: show environment variable status
console.log('Environment variables:');
console.log('  AI_GATEWAY_BASE_URL:', process.env.AI_GATEWAY_BASE_URL ? '[SET]' : '[NOT SET]');
console.log('  ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL ? '[SET]' : '[NOT SET]');
console.log('  AI_GATEWAY_API_KEY:', apiKey ? '[SET]' : '[NOT SET]');

if (baseUrl) {
    console.log('Configuring Openrouter provider with base URL:', baseUrl);
    config.models = config.models || {};
    config.models.providers = config.models.providers || {};
    const providerConfig = {
        baseUrl: baseUrl,
        api: 'openai-completions',
        models: [
            { id: 'free', name: 'Openrouter free', contextWindow: 200000 },
        ]
    };
    // Only include apiKey if it's actually set
    if (apiKey) {
        providerConfig.apiKey = apiKey;
    } else {
        console.warn('WARNING: AI_GATEWAY_API_KEY is not set! API calls may fail.');
    }
    config.models.providers.openrouter = providerConfig;
    // Add models to the allowlist so they appear in /models
    config.agents.defaults.models = config.agents.defaults.models || {};
    config.agents.defaults.models['openrouter/free'] = { };
    config.agents.defaults.model.primary = 'openrouter/free';
}

// Write updated config
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Configuration updated successfully');
console.log('Config:', JSON.stringify(config, null, 2));
