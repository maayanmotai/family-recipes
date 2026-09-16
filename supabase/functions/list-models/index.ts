import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
serve(async (req) => { 
  const key = Deno.env.get("GEMINI_API_KEY"); 
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + key); 
  const d = await r.json(); 
  return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } }); 
});
