export * from "./memory-service";

import { memoryService } from "./memory-service";

export async function searchMemories(userId: string, query: string, limit = 8) {
  return memoryService.search(userId, query, limit);
}

export async function retrieveMemories(userId: string, limit = 8) {
  return memoryService.listByUser(userId, limit);
}
