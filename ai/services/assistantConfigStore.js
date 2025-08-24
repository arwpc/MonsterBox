const fs = require('fs').promises;
const path = require('path');
const CONFIG_PATH = path.join(__dirname, '../../data/assistants-config.json');

async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { assistants: {} };
  }
}

async function writeConfig(config) {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function getAssistantConfig(assistantId) {
  const cfg = await readConfig();
  return cfg.assistants[assistantId] || { conversationStarters: [], files: [], actions: [], vectorStoreId: null, openapi: null };
}

async function setAssistantConfig(assistantId, update) {
  const cfg = await readConfig();
  const cur = cfg.assistants[assistantId] || { conversationStarters: [], files: [], actions: [], vectorStoreId: null, openapi: null };
  cfg.assistants[assistantId] = { ...cur, ...update };
  await writeConfig(cfg);
  return cfg.assistants[assistantId];
}

module.exports = {
  readConfig,
  writeConfig,
  getAssistantConfig,
  setAssistantConfig,
  CONFIG_PATH
};

