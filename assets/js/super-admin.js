(function () {
  const form = document.getElementById("company-form");
  const table = document.getElementById("companies-table");
  const logoutButton = document.getElementById("logout-btn");
  const refreshButton = document.getElementById("refresh-btn");
  const createButton = document.getElementById("create-company-btn");
  const errorBox = document.getElementById("super-admin-error");
  const formError = document.getElementById("company-error");
  const formSuccess = document.getElementById("company-success");
  const statsMrr = document.getElementById("stats-mrr");
  const statsActiveCompanies = document.getElementById("stats-active-companies");
  const statsChantiers = document.getElementById("stats-chantiers");
  const statsProofs = document.getElementById("stats-proofs");
  let csrfToken = "";

  const fields = {
    companyName: document.getElementById("company-name"),
    legalName: document.getElementById("legal-name"),
    companyEmail: document.getElementById("company-email"),
    companyPhone: document.getElementById("company-phone"),
    companyAddress: document.getElementById("company-address"),
    plan: document.getElementById("subscription-plan"),
    monthlyPrice: document.getElementById("monthly-price"),
    adminFullName: document.getElementById("admin-full-name"),
    adminEmail: document.getElementById("admin-email")
  };

  async function apiRequest(action, options = {}) {
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

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function formatMoney(cents, currency) {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "XOF",
      maximumFractionDigits: 0
    }).format(Number(cents || 0) / 100);
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.remove("hidden");
    formSuccess.classList.add("hidden");
  }

  function showFormSuccess(token, email) {
    const link = new URL("./login.html", window.location.href);
    link.searchParams.set("invite", token);
    link.searchParams.set("email", email);
    formSuccess.innerHTML = `Entreprise créée. Lien d'activation admin :<br><a class="font-semibold text-blue-700" href="${escapeHtml(link.href)}">${escapeHtml(link.href)}</a>`;
    formSuccess.classList.remove("hidden");
    formError.classList.add("hidden");
  }

  function clearMessages() {
    errorBox.classList.add("hidden");
    formError.classList.add("hidden");
  }

  function statusBadge(status) {
    if (status === "active") return '<span class="badge badge-signed">Active</span>';
    if (status === "suspended") return '<span class="badge badge-dispute">Suspendue</span>';
    if (status === "cancelled") return '<span class="badge badge-dispute">Annulée</span>';
    return '<span class="badge badge-pending">Trial</span>';
  }

  async function requireSuperAdmin() {
    const session = await apiRequest("session");
    csrfToken = session.csrfToken;
    if (!session.profile) {
      window.location.href = "./login.html";
      return false;
    }
    if (session.profile.role !== "super_admin") {
      showError("Accès réservé au compte Super Admin.");
      form.querySelectorAll("input, select, textarea, button").forEach((element) => {
        element.disabled = true;
      });
      refreshButton.disabled = true;
      return false;
    }
    return true;
  }

  async function loadCompanies() {
    clearMessages();
    refreshButton.disabled = true;

    try {
      const result = await apiRequest("companies");
      const companies = result.companies || [];
      const counts = {
        users: Object.fromEntries(companies.map((company) => [company.id, Number(company.user_count || 0)])),
        validations: Object.fromEntries(companies.map((company) => [company.id, Number(company.validation_count || 0)]))
      };
      companies.forEach((company) => {
        company.subscriptions = company.plan ? [{
          plan: company.plan,
          monthly_price_cents: company.monthly_price_cents,
          currency: company.currency
        }] : [];
      });
      renderCompanies(companies, counts);
      renderStats(companies, counts);
    } catch (error) {
      console.error("Load companies failed:", error);
      showError(error.message || "Impossible de charger les entreprises.");
      table.innerHTML = '<tr><td class="px-4 py-3 text-slate-500" colspan="7">Aucune donnée disponible.</td></tr>';
    } finally {
      refreshButton.disabled = false;
    }
  }

  function activeSubscription(company) {
    return Array.isArray(company.subscriptions) ? (company.subscriptions[0] || {}) : {};
  }

  function renderCompanies(companies, counts) {
    if (!companies.length) {
      table.innerHTML = '<tr><td class="px-4 py-3 text-slate-500" colspan="7">Aucune entreprise cliente pour le moment.</td></tr>';
      return;
    }

    table.innerHTML = companies.map((company) => {
      const subscription = activeSubscription(company);
      const nextStatus = company.status === "suspended" ? "active" : "suspended";
      const actionLabel = nextStatus === "suspended" ? "Suspendre" : "Réactiver";
      const actionIcon = nextStatus === "suspended" ? "pause-circle" : "play-circle";

      return `
        <tr class="border-b">
          <td class="px-4 py-3">
            <p class="font-semibold">${escapeHtml(company.name)}</p>
            <p class="text-xs text-slate-500">${escapeHtml(company.email || "-")}</p>
          </td>
          <td class="px-4 py-3">${statusBadge(company.status)}</td>
          <td class="px-4 py-3 text-slate-600">${escapeHtml(subscription.plan || "-")}</td>
          <td class="px-4 py-3 text-slate-600">${counts.users[company.id] || 0}</td>
          <td class="px-4 py-3 text-slate-600">${counts.validations[company.id] || 0}</td>
          <td class="px-4 py-3 text-slate-600">${formatMoney(subscription.monthly_price_cents, subscription.currency)}</td>
          <td class="px-4 py-3 text-right">
            <div class="row-actions row-actions-right">
              <button class="btn btn-secondary btn-sm company-status-btn" type="button" data-id="${escapeHtml(company.id)}" data-status="${nextStatus}">
                <i data-lucide="${actionIcon}" class="icon"></i>
                ${actionLabel}
              </button>
              <button class="btn btn-danger btn-sm company-delete-btn" type="button" data-id="${escapeHtml(company.id)}" data-name="${escapeHtml(company.name)}">
                <i data-lucide="trash-2" class="icon"></i>
                Supprimer
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    window.lucide?.createIcons();
  }

  function renderStats(companies, counts) {
    const mrrCents = companies.reduce((sum, company) => {
      if (company.status !== "active") return sum;
      return sum + Number(activeSubscription(company).monthly_price_cents || 0);
    }, 0);
    const activeCompanies = companies.filter((company) => company.status === "active").length;
    const totalValidations = Object.values(counts.validations).reduce((sum, value) => sum + value, 0);

    statsMrr.textContent = formatMoney(mrrCents, "XOF");
    statsActiveCompanies.textContent = activeCompanies;
    statsChantiers.textContent = totalValidations;
    statsProofs.textContent = totalValidations;
  }

  async function createCompany(event) {
    event.preventDefault();
    clearMessages();
    formSuccess.classList.add("hidden");
    createButton.disabled = true;

    try {
      const result = await apiRequest("companies", {
        method: "POST",
        body: JSON.stringify({
          name: fields.companyName.value.trim(),
          legal_name: fields.legalName.value.trim() || null,
          email: fields.companyEmail.value.trim().toLowerCase() || null,
          phone: fields.companyPhone.value.trim() || null,
          address: fields.companyAddress.value.trim() || null,
          plan: fields.plan.value,
          monthly_price_cents: Number(fields.monthlyPrice.value || 0),
          admin_full_name: fields.adminFullName.value.trim(),
          admin_email: fields.adminEmail.value.trim().toLowerCase()
        })
      });
      showFormSuccess(result.invitation_token, result.admin_email);
      form.reset();
      fields.monthlyPrice.value = "49000";
      await loadCompanies();
    } catch (error) {
      console.error("Create company failed:", error);
      showFormError(error.message || "Création impossible.");
    } finally {
      createButton.disabled = false;
    }
  }

  async function updateCompanyStatus(companyId, status, button) {
    button.disabled = true;
    clearMessages();
    try {
      await apiRequest("company-status", {
        method: "PATCH",
        body: JSON.stringify({ id: companyId, status })
      });
      await loadCompanies();
    } catch (error) {
      console.error("Update company status failed:", error);
      showError(error.message || "Mise à jour impossible.");
      button.disabled = false;
    }
  }

  async function deleteCompany(companyId, companyName, button) {
    const confirmation = window.prompt(
      `Suppression définitive de l'entreprise "${companyName}" et de ses données. Tape exactement SUPPRIMER pour confirmer.`
    );
    if (confirmation !== "SUPPRIMER") return;

    button.disabled = true;
    clearMessages();
    try {
      await apiRequest("company-delete", {
        method: "DELETE",
        body: JSON.stringify({ id: companyId })
      });
      await loadCompanies();
    } catch (error) {
      console.error("Delete company failed:", error);
      showError(error.message || "Suppression impossible.");
      button.disabled = false;
    }
  }

  table.addEventListener("click", (event) => {
    const statusButton = event.target.closest(".company-status-btn");
    if (statusButton) {
      updateCompanyStatus(statusButton.dataset.id, statusButton.dataset.status, statusButton);
      return;
    }

    const deleteButton = event.target.closest(".company-delete-btn");
    if (deleteButton) {
      deleteCompany(deleteButton.dataset.id, deleteButton.dataset.name, deleteButton);
    }
  });

  form.addEventListener("submit", createCompany);
  refreshButton.addEventListener("click", loadCompanies);
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await apiRequest("logout", { method: "POST" });
      window.location.href = "./login.html";
    } catch (error) {
      console.error("Hostinger logout failed:", error);
      showError(error.message || "La déconnexion a échoué. Réessayez.");
      logoutButton.disabled = false;
    }
  });

  window.lucide?.createIcons();
  requireSuperAdmin().then((ok) => {
    if (ok) loadCompanies();
  }).catch((error) => {
    console.error("Super Admin session initialization failed:", error);
    showError(error.message || "Impossible de vérifier votre session.");
  });
})();
