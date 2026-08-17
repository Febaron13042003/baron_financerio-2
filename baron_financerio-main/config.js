// ==========================================================================
// Baron Financeiro — Configuração do Supabase
//
// COMO PREENCHER:
// 1) Acesse https://supabase.com → seu projeto
// 2) Settings → API
// 3) Copie "Project URL" pra SUPABASE_URL
// 4) Copie "anon public" pra SUPABASE_ANON_KEY
// 5) Salve este arquivo
//
// IMPORTANTE: a "anon key" pode ir pública sem problema —
// a segurança está nas Row Level Security policies do banco.
// ==========================================================================

const SUPABASE_URL = "https://dfthhisavlgphtvotkjs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmdGhoaXNhdmxncGh0dm90a2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NzE3OTQsImV4cCI6MjA5MzQ0Nzc5NH0.niWaskQcCGGZOwVW_Kwh3Ft1pjl1EWSLFRvMfg3IoHU";

// Auto-detecta se o app está rodando online (https://) ou local (file://).
// Local = modo desktop, usa localStorage (como sempre).
// Online = usa Supabase (login + sync entre dispositivos).
const IS_ONLINE_MODE = location.protocol.startsWith("http") &&
                       !SUPABASE_URL.startsWith("<") &&
                       !SUPABASE_ANON_KEY.startsWith("<");
