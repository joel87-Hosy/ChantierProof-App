(function () {
  const table = document.getElementById("accounting-requests-table");
  const errorBox = document.getElementById("accounting-error");
  const pendingCount = document.getElementById("accounting-pending-count");
  const doneCount = document.getElementById("accounting-done-count");
  const lastDate = document.getElementById("accounting-last-date");
  const refreshButton = document.getElementById("accounting-refresh-btn");
  const logoutButton = document.getElementById("accounting-logout-btn");
  const filterButtons = Array.from(document.querySelectorAll("[data-accounting-filter]"));

  let activeFilter = "pending";
  let currentUser = null;
  let currentProfile = null;
  let rows = [];

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function clearError() {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
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

  function formatPrice(value) {
    if (value === null || value === undefined || value === "") return "-";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      maximumFractionDigits: 0
    }).format(Number(value));
  }

  function requestBadge(status) {
    if (status === "processed") return '<span class="badge badge-signed">Traitee</span>';
    return '<span class="badge badge-pending">A traiter</span>';
  }

  async function requireAccountingAccess() {
    const client = window.ChantierProof.getClient();
    const sessionResponse = await client.auth.getSession();
    const session = sessionResponse.data.session;

    if (!session) {
      window.location.href = "./login.html";
      return false;
    }

    currentUser = session.user;
    const profileResponse = await client
      .from("profiles")
      .select("role,full_name,email")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileResponse.error) {
      showError(profileResponse.error.message);
      return false;
    }

    currentProfile = profileResponse.data || {};
    if (!["admin", "accountant"].includes(currentProfile.role)) {
      showError("Acces reserve au comptable ou a l'admin.");
      return false;
    }

    return true;
  }

  function renderStats(allRows) {
    pendingCount.textContent = allRows.filter((row) => row.status !== "processed").length;
    doneCount.textContent = allRows.filter((row) => row.status === "processed").length;
    lastDate.textContent = allRows[0]?.created_at ? window.ChantierProof.formatDate(allRows[0].created_at) : "-";
  }

  function render() {
    if (!rows.length) {
      table.innerHTML = '<tr><td class="px-4 py-3 text-slate-500" colspan="8">Aucune demande comptable pour le moment.</td></tr>';
      return;
    }

    table.innerHTML = rows.map((row) => {
      const validation = row.validation || {};
      const pdfAction = row.pdf_url
        ? `<button class="btn btn-secondary btn-sm open-pdf" type="button" data-pdf="${escapeHtml(row.pdf_url)}">PDF</button>`
        : '<span class="text-slate-500">Aucun PDF</span>';
      const processAction = row.status === "processed"
        ? '<span class="text-slate-500">Terminee</span>'
        : `<button class="btn btn-primary btn-sm process-request" type="button" data-id="${escapeHtml(row.id)}">Marquer traitee</button>`;

      return `
        <tr class="border-b">
          <td class="px-4 py-3 font-medium">${escapeHtml(validation.client_name || "-")}</td>
          <td class="px-4 py-3 text-slate-600">${escapeHtml(validation.intervention_title || "-")}</td>
          <td class="px-4 py-3 text-slate-600">${formatPrice(validation.intervention_price)}</td>
          <td class="px-4 py-3 text-slate-600">${window.ChantierProof.formatDate(row.created_at)}</td>
          <td class="px-4 py-3">${requestBadge(row.status)}</td>
          <td class="px-4 py-3"><a class="text-blue-700 font-semibold" href="./validation-detail.html?id=${encodeURIComponent(validation.id)}">Ouvrir</a></td>
          <td class="px-4 py-3">${pdfAction}</td>
          <td class="px-4 py-3">${processAction}</td>
        </tr>
      `;
    }).join("");
  }

  async function loadRequests() {
    clearError();
    refreshButton.disabled = true;

    try {
      const client = window.ChantierProof.getClient();
      let query = client
        .from("accounting_requests")
        .select([
          "id",
          "created_at",
          "status",
          "pdf_url",
          "validation:validations(id,client_name,intervention_title,intervention_price)"
        ].join(","))
        .order("created_at", { ascending: false });

      if (activeFilter !== "all") {
        query = query.eq("status", activeFilter);
      }

      const response = await query;
      if (response.error) throw response.error;
      rows = response.data || [];
      render();

      const statsResponse = await client
        .from("accounting_requests")
        .select("id,created_at,status")
        .order("created_at", { ascending: false });
      if (!statsResponse.error) renderStats(statsResponse.data || []);
    } catch (error) {
      console.error("Load accounting requests failed:", error);
      rows = [];
      render();
      showError(error.message || "Impossible de charger les demandes comptables.");
    } finally {
      refreshButton.disabled = false;
      window.lucide?.createIcons();
    }
  }

  async function markProcessed(id) {
    const client = window.ChantierProof.getClient();
    const response = await client
      .from("accounting_requests")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        processed_by: currentUser.id
      })
      .eq("id", id);

    if (response.error) throw response.error;
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.accountingFilter;
      filterButtons.forEach((item) => item.classList.toggle("active", item === button));
      loadRequests();
    });
  });

  refreshButton.addEventListener("click", loadRequests);

  table.addEventListener("click", async (event) => {
    const pdfButton = event.target.closest(".open-pdf");
    const processButton = event.target.closest(".process-request");
    const client = window.ChantierProof.getClient();

    if (pdfButton) {
      try {
        await window.ChantierProof.openPdf(client, pdfButton.dataset.pdf);
      } catch (error) {
        showError(error.message || "PDF indisponible.");
      }
      return;
    }

    if (processButton) {
      processButton.disabled = true;
      clearError();
      try {
        await markProcessed(processButton.dataset.id);
        await loadRequests();
      } catch (error) {
        processButton.disabled = false;
        showError(error.message || "Impossible de traiter la demande.");
      }
    }
  });

  logoutButton.addEventListener("click", async () => {
    const client = window.ChantierProof.getClient();
    await client.auth.signOut();
    window.location.href = "./login.html";
  });

  window.lucide?.createIcons();
  requireAccountingAccess().then((ok) => {
    if (ok) loadRequests();
  });
})();
