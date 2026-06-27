"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function sessionIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const [section, id] = pathname.split("/").filter(Boolean);
  if (!id) return null;
  return ["study", "report", "graveyard"].includes(section) ? decodeURIComponent(id) : null;
}

function isAuthPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/login" || pathname.startsWith("/login/") || pathname === "/signup" || pathname.startsWith("/signup/");
}

export function SocraBotBubble({ sessionId }: { sessionId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hey! Ask me about your pace, a concept, or what to study next." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    if (!sessionId) {
      window.setTimeout(() => {
        setMessages([
          ...updated,
          {
            role: "assistant",
            content:
              "I am here across Ormify. Open a study session and I can use your live pace, deadline, depth, and deferred-topic data.",
          },
        ]);
        setLoading(false);
      }, 350);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/bubble/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, conversation_history: messages }),
      });
      if (res.status === 402) {
        setMessages([...updated, { role: "assistant", content: "You've hit your free AI limit for today. Upgrade to Premium for unlimited access, or your calls reset at midnight UTC." }]);
        return;
      }
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { reply?: string };
      setMessages([...updated, { role: "assistant", content: data.reply ?? "I could not generate a reply just now." }]);
    } catch {
      setMessages([...updated, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {open && (
        <aside
          aria-label="SocraBot assistant"
          className="orm-panel orm-panel-violet !fixed bottom-16 right-4 z-[60] flex h-[30rem] max-h-[calc(100dvh-6rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl shadow-2xl sm:right-6 sm:w-96"
        >
          <header className="flex items-center justify-between border-b border-white/15 bg-[#7B61FF] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">SocraBot</p>
              <p className="text-xs text-purple-100">{sessionId ? "Session guide" : "Ormify guide"}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-purple-100 transition hover:bg-white/10 hover:text-white"
              aria-label="Close SocraBot"
            >
              x
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={`${m.role}-${i}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-[#7B61FF] text-white"
                      : "rounded-bl-sm bg-zinc-100 text-zinc-800 dark:bg-white/10 dark:text-zinc-200"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm text-zinc-400 dark:bg-white/10 dark:text-zinc-500">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex gap-2 border-t border-zinc-200/70 p-2 dark:border-white/10"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              className="orm-input min-w-0 flex-1 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-400"
              placeholder="Ask anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="orm-primary flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold transition disabled:opacity-50"
              aria-label="Send message"
            >
              -&gt;
            </button>
          </form>
        </aside>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="orm-primary fixed bottom-4 right-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold shadow-2xl transition hover:scale-105 sm:right-6"
        aria-label={open ? "Close SocraBot" : "Open SocraBot"}
      >
        AI
      </button>
    </>
  );
}

export function SocraBotGlobal() {
  const pathname = usePathname();
  if (isAuthPath(pathname)) return null;

  return <SocraBotBubble sessionId={sessionIdFromPath(pathname)} />;
}