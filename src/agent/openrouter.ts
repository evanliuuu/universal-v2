export type OpenRouterChatRequest = {
  apiKey: string;
  title: string;
  model: string;
  system: string;
  user: string;
};

export type OpenRouterChatResult =
  | { ok: true; content: string }
  | { ok: false; status: number };

export type OpenRouterChat = (
  req: OpenRouterChatRequest,
) => Promise<OpenRouterChatResult>;

async function defaultOpenRouterChat(
  req: OpenRouterChatRequest,
): Promise<OpenRouterChatResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5174",
      "X-Title": req.title,
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return { ok: false, status: res.status };

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  return {
    ok: true,
    content: typeof content === "string" ? content : JSON.stringify(content),
  };
}

let chatImpl: OpenRouterChat = defaultOpenRouterChat;

/** Swap the OpenRouter client (used by eval mocks). Pass undefined to restore. */
export function setOpenRouterChat(next?: OpenRouterChat) {
  chatImpl = next ?? defaultOpenRouterChat;
}

export function openRouterChat(req: OpenRouterChatRequest) {
  return chatImpl(req);
}
