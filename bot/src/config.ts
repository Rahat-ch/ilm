export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  agentUrl: process.env.AGENT_URL ?? "http://localhost:8000",
  evolutionApiUrl: process.env.EVOLUTION_API_URL ?? "http://localhost:8080",
  evolutionApiKey: process.env.EVOLUTION_API_KEY ?? "",
  evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME ?? "ilm",
  dataDir: process.env.DATA_DIR ?? "../data",
};
