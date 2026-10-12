(function () {
  const form = document.getElementById("invite-form");
  const errorBox = document.getElementById("invite-error");
  const linkBox = document.getElementById("invite-link-box");
  const table = document.getElementById("invitations-table");
  const membersTable = document.getElementById("company-users-table");
  const membersError = document.getElementById("members-error");
  const resetLinkBox = document.getElementById("password-reset-link-box");
  const submitButton = form.querySelector('[type="submit"]');
  const fullNameInput = document.getElementById("invite-full-name");
  const emailInput = document.getElementById("invite-email");
  const roleInput = document.getElementById("invite-role");
  const teamInput = document.getElementById("invite-team");
  let csrfToken = "";

  async function apiRequest(action, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set("Content-Type", "application/json");
    if (csrfToken && options.method && options.method !== "GET") {
      headers.set("X-CSRF-Token", csrfToken);
    }

    const response = await fetch(`./api/index.php?action=${encodeURIComponent(action)}`, {
      ...options,
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

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
    linkBox.classList.add("hidden");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(`${String(value).replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC"
    }).format(date);
  }

  function invitationUrl(token, email) {
    const url = new URL("./login.html", window.location.href);
    url.searchParams.set("invite", token);
    url.searchParams.set("email", email);
    return url.href;
  }

  async function requireAdmin() {
    const session = await apiRequest("session");
    csrfToken = session.csrfToken;
    if (!session.profile) {
      window.location.href = "./login.html";
      return false;
    }
    if (session.profile.role !== "admin" || !session.profile.company_id) {
      showError("Accès réservé à un administrateur d'entreprise.");
      form.querySelectorAll("input, select, button").forEach((element) => {
        element.disabled = true;
      });
      return false;
    }
    return true;
  }

  async function loadInvitations() {
    const result = await apiRequest("invitations");
    const rows = result.invitations || [];
    table.innerHTML = rows.length ? rows.map((row) => {
      const isExpired = row.expires_at && new Date(`${String(row.expires_at).replace(" ", "T")}Z`) <= new Date();
      const link = invitationUrl(row.token, row.email);
      return `
        <tr class="border-b">
          <td class="px-4 py-3 font-medium">${escapeHtml(row.full_name || "-")}</td>
          <td class="px-4 py-3 text-slate-600">${escapeHtml(row.email)}</td>
          <td class="px-4 py-3 text-slate-600">${escapeHtml(row.role)}</td>
          <td class="px-4 py-3 text-slate-600">${escapeHtml(row.team_name || "-")}</td>
          <td class="px-4 py-3 text-slate-600">
            <a class="font-semibold text-blue-700" href="${escapeHtml(link)}" target="_blank" rel="noopener">Ouvrir le lien</a>
            <p class="text-xs ${isExpired ? "text-red-600" : "text-slate-500"}">${isExpired ? "Invitation expirée" : `Jusqu'au ${escapeHtml(formatDate(row.expires_at))}`}</p>
          </td>
          <td class="px-4 py-3 text-right">
            <button class="icon-btn icon-btn-danger delete-invitation" type="button" data-id="${escapeHtml(row.id)}" data-email="${escapeHtml(row.email)}" aria-label="Supprimer l'invitation de ${escapeHtml(row.email)}">
              <i data-lucide="trash-2" class="icon"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("") : '<tr><td class="px-4 py-3 text-slate-500" colspan="6">Aucune invitation en attente.</td></tr>';
    window.lucide?.createIcons();
  }

  async function loadCompanyUsers() {
    const result = await apiRequest("company-users");
    const users = result.users || [];
    membersTable.innerHTML = users.length ? users.map((user) => `
      <tr class="border-b">
        <td class="px-4 py-3 font-medium">${escapeHtml(user.full_name || "-")}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(user.email)}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(user.role)}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(user.team_name || "-")}</td>
        <td class="px-4 py-3 text-right">
          <button class="btn btn-secondary btn-sm create-reset-link" type="button"
            data-user-id="${escapeHtml(user.id)}" data-email="${escapeHtml(user.email)}">
            Générer un lien
          </button>
        </td>
      </tr>
    `).join("") : '<tr><td class="px-4 py-3 text-slate-500" colspan="5">Aucun compte dans l’entreprise.</td></tr>';
  }

  async function createResetLink(userId, email, button) {
    if (!window.confirm(`Générer un nouveau lien de réinitialisation pour ${email} ? Tout ancien lien sera invalidé.`)) return;
    button.disabled = true;
    membersError.classList.add("hidden");
    resetLinkBox.classList.add("hidden");
    try {
      const result = await apiRequest("password-reset-link", {
        method: "POST",
        body: JSON.stringify({ user_id: userId })
      });
      const url = new URL("./password-reset.html", window.location.href);
      url.searchParams.set("token", result.token);
      const link = url.href;
      resetLinkBox.innerHTML = `Lien valide 1 heure, à transmettre manuellement à ${escapeHtml(email)} :<br><a class="font-semibold text-blue-700" href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(link)}</a>`;
      resetLinkBox.classList.remove("hidden");
    } catch (error) {
      console.error("Password reset link generation failed:", error);
      membersError.textContent = error.message || "Impossible de générer le lien.";
      membersError.classList.remove("hidden");
    } finally {
      button.disabled = false;
    }
  }

  async function createInvitation(event) {
    event.preventDefault();
    errorBox.classList.add("hidden");
    linkBox.classList.add("hidden");
    submitButton.disabled = true;

    try {
      const result = await apiRequest("invitations", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullNameInput.value.trim(),
          email: emailInput.value.trim().toLowerCase(),
          role: roleInput.value,
          team_name: teamInput.value.trim() || null
        })
      });
      const link = invitationUrl(result.invitation.token, result.invitation.email);
      linkBox.innerHTML = `Invitation créée. Transmettez ce lien au collaborateur (valide 7 jours) :<br><a class="font-semibold text-blue-700" href="${escapeHtml(link)}">${escapeHtml(link)}</a>`;
      linkBox.classList.remove("hidden");
      form.reset();
      await loadInvitations();
    } catch (error) {
      console.error("Create collaborator invitation failed:", error);
      showError(error.message || "Impossible de créer l'invitation.");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function deleteInvitation(id, email, button) {
    if (!window.confirm(`Supprimer l'invitation en attente pour ${email} ?`)) return;
    button.disabled = true;
    errorBox.classList.add("hidden");
    try {
      await apiRequest("invitations", {
        method: "DELETE",
        body: JSON.stringify({ id })
      });
      linkBox.textContent = "Invitation supprimée.";
      linkBox.classList.remove("hidden");
      await loadInvitations();
    } catch (error) {
      console.error("Delete collaborator invitation failed:", error);
      showError(error.message || "Impossible de supprimer l'invitation.");
      button.disabled = false;
    }
  }

  form.addEventListener("submit", createInvitation);
  table.addEventListener("click", (event) => {
    const button = event.target.closest(".delete-invitation");
    if (button) deleteInvitation(button.dataset.id, button.dataset.email, button);
  });
  membersTable.addEventListener("click", (event) => {
    const button = event.target.closest(".create-reset-link");
    if (button) createResetLink(button.dataset.userId, button.dataset.email, button);
  });

  requireAdmin().then((isAdmin) => {
    if (isAdmin) return Promise.all([loadInvitations(), loadCompanyUsers()]);
  }).catch((error) => {
    console.error("Collaborator management initialization failed:", error);
    membersError.textContent = error.message || "Impossible de vérifier votre session.";
    membersError.classList.remove("hidden");
    showError(error.message || "Impossible de vérifier votre session.");
  });
  window.lucide?.createIcons();
})();
