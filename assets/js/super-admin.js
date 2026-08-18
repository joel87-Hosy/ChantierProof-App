(function () {
  const client = window.ChantierProof.getClient();
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

  function showFormSuccess(html) {
    formSuccess.innerHTML = html;
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
    if (status === "cancelled") return '<span class="badge badge-dispute">Annulee</span>';
    return '<span class="badge badge-pending">Trial</span>';
  }

  async function requireSuperAdmin() {
    const sessionResponse = await client.auth.getSession();
    const session = sessionResponse.data.session;
    if (!session) {
      window.location.href = "./login.html";
      return false;
    }

    const profileResponse = await client
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileResponse.error || profileResponse.data?.role !== "super_admin") {
      showError("Acces reserve au compte Super Admin.");
      form.querySelectorAll("input, select, textarea, button").forEach((element) => {
        element.disabled = true;
      });
      return false;
    }

    return true;
  }

  async function loadCompanies() {
    clearMessages();
    refreshButton.disabled = true;

    try {
      const companiesResponse = await client
        .from("companies")
        .select("id,name,email,status,created_at,subscriptions(plan,monthly_price_cents,currency)")
        .order("created_at", { ascending: false });

      if (companiesResponse.error) throw companiesResponse.error;

      const companies = companiesResponse.data || [];
      const companyIds = companies.map((company) => company.id);
      const counts = await loadTenantCounts(companyIds);

      renderCompanies(companies, counts);
      renderStats(companies, counts);
    } catch (error) {
      console.error("Load companies failed:", error);
      showError(error.message || "Impossible de charger les entreprises.");
      table.innerHTML = '<tr><td class="px-4 py-3 text-slate-500" colspan="7">Aucune donnee disponible.</td></tr>';
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function loadTenantCounts(companyIds) {
    const empty = { users: {}, validations: {} };
    if (!companyIds.length) return empty;

    const [usersResponse, validationsResponse] = await Promise.all([
      client.from("profiles").select("company_id").in("company_id", companyIds),
      client.from("validations").select("company_id,status").in("company_id", companyIds)
    ]);

    if (usersResponse.error) throw usersResponse.error;
    if (validationsResponse.error) throw validationsResponse.error;

    return {
      users: countByCompany(usersResponse.data || []),
      validations: countByCompany(validationsResponse.data || [])
    };
  }

  function countByCompany(rows) {
    return rows.reduce((acc, row) => {
      if (!row.company_id) return acc;
      acc[row.company_id] = (acc[row.company_id] || 0) + 1;
      return acc;
    }, {});
  }

  function activeSubscription(company) {
    const subscriptions = Array.isArray(company.subscriptions) ? company.subscriptions : [];
    return subscriptions[0] || {};
  }

  function renderCompanies(companies, counts) {
    if (!companies.length) {
      table.innerHTML = '<tr><td class="px-4 py-3 text-slate-500" colspan="7">Aucune entreprise cliente pour le moment.</td></tr>';
      return;
    }

    table.innerHTML = companies.map((company) => {
      const subscription = activeSubscription(company);
      const nextStatus = company.status === "suspended" ? "active" : "suspended";
      const actionLabel = nextStatus === "suspended" ? "Suspendre" : "Reactiver";
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
      const subscription = activeSubscription(company);
      if (company.status !== "active") return sum;
      return sum + Number(subscription.monthly_price_cents || 0);
    }, 0);
    const activeCompanies = companies.filter((company) => company.status === "active").length;
    const totalValidations = Object.values(counts.validations).reduce((sum, value) => sum + value, 0);

    statsMrr.textContent = formatMoney(mrrCents, "XOF");
    statsActiveCompanies.textContent = activeCompanies;
    statsChantiers.textContent = totalValidations;
    statsProofs.textContent = totalValidations;
  }

  function invitationUrl(token, email) {
    const url = new URL("./login.html", window.location.href);
    url.searchParams.set("invite", token);
    url.searchParams.set("email", email);
    return url.href;
  }

  async function createCompany(event) {
    event.preventDefault();
    clearMessages();
    formSuccess.classList.add("hidden");
    createButton.disabled = true;

    const payload = {
      p_company_name: fields.companyName.value.trim(),
      p_legal_name: fields.legalName.value.trim() || null,
      p_company_email: fields.companyEmail.value.trim().toLowerCase() || null,
      p_phone: fields.companyPhone.value.trim() || null,
      p_address: fields.companyAddress.value.trim() || null,
      p_plan: fields.plan.value,
      p_monthly_price_cents: Number(fields.monthlyPrice.value || 0),
      p_admin_full_name: fields.adminFullName.value.trim(),
      p_admin_email: fields.adminEmail.value.trim().toLowerCase()
    };

    if (!payload.p_company_name || !payload.p_admin_full_name || !payload.p_admin_email) {
      showFormError("Renseigne le nom de l'entreprise et le compte admin initial.");
      createButton.disabled = false;
      return;
    }

    try {
      const response = await client.rpc("create_company_with_admin_invite", payload);
      if (response.error) throw response.error;

      const created = Array.isArray(response.data) ? response.data[0] : response.data;
      const link = invitationUrl(created.invitation_token, payload.p_admin_email);
      showFormSuccess(`Entreprise creee. Lien d'activation admin :<br><a class="font-semibold text-blue-700" href="${link}">${link}</a>`);
      form.reset();
      fields.monthlyPrice.value = "49000";
      await loadCompanies();
    } catch (error) {
      console.error("Create company failed:", error);
      showFormError(error.message || "Creation impossible.");
    } finally {
      createButton.disabled = false;
    }
  }

  async function updateCompanyStatus(companyId, status, button) {
    button.disabled = true;
    clearMessages();

    try {
      const response = await client
        .from("companies")
        .update({ status })
        .eq("id", companyId);

      if (response.error) throw response.error;
      await loadCompanies();
    } catch (error) {
      console.error("Update company status failed:", error);
      showError(error.message || "Mise a jour impossible.");
      button.disabled = false;
    }
  }

  async function deleteCompany(companyId, companyName, button) {
    const confirmation = window.prompt(
      `Suppression definitive de l'entreprise "${companyName}". Tape exactement SUPPRIMER pour confirmer.`
    );

    if (confirmation !== "SUPPRIMER") return;

    button.disabled = true;
    clearMessages();

    try {
      const response = await client.rpc("delete_company_cascade", {
        p_company_id: companyId
      });

      if (response.error) throw response.error;
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
    await client.auth.signOut();
    window.location.href = "./login.html";
  });

  window.lucide?.createIcons();
  requireSuperAdmin().then((ok) => {
    if (ok) loadCompanies();
  });
})();
