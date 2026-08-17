// ==========================================================================
// Baron Financeiro — Remote Store (Supabase)
// Implementa a mesma interface conceitual do Store local, mas persiste
// num Postgres da Supabase. Carregado apenas em modo online.
// ==========================================================================

const RemoteStore = {
  _saveTimer: null,
  _lastSaveAt: 0,

  async load() {
    if (!Auth.client || !Auth.user) {
      throw new Error("Auth não inicializado");
    }
    const { data, error } = await Auth.client
      .from("app_state")
      .select("data")
      .eq("user_id", Auth.user.id)
      .maybeSingle();
    if (error) throw error;

    if (!data || !data.data || Object.keys(data.data).length === 0) {
      // Primeiro acesso: cria estado inicial e persiste
      const initial = buildSeedState();
      await this._upsert(initial);
      return initial;
    }
    return migrateState(data.data);
  },

  // Persiste o estado completo. Chamado pelo Store._persist quando em modo remoto.
  // Usa debounce pra não sobrecarregar o banco em cliques rápidos.
  schedulePersist(state) {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._upsert(state).catch(err => {
        console.error("Falha ao gravar no Supabase:", err);
        if (Store.onStatusChange) {
          Store.onStatusChange({ kind: "error", msg: "Falha ao salvar online: " + err.message });
        }
      });
    }, 500);
  },

  async _upsert(state) {
    const { error } = await Auth.client
      .from("app_state")
      .upsert(
        { user_id: Auth.user.id, data: state, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (error) throw error;
    this._lastSaveAt = Date.now();
    if (Store.onStatusChange) {
      Store.onStatusChange({ kind: "ok", msg: "Salvo na nuvem" });
    }
  }
};
