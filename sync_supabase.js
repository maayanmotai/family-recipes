const fs = require('fs');

async function sync() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    console.error('Missing SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const raw = fs.readFileSync('backups/backup_master.json', 'utf8');
  const payload = JSON.parse(raw);
  const recipes = payload.data;

  console.log(`Attempting to update master_db with ${recipes.length} recipes...`);

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // Try PATCH first
  let res = await fetch('https://xtaeopklnjxvvnpqhgyx.supabase.co/rest/v1/recipes?id=eq.master_db', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ data: recipes })
  });

  let text = await res.text();
  console.log('PATCH response status:', res.status);

  if (res.ok) {
    let parsed = [];
    try { parsed = JSON.parse(text); } catch (e) {}
    if (parsed.length > 0) {
      console.log('✅ Successfully updated master_db in Supabase via PATCH!');
      return;
    }
  }

  console.log(`PATCH did not match row (status: ${res.status}, response: ${text}). Trying POST with upsert...`);

  // Try POST with on_conflict=id
  res = await fetch('https://xtaeopklnjxvvnpqhgyx.supabase.co/rest/v1/recipes?on_conflict=id', {
    method: 'POST',
    headers: {
      ...headers,
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify({ id: 'master_db', data: recipes })
  });

  text = await res.text();
  console.log('POST response status:', res.status);
  console.log('POST response text:', text);

  if (!res.ok) {
    console.error('❌ Failed to update Supabase:', res.status, text);
    process.exit(1);
  }

  console.log('✅ Successfully upserted master_db in Supabase via POST!');
}

sync().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
