import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:push@dailybrain.app"

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface Task {
  id: string
  title: string
  due_at: string | null
  workspace_id: string
  assignee_id: string | null
  author_id: string
}

interface PushToken {
  token: string
  platform: string
  endpoint: string | null
  p256dh: string | null
  auth: string | null
}

interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  })
}

async function sendExpoPush(tokens: PushToken[], payload: PushPayload) {
  const messages = tokens
    .filter((t) => t.platform !== "web" && t.token.startsWith("ExponentPushToken"))
    .map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: "default",
      priority: "high",
    }))

  if (messages.length === 0) return

  // Expo Push API supports batches of up to 100
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      })
    } catch (err) {
      console.error("Expo push error:", err)
    }
  }
}

async function sendWebPush(tokens: PushToken[], payload: PushPayload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return

  const webTokens = tokens.filter(
    (t) => t.platform === "web" && t.endpoint && t.p256dh && t.auth
  )
  if (webTokens.length === 0) return

  // Web Push requires crypto signing - use the web-push compatible approach
  // For Deno Edge Functions, we use a lightweight implementation
  for (const t of webTokens) {
    try {
      const { default: webpush } = await import("https://esm.sh/web-push@3.6.7")
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
      await webpush.sendNotification(
        { endpoint: t.endpoint!, keys: { p256dh: t.p256dh!, auth: t.auth! } },
        JSON.stringify(payload)
      )
    } catch (err) {
      console.error("Web push error:", err)
    }
  }
}

async function sendPushToTokens(tokens: PushToken[], payload: PushPayload) {
  await Promise.all([sendExpoPush(tokens, payload), sendWebPush(tokens, payload)])
}

Deno.serve(async (req) => {
  // Allow both POST and GET (for pg_cron compatibility)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  const now = new Date()
  const oneMinAgo = new Date(now.getTime() - 60_000).toISOString()
  const nowIso = now.toISOString()
  const in14Min = new Date(now.getTime() + 14 * 60_000).toISOString()
  const in16Min = new Date(now.getTime() + 16 * 60_000).toISOString()

  try {
    // Find tasks due NOW (within last minute)
    const { data: dueNow } = await supabase
      .from("tasks")
      .select("id, title, due_at, workspace_id, assignee_id, author_id")
      .is("deleted_at", null)
      .not("status", "in", '("done","cancelled")')
      .gte("due_at", oneMinAgo)
      .lte("due_at", nowIso)

    // Find tasks due in ~15 minutes
    const { data: dueSoon } = await supabase
      .from("tasks")
      .select("id, title, due_at, workspace_id, assignee_id, author_id")
      .is("deleted_at", null)
      .not("status", "in", '("done","cancelled")')
      .gte("due_at", in14Min)
      .lte("due_at", in16Min)

    let notifCount = 0

    for (const task of (dueNow ?? []) as Task[]) {
      if (!task.due_at) continue

      // Skip if already notified for this exact due_at (reschedule = new due_at = new reminders)
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("task_id", task.id)
        .eq("type", "task_due_now")
        .eq("task_due_at", task.due_at)

      if ((count ?? 0) > 0) continue

      const userId = task.assignee_id ?? task.author_id

      const { data: notif } = await supabase
        .from("notifications")
        .insert({
          workspace_id: task.workspace_id,
          user_id: userId,
          task_id: task.id,
          type: "task_due_now",
          title: "Aufgabe fällig",
          body: task.title,
          task_due_at: task.due_at,
        })
        .select("id")
        .single()

      const { data: tokens } = await supabase
        .from("push_tokens")
        .select("token, platform, endpoint, p256dh, auth")
        .eq("user_id", userId)

      if (tokens && tokens.length > 0 && notif) {
        await sendPushToTokens(tokens as PushToken[], {
          title: "Aufgabe fällig",
          body: task.title,
          data: { type: "task_due_now", taskId: task.id, notificationId: notif.id },
        })
      }
      notifCount++
    }

    for (const task of (dueSoon ?? []) as Task[]) {
      if (!task.due_at) continue

      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("task_id", task.id)
        .eq("type", "task_due_soon")
        .eq("task_due_at", task.due_at)

      if ((count ?? 0) > 0) continue

      const userId = task.assignee_id ?? task.author_id
      const timeStr = formatTime(new Date(task.due_at))

      const { data: notif } = await supabase
        .from("notifications")
        .insert({
          workspace_id: task.workspace_id,
          user_id: userId,
          task_id: task.id,
          type: "task_due_soon",
          title: "Erinnerung: in 15 Min fällig",
          body: `${task.title}${timeStr ? ` um ${timeStr}` : ""}`,
          task_due_at: task.due_at,
        })
        .select("id")
        .single()

      const { data: tokens } = await supabase
        .from("push_tokens")
        .select("token, platform, endpoint, p256dh, auth")
        .eq("user_id", userId)

      if (tokens && tokens.length > 0 && notif) {
        await sendPushToTokens(tokens as PushToken[], {
          title: "Erinnerung: in 15 Min fällig",
          body: `${task.title}${timeStr ? ` um ${timeStr}` : ""}`,
          data: { type: "task_due_soon", taskId: task.id, notificationId: notif.id },
        })
      }
      notifCount++
    }

    return new Response(JSON.stringify({ ok: true, notifications: notifCount }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("send-reminders error:", err)
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
