(function () {
  const config = window.CHANTIERPROOF_CONFIG || {};

  window.ChantierProof = window.ChantierProof || {};
  window.ChantierProof.getClient = function () {
    if (!window.supabase) {
      throw new Error("Supabase JS n'est pas charge.");
    }

    if (!config.supabaseUrl || config.supabaseUrl.includes("YOUR_PROJECT")) {
      console.warn("Configure lib/config.js avec ton URL Supabase et ta cle anon.");
    }

    return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  };

  window.ChantierProof.getValidationId = function () {
    return new URLSearchParams(window.location.search).get("id");
  };

  window.ChantierProof.formatDate = function (value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  };

  window.lucide?.createIcons();
})();
