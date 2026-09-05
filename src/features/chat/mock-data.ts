import type { ChatMessage, ChatThread } from "@/features/chat/types";

const buildAssistant = (content: string): ChatMessage => ({
  id: `assistant-${Math.random().toString(36).slice(2, 9)}`,
  role: "assistant",
  content,
  timestamp: "now",
});

export const initialThreads: ChatThread[] = [
  {
    id: "thread-1",
    title: "Product launch recap",
    createdAt: "2026-08-30T09:00:00.000Z",
    lastActive: "2026-08-30T16:30:00.000Z",
    messages: [
      {
        id: "m-1",
        role: "user",
        content: "Summarize our product launch recap and action items.",
        timestamp: "2026-08-30T16:10:00.000Z",
      },
      buildAssistant(`Here’s the recap from today’s launch review:

- We shipped the onboarding redesign and improved activation by 18%.
- Support load decreased after we addressed the top three friction points.
- The biggest risk is still churn among enterprise users during the first 14 days.

Recommended next steps:
1. Launch a quick-win retention campaign for trial users.
2. Add stronger onboarding nudges in the dashboard.
3. Gather customer interviews from the enterprise segment next week.`),
    ],
  },
  {
    id: "thread-2",
    title: "Marketing campaign ideas",
    createdAt: "2026-08-29T12:00:00.000Z",
    lastActive: "2026-08-30T15:00:00.000Z",
    messages: [
      {
        id: "m-2",
        role: "user",
        content: "Generate 5 creative campaign concepts for our AI productivity launch.",
        timestamp: "2026-08-30T14:55:00.000Z",
      },
      buildAssistant(`Here are 5 high-impact campaign ideas:

### 1. “Work less. Think bigger.”
Focus on productivity benefits with before/after workflows.

### 2. Team rituals, reimagined
Show how AI can support product planning and content creation across teams.

### 3. The 10-minute sprint
Promote a challenge where users complete real work faster with AI-assisted workflows.

### 4. Creator desk setup
Turn product stories into polished social content around real user workflows.

### 5. Launch with social proof
Highlight customer quotes and measurable outcomes from beta users.`),
    ],
  },
  {
    id: "thread-3",
    title: "Roadmap review",
    createdAt: "2026-08-28T10:00:00.000Z",
    lastActive: "2026-08-29T09:00:00.000Z",
    messages: [
      {
        id: "m-3",
        role: "user",
        content: "Can you outline the roadmap priorities for Q4?",
        timestamp: "2026-08-29T08:30:00.000Z",
      },
      buildAssistant(`Q4 roadmap should prioritize a short list of outcomes, not features:

- Reduce friction in the first 7 days.
- Launch team sharing and collaboration.
- Increase trust through better explanation and privacy controls.
- Expand integrations for the most common workflows.

A good rule: every shipped improvement should tie back to retention, conversion, or time saved.`),
    ],
  },
];

export function generateMockAssistantReply(prompt: string): string {
  const normalized = prompt.trim();

  if (!normalized) {
    return "I’m ready when you are. Ask me to plan, summarize, draft, or refine something.";
  }

  return `Here’s a polished response to: “${normalized}”

I’d approach this by breaking it into a clear problem, a concise opportunity, and a set of practical actions.

### Suggested plan
1. Define the outcome you want to drive.
2. Identify the highest-value constraints or risks.
3. Prioritize the first few actions with measurable impact.
4. Test quickly with a small cohort before scaling.

### Example output
\`\`\`ts
const nextStep = {
  objective: "Reduce cognitive load",
  focus: ["clarity", "speed", "trust"],
  metric: "activation rate",
};
\nconsole.log(nextStep);
\`\`\`

This gives you a fast, structured path to move from idea to execution without over-engineering the first pass.`;
}
