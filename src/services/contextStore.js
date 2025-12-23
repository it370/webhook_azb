const { getSupabaseClient } = require("./supabaseClient");

const CONV_TABLE = "conversations";
const MSG_TABLE = "conversation_messages";

async function ensureConversation(userId, retentionDays = 7) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return null;

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: existing, error: fetchErr } = await supabase
    .from(CONV_TABLE)
    .select("id, created_at")
    .eq("user_id", userId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  if (fetchErr) {
    console.warn("conversation fetch failed", fetchErr);
    return null;
  }

  if (existing && existing.length) {
    return existing[0].id;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from(CONV_TABLE)
    .insert({ user_id: userId })
    .select("id")
    .limit(1);

  if (insertErr) {
    console.warn("conversation insert failed", insertErr);
    return null;
  }

  return inserted?.[0]?.id || null;
}

async function loadRecentMessages(conversationId, { windowMinutes = 120, maxTurns = 10 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase || !conversationId) return [];

  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from(MSG_TABLE)
    .select("role, text, created_at")
    .eq("conversation_id", conversationId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(maxTurns * 2); // user+assistant pairs

  if (error) {
    console.warn("conversation load failed", error);
    return [];
  }

  return data || [];
}

async function saveMessages(conversationId, messages = []) {
  const supabase = getSupabaseClient();
  if (!supabase || !conversationId || !messages.length) return;

  const rows = messages.map((m) => ({
    conversation_id: conversationId,
    role: m.role,
    text: m.text,
  }));

  const { error } = await supabase.from(MSG_TABLE).insert(rows);
  if (error) {
    console.warn("conversation save failed", error);
  }
}

module.exports = { ensureConversation, loadRecentMessages, saveMessages };

