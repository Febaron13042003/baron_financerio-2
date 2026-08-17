// ==========================================================================
// Baron Financeiro — Autenticação (Supabase Auth)
// Carregado apenas em modo online. No modo desktop (file://) é ignorado.
// ==========================================================================

const Auth = {
  client: null,
  user: null,

  // Inicializa o cliente Supabase. Retorna false se não está em modo online
  // ou se config.js ainda não foi preenchido.
  init() {
    if (!IS_ONLINE_MODE) return false;
    if (typeof supabase === "undefined") {
      console.error("Supabase SDK não carregou — sem internet?");
      return false;
    }
    this.client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return true;
  },

  async getUser() {
    if (!this.client) return null;
    const { data } = await this.client.auth.getUser();
    this.user = data.user || null;
    return this.user;
  },

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user;
    return data.user;
  },

  async signUp(email, password) {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    return data.user;
  },

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.user = null;
    location.reload();
  },

  // Renderiza tela de login. Resolve a Promise quando o usuário loga.
  showLoginScreen() {
    return new Promise((resolve) => {
      const root = document.getElementById("auth-root");
      const html = `
        <div class="auth-overlay">
          <div class="auth-card">
            <div class="auth-brand">
              <div class="auth-logo">B</div>
              <div>
                <div class="auth-title">Baron Financeiro</div>
                <div class="auth-sub">Controle pessoal e familiar</div>
              </div>
            </div>

            <div class="auth-tabs">
              <button class="auth-tab active" data-mode="signin">Entrar</button>
              <button class="auth-tab" data-mode="signup">Criar conta</button>
            </div>

            <form id="auth-form" autocomplete="on">
              <div class="form-field full">
                <label>Email</label>
                <input type="email" name="email" required autocomplete="email" autofocus>
              </div>
              <div class="form-field full">
                <label>Senha</label>
                <input type="password" name="password" required autocomplete="current-password" minlength="6">
              </div>
              <div id="auth-error" class="auth-error hidden"></div>
              <button type="submit" class="btn btn-primary btn-block" id="auth-submit" style="margin-top:14px;">Entrar</button>
            </form>

            <div class="auth-hint">
              💡 Compartilhe email e senha com sua família — todos verão os mesmos dados em tempo real.
            </div>
          </div>
        </div>
      `;
      root.innerHTML = html;
      root.classList.remove("hidden");

      let mode = "signin";
      root.querySelectorAll(".auth-tab").forEach(t => {
        t.addEventListener("click", () => {
          mode = t.dataset.mode;
          root.querySelectorAll(".auth-tab").forEach(x => x.classList.toggle("active", x === t));
          document.getElementById("auth-submit").textContent = mode === "signup" ? "Criar conta" : "Entrar";
          document.querySelector("input[name='password']").autocomplete = mode === "signup" ? "new-password" : "current-password";
          this._clearError();
        });
      });

      document.getElementById("auth-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const email = fd.get("email");
        const password = fd.get("password");
        const btn = document.getElementById("auth-submit");
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = mode === "signup" ? "Criando..." : "Entrando...";
        try {
          if (mode === "signup") {
            await this.signUp(email, password);
            // Após signUp, faz login automático
            await this.signIn(email, password);
          } else {
            await this.signIn(email, password);
          }
          root.classList.add("hidden");
          root.innerHTML = "";
          resolve(this.user);
        } catch (err) {
          this._showError(this._friendlyError(err));
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    });
  },

  _showError(msg) {
    const el = document.getElementById("auth-error");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  },

  _clearError() {
    const el = document.getElementById("auth-error");
    if (el) el.classList.add("hidden");
  },

  _friendlyError(err) {
    const m = (err.message || "").toLowerCase();
    if (m.includes("invalid login")) return "Email ou senha incorretos";
    if (m.includes("email not confirmed")) return "Email não confirmado. Veja sua caixa de entrada.";
    if (m.includes("user already registered")) return "Este email já tem cadastro. Use Entrar.";
    if (m.includes("password should be at least")) return "Senha precisa ter pelo menos 6 caracteres";
    if (m.includes("network")) return "Sem internet. Tente novamente.";
    return err.message || "Erro inesperado. Tente novamente.";
  },

  // Garante que o usuário está logado. Se não, mostra tela de login e espera.
  async requireLogin() {
    if (!this.init()) return null; // modo offline
    const existing = await this.getUser();
    if (existing) return existing;
    return await this.showLoginScreen();
  }
};
