import { AppDefinition } from "./types";

const apps = new Map<string, AppDefinition>();

export function defineApp(def: AppDefinition): AppDefinition {
  if (apps.has(def.id)) {
    throw new Error(`App already registered: ${def.id}`);
  }
  apps.set(def.id, def);
  return def;
}

export function getApp(id: string): AppDefinition | undefined {
  return apps.get(id);
}

export function listApps(): AppDefinition[] {
  return [...apps.values()];
}

export function requireApp(id: string): AppDefinition {
  const app = apps.get(id);
  if (!app) throw new Error(`Unknown app: ${id}`);
  return app;
}
