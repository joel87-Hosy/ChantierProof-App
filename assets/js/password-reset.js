(function () {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const copy = document.getElementById("reset-copy");
  const form = document.getElementById("reset-form");
  const passwordInput = document.getElementById("reset-password");
  const confirmInput = document.getElementById("reset-confirm");
  const errorBox = document.getElementById("reset-error");
  const successBox = document.getElementById("reset-success");
  const submitButton = document.getElementById("reset-submit");
  let csrfToken = "";

  async function request(action, options = {}) {
    const { query = {}, ...fetchOptions } = options;
    const headers = new Headers(options.headers || {});
    if (fetchOptions.body) headers.set("Content-Type", "application/json");
    if (csrfToken && fetchOptions.method && fetchOptions.method !== "GET") {
      headers.set("X-CSRF-Token", csrfToken);
    }
    const params = new URLSearchParams({ action });
    Object.entries(query).forEach(([key, value]) => params.set(key, String(value)));
    const response = await fetch(`./api/index.php?${params.toString()}`, {
      ...fetchOptions,
      headers,
      credentials: "same-origin",
      cache: "no-store"
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("Le serveur a renvoyé une réponse invalide.");
    }
    if (!response.ok || !result.ok) throw new Error(result.error || "La demande a échoué.");
    return result;
  }

  async function initialize() {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Lien de réinitialisation invalide.");
    const session = await request("session");
    csrfToken = session.csrfToken;
    const result = await request("password-reset", { query: { token } });
    copy.textContent = `Choisissez un nouveau mot de passe pour ${result.email}. Le lien ne peut être utilisé qu’une fois.`;
    form.classList.remove("hidden");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");
    successBox.classList.add("hidden");
    if (passwordInput.value !== confirmInput.value) {
      errorBox.textContent = "Les mots de passe ne correspondent pas.";
      errorBox.classList.remove("hidden");
      return;
    }
    submitButton.disabled = true;
    try {
      await request("password-reset", {
        method: "POST",
        body: JSON.stringify({ token, password: passwordInput.value })
      });
      form.classList.add("hidden");
      copy.textContent = "Votre mot de passe a été modifié.";
      successBox.textContent = "Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.";
      successBox.classList.remove("hidden");
    } catch (error) {
      console.error("Password reset failed:", error);
      errorBox.textContent = error.message || "Impossible de réinitialiser le mot de passe.";
      errorBox.classList.remove("hidden");
    } finally {
      submitButton.disabled = false;
    }
  });

  initialize().catch((error) => {
    console.error("Password reset initialization failed:", error);
    copy.textContent = error.message || "Lien invalide ou expiré.";
  });
})();
