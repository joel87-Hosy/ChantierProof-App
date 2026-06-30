(function () {
  const client = window.ChantierProof.getClient();
  const form = document.getElementById("auth-form");
  const loginTab = document.getElementById("login-tab");
  const inviteTab = document.getElementById("invite-tab");
  const title = document.getElementById("auth-title");
  const copy = document.getElementById("auth-copy");
  const submit = document.getElementById("auth-submit");
  const errorBox = document.getElementById("auth-error");
  const successBox = document.getElementById("auth-success");
  const inviteTokenField = document.getElementById("invite-token-field");
  const inviteTokenInput = document.getElementById("invite-token");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("toggle-password");
  const config = window.CHANTIERPROOF_CONFIG || {};

  let mode = "login";

  function getEmailRedirectUrl() {
    const publicSiteUrl = (config.publicSiteUrl || "").replace(/\/$/, "");
    if (publicSiteUrl) return `${publicSiteUrl}/login.html`;
    return new URL("./login.html", window.location.href).href;
  }

  function setMode(nextMode) {
    mode = nextMode;
    const isInvite = mode === "invite";
    loginTab.classList.toggle("active", !isInvite);
    inviteTab.classList.toggle("active", isInvite);
    inviteTokenField.classList.toggle("hidden", !isInvite);
    title.textContent = isInvite ? "Activer une invitation" : "Connexion";
    copy.textContent = isInvite
      ? "Saisissez le code fourni par l'admin pour créer votre accès."
      : "Accedez au dashboard de votre entreprise.";
    submit.innerHTML = isInvite
      ? '<i data-lucide="user-check" class="icon"></i>Activer mon compte'
      : '<i data-lucide="log-in" class="icon"></i>Se connecter';
    errorBox.classList.add("hidden");
    successBox.classList.add("hidden");
    window.lucide?.createIcons();
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
    successBox.classList.add("hidden");
  }

  function showSuccess(message) {
    successBox.textContent = message;
    successBox.classList.remove("hidden");
    errorBox.classList.add("hidden");
  }

  async function findInvitation() {
    const token = inviteTokenInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    if (!token) throw new Error("Le code d'invitation est obligatoire.");

    const response = await client
      .from("user_invitations")
      .select("*")
      .eq("token", token)
      .eq("email", email)
      .is("accepted_at", null)
      .single();

    if (response.error) throw new Error("Invitation introuvable ou deja utilisee.");
    return response.data;
  }

  async function handleLogin() {
    const response = await client.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });

    if (response.error) throw response.error;
    window.location.href = "./dashboard.html";
  }

  async function handleInviteActivation() {
    const invitation = await findInvitation();
    const response = await client.auth.signUp({
      email: emailInput.value.trim(),
      password: passwordInput.value,
      options: {
        emailRedirectTo: getEmailRedirectUrl(),
        data: {
          full_name: invitation.full_name,
          role: invitation.role,
          team_name: invitation.team_name
        }
      }
    });

    if (response.error) throw response.error;

    if (!response.data.session || !response.data.user) {
      showSuccess("Compte cree. Verifiez votre email si Supabase demande une confirmation, puis connectez-vous.");
      return;
    }

    const profileResponse = await client.from("profiles").upsert({
      id: response.data.user.id,
      email: response.data.user.email,
      full_name: invitation.full_name,
      role: invitation.role,
      team_id: invitation.team_id,
      team_name: invitation.team_name
    });

    if (profileResponse.error) throw profileResponse.error;

    await client
      .from("user_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    window.location.href = "./profile.html";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;

    try {
      if (mode === "invite") {
        await handleInviteActivation();
      } else {
        await handleLogin();
      }
    } catch (error) {
      console.error("Auth failed:", error);
      showError(error.message || "Action impossible. Verifiez les informations saisies.");
    } finally {
      submit.disabled = false;
    }
  });

  loginTab.addEventListener("click", () => setMode("login"));
  inviteTab.addEventListener("click", () => setMode("invite"));
  togglePassword.addEventListener("click", () => {
    const shouldShow = passwordInput.type === "password";
    passwordInput.type = shouldShow ? "text" : "password";
    togglePassword.setAttribute("aria-label", shouldShow ? "Masquer le mot de passe" : "Afficher le mot de passe");
    togglePassword.setAttribute("aria-pressed", String(shouldShow));
    togglePassword.innerHTML = `<i data-lucide="${shouldShow ? "eye-off" : "eye"}" class="icon"></i>`;
    window.lucide?.createIcons();
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("invite")) {
    inviteTokenInput.value = params.get("invite");
    emailInput.value = params.get("email") || "";
    setMode("invite");
  } else {
    setMode("login");
  }
})();
