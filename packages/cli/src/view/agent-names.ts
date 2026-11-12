/**
 * The agents' names as people read them, by the name a session record stores.
 * Free of Node imports: the map's template imports it too.
 */
export const AGENT_LABELS: Readonly<Record<string, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};

/** The agent most sessions run on; the map labels only the others. */
export const USUAL_AGENT = "claude-code";

/** A session's agent for people; an agent cogit does not know keeps its stored name. */
export function agentLabel(agent: string): string {
  return AGENT_LABELS[agent] ?? agent;
}
