(function () {
  const form = document.getElementById("auth-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const submit = document.getElementById("auth-submit");
  const errorBox = document.getElementById("auth-error");
  const togglePassword = document.getElementById("toggle-password");
  const activationForm = document.getElementById("activation-form");
  const activationEmail = document.getElementById("activation-email");
  const activationPassword = document.getElementById("activation-password");
  const activationCopy = document.getElementById("activation-copy");
  const activationError = document.getElementById("activation-error");
  const activationSubmit = document.getElementById("activation-submit");
  const toggleActivationPassword = document.getElementById("toggle-activation-password");
  const title = document.getElementById("auth-title");
  const copy = document.getElementById("auth-copy");
  let csrfToken = "";
  let invitationToken = "";
  submit.disabled = true;

  async function request(action, options = {}) {
    const { query = {}, ...fetchOptions } = options;
    const headers = new Headers(fetchOptions.headers || {});
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
      throw new Error("Le serveur a renvoyé une réponse invalide. Réessayez plus tard.");
    }
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "La demande n'a pas pu aboutir.");
    }
    return result;
  }

  function redirectForProfile(profile) {
    if (!profile || typeof profile.role !== "string") {
      throw new Error("Le profil du compte est introuvable. Contactez votre administrateur.");
    }
    window.location.href = profile.role === "super_admin" ? "./super-admin.html" : "./dashboard.html";
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function toggleVisibility(input, button) {
    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    button.setAttribute("aria-label", shouldShow ? "Masquer le mot de passe" : "Afficher le mot de passe");
    button.setAttribute("aria-pressed", String(shouldShow));
    button.innerHTML = `<i data-lucide="${shouldShow ? "eye-off" : "eye"}" class="icon"></i>`;
    window.lucide?.createIcons();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    errorBox.classList.add("hidden");
    try {
      const result = await request("login", {
        method: "POST",
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value
        })
      });
      csrfToken = result.csrfToken;
      redirectForProfile(result.profile);
    } catch (error) {
      console.error("Hostinger login failed:", error);
      showError(error.message || "Connexion impossible. Vérifiez les informations saisies.");
    } finally {
      submit.disabled = false;
    }
  });

  activationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    activationSubmit.disabled = true;
    activationError.classList.add("hidden");
    try {
      const result = await request("accept-invitation", {
        method: "POST",
        body: JSON.stringify({
          token: invitationToken,
          email: activationEmail.value,
          password: activationPassword.value
        })
      });
      csrfToken = result.csrfToken;
      redirectForProfile(result.profile);
    } catch (error) {
      console.error("Invitation activation failed:", error);
      activationError.textContent = error.message || "Impossible d'activer cette invitation.";
      activationError.classList.remove("hidden");
    } finally {
      activationSubmit.disabled = false;
    }
  });

  togglePassword.addEventListener("click", () => toggleVisibility(passwordInput, togglePassword));
  toggleActivationPassword.addEventListener("click", () => toggleVisibility(activationPassword, toggleActivationPassword));
  document.getElementById("return-login").addEventListener("click", () => {
    window.location.href = "./login.html";
  });

  async function initialize() {
    const params = new URLSearchParams(window.location.search);
    invitationToken = params.get("invite") || "";
    const invitedEmail = params.get("email") || "";
    const isActivation = invitationToken !== "" || invitedEmail !== "";
    if (isActivation) {
      form.classList.add("hidden");
      activationForm.classList.remove("hidden");
      title.textContent = "Activer votre compte";
      copy.textContent = "Définissez votre mot de passe pour finaliser l'invitation.";
      activationEmail.value = invitedEmail;
    }

    try {
      const session = await request("session");
      csrfToken = session.csrfToken;
      if (session.profile) {
        redirectForProfile(session.profile);
        return;
      }

      if (!isActivation) {
        submit.disabled = false;
        return;
      }
      if (!invitationToken || !invitedEmail) {
        throw new Error("Le lien d'invitation est incomplet.");
      }

      const result = await request("invitation", {
        query: { token: invitationToken, email: invitedEmail }
      });
      activationEmail.value = result.invitation.email;
      activationCopy.textContent = `Bonjour ${result.invitation.full_name}, votre invitation comme ${result.invitation.role} est valide.`;
      activationSubmit.disabled = false;
    } catch (error) {
      console.error("Hostinger session initialization failed:", error);
      if (isActivation) {
        activationError.textContent = error.message || "Cette invitation n'est plus valide.";
        activationError.classList.remove("hidden");
      } else {
        showError(error.message || "Le service de connexion est indisponible.");
      }
    }
  }

  initialize();
  window.lucide?.createIcons();
})();
