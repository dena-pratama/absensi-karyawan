"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@/components/icon";
import { approveProposal, askAssistant } from "@/lib/actions/ai";
import type { ChatTurn } from "@/lib/ai/engine";
import type { SignedProposal } from "@/lib/ai/proposal";
import { formatDateLong } from "@/lib/format";
import { ATTENDANCE_LABEL, type AttendanceStatus } from "@/lib/labels";

type ProposalState = SignedProposal & { state: "pending" | "approving" | "approved" | "rejected" | "error"; info?: string };

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; proposals: ProposalState[]; error?: boolean; limit?: boolean; canManage?: boolean };

const STORAGE_KEY = "smart-ai-chat";
const SUGGESTIONS = [
  "Ringkas kehadiran semua cabang hari ini",
  "Siapa yang paling sering sakit bulan ini?",
  "Bandingkan persentase kehadiran antar cabang bulan ini",
  "Karyawan mana yang belum diabsen hari ini?",
];

const STATUS_CHIP: Record<AttendanceStatus, string> = {
  hadir: "bg-emerald-500/15 text-emerald-300",
  sakit: "bg-amber-500/15 text-amber-300",
  tidak_hadir: "bg-rose-500/15 text-rose-300",
  libur: "bg-sky-500/15 text-sky-300",
};

const uid = () => Math.random().toString(36).slice(2, 10);

/** Riwayat untuk AI: teks jawaban + status usulan (supaya AI tahu usulan disetujui/ditolak). */
function toHistory(messages: Message[]): ChatTurn[] {
  return messages
    .filter((m) => !(m.role === "assistant" && m.error))
    .map((m) => {
      if (m.role === "user") return { role: "user", text: m.text };
      const notes = m.proposals.map((p) => {
        const s = p.state === "approved" ? "DISETUJUI admin & tersimpan" : p.state === "rejected" ? "DITOLAK admin" : "belum diputuskan admin";
        return `[Usulan #${p.proposal.id}: ${s}]`;
      });
      return { role: "assistant", text: [m.text, ...notes].join("\n") };
    });
}

function loadMessages(): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

export function SmartAiChat() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [thinking, startThinking] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Riwayat chat bertahan selama tab browser terbuka.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkron dari sessionStorage setelah mount
    setMessages(loadMessages());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* storage tidak tersedia */
    }
  }, [messages, hydrated]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || thinking) return;
    const history = toHistory(messages);
    setMessages((m) => [...m, { id: uid(), role: "user", text: question }]);
    setInput("");
    startThinking(async () => {
      const res = await askAssistant(history, question);
      setMessages((m) => [
        ...m,
        res.ok
          ? { id: uid(), role: "assistant", text: res.reply, proposals: res.proposals.map((p) => ({ ...p, state: "pending" as const })) }
          : { id: uid(), role: "assistant", text: res.error, proposals: [], error: true, limit: res.limit, canManage: res.canManage },
      ]);
      if (res.ok) setModel(res.model);
    });
  };

  const updateProposal = (msgId: string, proposalId: string, patch: Partial<ProposalState>) =>
    setMessages((all) =>
      all.map((m) =>
        m.id === msgId && m.role === "assistant"
          ? { ...m, proposals: m.proposals.map((p) => (p.proposal.id === proposalId ? { ...p, ...patch } : p)) }
          : m,
      ),
    );

  const approve = async (msgId: string, p: ProposalState) => {
    updateProposal(msgId, p.proposal.id, { state: "approving" });
    const res = await approveProposal(p.token);
    if (res.ok) {
      updateProposal(msgId, p.proposal.id, { state: "approved", info: `${res.saved} data absensi tersimpan.` });
      router.refresh();
    } else {
      updateProposal(msgId, p.proposal.id, { state: "error", info: res.error });
    }
  };

  return (
    <>
      {/* Tombol mengambang */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="smart-ai-panel"
        className={`fixed bottom-24 md:bottom-5 right-5 z-[70] flex items-center gap-2 rounded-full pl-3.5 pr-4 py-3 font-semibold text-sm text-black bg-gradient-to-r from-brand to-teal-300 shadow-[0_0_25px_rgba(0,210,255,0.45)] hover:brightness-105 active:scale-[0.98] transition ${
          open ? "opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto" : ""
        }`}
      >
        <Icon name={open ? "close" : "auto_awesome"} className="text-[20px]" />
        <span className="hidden sm:inline">{open ? "Tutup" : "Smart AI"}</span>
      </button>

      {/* Panel chat */}
      {open && (
        <section
          id="smart-ai-panel"
          role="dialog"
          aria-label="Smart AI Analytics"
          className="fixed z-[80] inset-0 md:inset-auto md:bottom-24 md:right-5 md:w-[440px] md:h-[min(640px,calc(100vh-8rem))] flex flex-col bg-shell md:rounded-2xl border border-line shadow-2xl shadow-black/70 overflow-hidden"
        >
          <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line bg-shell">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand to-indigo-500 flex items-center justify-center text-black flex-shrink-0">
                <Icon name="auto_awesome" className="text-[18px]" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-ink">Smart AI Analytics</h2>
                <p className="text-[10px] text-gray-400 truncate">{model ?? "Tanya apa saja tentang data absensi"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  title="Mulai percakapan baru"
                  aria-label="Mulai percakapan baru"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-ink hover:bg-panel-raised"
                >
                  <Icon name="restart_alt" className="text-[18px]" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup Smart AI"
                className="p-1.5 rounded-lg text-gray-400 hover:text-ink hover:bg-panel-raised"
              >
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl border border-line bg-panel p-3.5 text-xs text-gray-300 leading-relaxed">
                  Halo! Saya membaca data absensi, cabang, dan karyawan secara langsung untuk menjawab pertanyaan Anda. Saya juga bisa
                  menyiapkan <b className="text-ink">usulan pengisian absensi</b>. Perubahan baru tersimpan setelah Anda menekan{" "}
                  <b className="text-emerald-300">Setujui</b>.
                </div>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-line-strong bg-panel text-gray-200 hover:border-cyan-500/50 hover:text-ink transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500">
                  Belum tersambung? Atur model AI di{" "}
                  <Link href="/pengaturan/ai" className="text-cyan-400 hover:text-cyan-300">
                    Pengaturan &gt; Konektor AI
                  </Link>
                  .
                </p>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-brand/15 border border-brand/30 px-3.5 py-2 text-xs text-ink whitespace-pre-wrap">
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="self-start max-w-[95%] flex flex-col gap-2">
                  <div
                    className={`rounded-2xl rounded-bl-md px-3.5 py-2.5 text-xs leading-relaxed ${
                      m.limit
                        ? "bg-amber-950/30 border border-amber-500/40 text-amber-100"
                        : m.error
                          ? "bg-rose-950/30 border border-rose-500/30 text-rose-200"
                          : "bg-panel border border-line text-gray-200"
                    }`}
                  >
                    {m.limit ? (
                      <div className="flex gap-2">
                        <Icon name="speed" className="text-[16px] text-amber-400 flex-shrink-0" />
                        <div className="space-y-1.5">
                          <p className="font-semibold">Model AI kena limit</p>
                          <p>{m.text}</p>
                          {m.canManage ? (
                            <Link href="/pengaturan/ai" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 text-black font-semibold">
                              <Icon name="swap_horiz" className="text-[14px]" />
                              Ganti model / platform
                            </Link>
                          ) : (
                            <p className="text-amber-300">Minta admin mengganti model di Pengaturan &gt; Konektor AI.</p>
                          )}
                        </div>
                      </div>
                    ) : m.error ? (
                      <p className="flex gap-2">
                        <Icon name="error" className="text-[16px] text-rose-400 flex-shrink-0" />
                        <span>
                          {m.text}{" "}
                          {m.text.includes("Konektor") && (
                            <Link href="/pengaturan/ai" className="underline text-rose-100">
                              Buka Konektor AI
                            </Link>
                          )}
                        </span>
                      </p>
                    ) : (
                      <div className="ai-markdown space-y-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_h1,&_h2,&_h3]:font-bold [&_h1,&_h2,&_h3]:text-ink [&_table]:w-full [&_table]:text-[11px] [&_table]:border-collapse [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-300 [&_th]:border-b [&_th]:border-line-strong [&_th]:py-1 [&_th]:pr-2 [&_td]:py-1 [&_td]:pr-2 [&_td]:border-b [&_td]:border-line [&_code]:font-mono [&_code]:text-cyan-300 [&_a]:text-cyan-400 [&_a]:underline">
                        <div className="overflow-x-auto">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                  {m.proposals.map((p) => (
                    <ProposalCard
                      key={p.proposal.id}
                      p={p}
                      onApprove={() => approve(m.id, p)}
                      onReject={() => updateProposal(m.id, p.proposal.id, { state: "rejected", info: "Usulan ditolak." })}
                    />
                  ))}
                </div>
              ),
            )}

            {thinking && (
              <div className="self-start flex items-center gap-2 rounded-2xl rounded-bl-md bg-panel border border-line px-3.5 py-2.5 text-xs text-gray-400">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </span>
                Menganalisis data absensi…
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-line bg-shell p-3 flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              maxLength={4000}
              aria-label="Pertanyaan untuk Smart AI"
              placeholder="Tanya soal kehadiran, tren, atau minta isi absensi…"
              className="flex-1 resize-none max-h-32 bg-panel-raised border border-line-strong rounded-xl px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              aria-label="Kirim"
              className="w-9 h-9 rounded-xl bg-brand text-black flex items-center justify-center hover:bg-brand/90 disabled:opacity-40 transition"
            >
              <Icon name="send" className="text-[18px]" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function ProposalCard({ p, onApprove, onReject }: { p: ProposalState; onApprove: () => void; onReject: () => void }) {
  const { proposal } = p;
  const done = p.state === "approved" || p.state === "rejected";
  return (
    <div
      className={`rounded-xl border p-3 text-xs flex flex-col gap-2.5 ${
        p.state === "approved"
          ? "border-emerald-500/40 bg-emerald-950/20"
          : p.state === "rejected"
            ? "border-gray-600/40 bg-panel opacity-75"
            : "border-amber-500/40 bg-amber-950/15"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-ink flex items-center gap-1.5">
            <Icon name="edit_note" className="text-[16px] text-amber-300" />
            Usulan perubahan absensi #{proposal.id}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {proposal.branchCode} • {formatDateLong(proposal.date)} • {proposal.changes.length} karyawan
          </div>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${
            p.state === "approved"
              ? "border-emerald-500/40 text-emerald-300"
              : p.state === "rejected"
                ? "border-gray-500/40 text-gray-400"
                : "border-amber-500/40 text-amber-300"
          }`}
        >
          {p.state === "approved" ? "Disetujui" : p.state === "rejected" ? "Ditolak" : "Menunggu persetujuan"}
        </span>
      </div>

      <div className="max-h-48 overflow-y-auto rounded-lg border border-line">
        <table className="w-full text-[11px] border-collapse">
          <thead className="sticky top-0 bg-panel">
            <tr className="text-gray-400 text-left">
              <th scope="col" className="py-1.5 px-2 font-medium">Karyawan</th>
              <th scope="col" className="py-1.5 px-2 font-medium">Perubahan</th>
            </tr>
          </thead>
          <tbody>
            {proposal.changes.map((c) => (
              <tr key={c.employeeId} className="border-t border-line align-top">
                <td className="py-1.5 px-2">
                  <div className="text-gray-100">{c.name}</div>
                  <div className="font-mono text-[10px] text-gray-500">{c.nik}</div>
                </td>
                <td className="py-1.5 px-2">
                  <div className="flex items-center gap-1 flex-wrap">
                    {c.prevStatus ? (
                      <span className={`px-1.5 py-px rounded ${STATUS_CHIP[c.prevStatus]}`}>{ATTENDANCE_LABEL[c.prevStatus]}</span>
                    ) : (
                      <span className="px-1.5 py-px rounded bg-gray-500/15 text-gray-400">Belum diisi</span>
                    )}
                    <Icon name="arrow_forward" className="text-[12px] text-gray-500" />
                    <span className={`px-1.5 py-px rounded font-semibold ${STATUS_CHIP[c.status]}`}>{ATTENDANCE_LABEL[c.status]}</span>
                  </div>
                  {c.note && <div className="text-[10px] text-gray-400 italic mt-0.5">{c.note}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {p.info && <p className={`text-[11px] ${p.state === "error" ? "text-rose-300" : "text-gray-300"}`}>{p.info}</p>}

      {!done && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={p.state === "approving"}
            className="px-3 py-1.5 rounded-lg border border-line-strong text-gray-300 hover:text-ink hover:border-gray-500 transition disabled:opacity-50"
          >
            Tolak
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={p.state === "approving"}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold transition disabled:opacity-60"
          >
            {p.state === "approving" ? (
              <span className="w-3 h-3 rounded-full border-2 border-black border-t-transparent animate-spin" />
            ) : (
              <Icon name="check" className="text-[15px]" />
            )}
            Setujui &amp; Simpan
          </button>
        </div>
      )}
    </div>
  );
}
