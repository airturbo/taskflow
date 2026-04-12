// Supabase Edge Function: remind
// Deploy with: supabase functions deploy remind --schedule "* * * * *"
// Requires: VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT env vars

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

serve(async () => {
  const now = new Date()
  const windowStart = new Date(now.getTime() - 60_000).toISOString()
  const windowEnd = now.toISOString()

  // Fetch all workspace states
  const { data: workspaces, error } = await supabase
    .from('workspace_states')
    .select('user_id, state_json')

  if (error) {
    console.error('Failed to fetch workspace states:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let triggered = 0

  for (const ws of workspaces ?? []) {
    const state = ws.state_json as { tasks?: Array<{ id: string; title: string; reminders?: Array<{ type: string; remindAt: string }> }> }
    if (!state?.tasks) continue

    for (const task of state.tasks) {
      for (const reminder of task.reminders ?? []) {
        if (reminder.type !== 'absolute') continue
        if (reminder.remindAt >= windowStart && reminder.remindAt < windowEnd) {
          // Fetch push subscriptions for this user
          const { data: subs } = await supabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', ws.user_id)

          for (const sub of subs ?? []) {
            // TODO: send actual Web Push using web-push library
            // For now, log the notification that would be sent
            console.log(`[remind] Would push to ${sub.endpoint}: "${task.title}"`)
            triggered++
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ triggered, timestamp: now.toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
