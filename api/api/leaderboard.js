// api/leaderboard.js
import { createClient } from '@supabase/supabase-js';

// Create a single Supabase client for this function
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use the service role key on the server for full control (still safe because this file runs server-side only)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

export default async function handler(req, res) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not initialized. Check environment variables.' });
  }

  if (req.method === 'GET') {
    return handleGetLeaderboard(req, res, supabase);
  }

  if (req.method === 'POST') {
    return handlePostScore(req, res, supabase);
  }

  // Method not allowed
  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

/**
 * GET /api/leaderboard
 * Optional query params:
 *   - limit (default 10, max 50)
 */
async function handleGetLeaderboard(req, res, supabase) {
  try {
    const { limit: rawLimit } = req.query;
    let limit = parseInt(rawLimit, 10);
    if (Number.isNaN(limit) || limit <= 0) limit = 10;
    if (limit > 50) limit = 50;

    const { data, error } = await supabase
      .from('leaderboard_scores')
      .select('*')
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase select error:', error);
      return res.status(500).json({ error: 'Failed to load leaderboard' });
    }

    // Return as { scores: [...] }
    return res.status(200).json({ scores: data || [] });
  } catch (err) {
    console.error('Unexpected error in GET /api/leaderboard:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

/**
 * POST /api/leaderboard
 * Body JSON example:
 * {
 *   "playerName": "Nir",
 *   "score": 12345,
 *   "stage": 7,
 *   "totalCorrect": 42,
 *   "achievements": ["correct_100", "rich"]
 * }
 */
async function handlePostScore(req, res, supabase) {
  try {
    const {
      playerName,
      score,
      stage,
      totalCorrect,
      achievements
    } = req.body || {};

    // Basic validation & sanitization
    const name = String(playerName || 'Guest').trim().slice(0, 30) || 'Guest';

    if (typeof score !== 'number' || Number.isNaN(score) || score < 0) {
      return res.status(400).json({ error: 'Invalid "score". Must be a non-negative number.' });
    }

    const safeStage =
      Number.isInteger(stage) && stage > 0 ? stage : 1;
    const safeTotalCorrect =
      Number.isInteger(totalCorrect) && totalCorrect >= 0 ? totalCorrect : 0;

    const safeAchievements = Array.isArray(achievements)
      ? achievements
          .map((a) => String(a).trim())
          .filter((a) => a.length > 0)
      : [];

    // 1) Insert into leaderboard_scores
    const { data: insertedRows, error: insertError } = await supabase
      .from('leaderboard_scores')
      .insert({
        player_name: name,
        score,
        stage: safeStage,
        total_correct: safeTotalCorrect,
        achievements: safeAchievements
      })
      .select('*')
      .limit(1);

    if (insertError) {
      console.error('Supabase insert error (leaderboard_scores):', insertError);
      return res.status(500).json({ error: 'Failed to save score' });
    }

    const insertedScore = insertedRows && insertedRows[0] ? insertedRows[0] : null;

    // 2) Upsert player_achievements (global achievements per player)
    if (safeAchievements.length > 0) {
      const achievementRows = safeAchievements.map((id) => ({
        player_name: name,
        achievement_id: id
      }));

      const { error: achError } = await supabase
        .from('player_achievements')
        .upsert(achievementRows, {
          onConflict: 'player_name,achievement_id',
          ignoreDuplicates: true
        });

      if (achError) {
        // Not critical enough to fail the request, but log it
        console.error('Supabase upsert error (player_achievements):', achError);
      }
    }

    return res.status(201).json({ score: insertedScore });
  } catch (err) {
    console.error('Unexpected error in POST /api/leaderboard:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
