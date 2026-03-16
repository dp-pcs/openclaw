import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type HandlerType = "builtin" | "command" | "skill";

export type IntentHandler = {
  type: HandlerType;
  command?: string; // for type="command", {param} substitutions
  skillName?: string; // for type="skill"
};

export type CustomIntentDef = {
  description: string;
  input: Record<string, string>; // param name → type string (loose)
  output: Record<string, string>;
  command: string;
};

export type IntentRegistry = {
  version: string;
  handlers: Record<string, IntentHandler>;
  custom: Record<string, CustomIntentDef>;
};

// Standard built-in intents — always available as definitions
export const STANDARD_INTENTS = [
  "ping",
  "calendar-read",
  "calendar-write",
  "web-search",
  "issue-list",
  "issue-get",
  "note-create",
  "note-search",
  "send-message",
  "task-create",
] as const;

const REGISTRY_FILENAME = "ogp-intent-registry.json";

function getDefaultRegistry(): IntentRegistry {
  return {
    version: "1.0",
    handlers: {
      ping: { type: "builtin" },
    },
    custom: {},
  };
}

// Load registry from {stateDir}/ogp-intent-registry.json
// If file does not exist, return default with only ping builtin
export async function loadIntentRegistry(stateDir: string): Promise<IntentRegistry> {
  const registryPath = join(stateDir, REGISTRY_FILENAME);

  try {
    const content = await readFile(registryPath, "utf8");
    return JSON.parse(content) as IntentRegistry;
  } catch (err) {
    // File doesn't exist or can't be read - return default
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return getDefaultRegistry();
    }
    throw err;
  }
}

// Save registry to disk
export async function saveIntentRegistry(
  stateDir: string,
  registry: IntentRegistry,
): Promise<void> {
  const registryPath = join(stateDir, REGISTRY_FILENAME);

  // Ensure state directory exists
  await mkdir(stateDir, { recursive: true });

  await writeFile(registryPath, JSON.stringify(registry, null, 2), "utf8");
}

// Get list of intents this gateway can handle (has a configured handler)
export function getCapableIntents(registry: IntentRegistry): string[] {
  const handlerIntents = Object.keys(registry.handlers);
  const customIntents = Object.keys(registry.custom);

  // Combine and deduplicate
  return [...new Set([...handlerIntents, ...customIntents])];
}

// Register a new handler for an intent
export async function registerIntentHandler(
  stateDir: string,
  intent: string,
  handler: IntentHandler,
): Promise<void> {
  const registry = await loadIntentRegistry(stateDir);

  registry.handlers[intent] = handler;

  await saveIntentRegistry(stateDir, registry);
}

// Remove an intent handler
export async function removeIntentHandler(stateDir: string, intent: string): Promise<void> {
  const registry = await loadIntentRegistry(stateDir);

  delete registry.handlers[intent];
  delete registry.custom[intent];

  await saveIntentRegistry(stateDir, registry);
}
