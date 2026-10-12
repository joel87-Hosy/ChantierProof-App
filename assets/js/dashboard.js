(function () {
  const table = document.getElementById("validations-table");
  const count = document.getElementById("signed-month-count");
  const linkInput = document.getElementById("generated-link");
  const newButton = document.getElementById("new-validation-btn");
  const logoutButton = document.getElementById("logout-btn");
  const userChip = document.getElementById("user-chip");
  const profileLink = document.getElementById("profile-link");
  const usersLink = document.getElementById("users-link");
  const accountingLink = document.getElementById("accounting-link");
  const superAdminLink = document.getElementById("super-admin-link");
  const menuButton = document.getElementById("dashboard-menu-btn");
  const actionMenu = document.getElementById("dashboard-action-menu");
  const copyButton = document.getElementById("copy-link-btn");
  const shareButton = document.getElementById("share-link-btn");
  const qrPanel = document.getElementById("qr-panel");
  const qrCode = document.getElementById("qr-code");
  const errorBox = document.getElementById("dashboard-error");
  const dialog = document.getElementById("new-validation-dialog");
  const form = document.getElementById("new-validation-form");
  const closeDialogButton = document.getElementById("close-validation-dialog");
  const cancelDialogButton = document.getElementById("cancel-validation-dialog");
  const modalError = document.getElementById("new-validation-error");
  const clientNameInput = document.getElementById("new-client-name");
  const clientPhoneInput = document.getElementById("new-client-phone");
  const interventionTitleInput = document.getElementById("new-intervention-title");
  const interventionPriceInput = document.getElementById("new-intervention-price");
  const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
  const loadMoreButton = document.getElementById("load-more-validations");

  let rows = [];
  let activeFilter = "all";
  let currentUser = null;
  let currentProfile = null;
  let currentTotal = 0;
  let csrfToken = "";
  const pageSize = 50;

  async function apiRequest(action, options = {}) {
    const { query = {}, ...fetchOptions } = options;
    const headers = new Headers(fetchOptions.headers || {});
    if (fetchOptions.body) headers.set("Content-Type", "application/json");
    if (csrfToken && fetchOptions.method === "POST") headers.set("X-CSRF-Token", csrfToken);
    const params = new URLSearchParams({ action });
    Object.entries(query).forEach(([key, value]) => params.set(key, String(value)));
    const response = await fetch(`./api/index.php?${params.toString()}`, {
      ...fetchOptions,
      headers,
      credentials: "same-origin",
      cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "La demande a échoué.");
    return result;
  }

  async function requireSession() {
    let session;
    try {
      session = await apiRequest("session");
    } catch (error) {
      showError(error.message || "Impossible de vérifier votre session.");
      return false;
    }
    if (!session.profile) {
      window.location.href = "./login.html";
      return false;
    }

    csrfToken = session.csrfToken;
    currentProfile = session.profile;
    currentUser = { id: currentProfile.id, email: currentProfile.email };
    await loadProfile();
    return true;
  }

  async function loadProfile() {
    const name = currentProfile?.full_name || currentUser.email;
    const role = currentProfile?.role || "user";
    const avatarUrl = await signedAvatar(currentProfile?.avatar_url);
    const initials = getInitials(name);
    userChip.innerHTML = `
      <span class="user-chip-avatar" aria-hidden="true">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="">` : initials}
      </span>
      <span class="user-chip-text">${escapeHtml(name)} &middot; ${escapeHtml(role)}</span>
    `;
    userChip.classList.remove("hidden");
    profileLink?.classList.remove("hidden");
    usersLink?.classList.add("hidden");
    accountingLink?.classList.add("hidden");
    superAdminLink?.classList.add("hidden");
    if (currentProfile?.role === "super_admin") {
      superAdminLink?.classList.remove("hidden");
    }
    if (currentProfile?.role === "admin" && currentProfile?.company_id) {
      usersLink?.classList.remove("hidden");
    }
    if (["admin", "accountant"].includes(currentProfile?.role) && currentProfile?.company_id) {
      accountingLink?.classList.remove("hidden");
    }
  }

  async function signedAvatar(path) {
    if (path?.startsWith("profile-avatars/")) {
      return `./api/index.php?action=profile-avatar&v=${Date.now()}`;
    }
    if (path?.startsWith("validations/")) {
      return `./api/index.php?action=asset&path=${encodeURIComponent(path)}`;
    }
    return null;
  }

  function getInitials(value) {
    return String(value || "CP")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "CP";
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

  function closeDashboardMenu() {
    if (!actionMenu || !menuButton) return;
    actionMenu.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }

  function toggleDashboardMenu() {
    if (!actionMenu || !menuButton) return;
    const isOpen = actionMenu.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  }

  function validationUrl(id) {
    return new URL(`./v/validation.html?id=${encodeURIComponent(id)}`, window.location.href).href;
  }

  function detailUrl(id) {
    return new URL(`./validation-detail.html?id=${encodeURIComponent(id)}`, window.location.href).href;
  }

  function setGeneratedLink(url) {
    linkInput.value = url;
    renderQrCode(url);
  }

  function renderQrCode(url) {
    if (!window.QRCode || !qrCode) return;
    qrCode.innerHTML = "";
    new window.QRCode(qrCode, {
      text: url,
      width: 96,
      height: 96,
      correctLevel: window.QRCode.CorrectLevel.M
    });
    qrPanel.classList.remove("hidden");
  }

  function restoreButtonIcon(button, icon, label) {
    button.innerHTML = `<i data-lucide="${icon}" class="icon"></i>${label}`;
    window.lucide?.createIcons();
  }

  function showError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function clearError() {
    if (!errorBox) return;
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  }

  function showModalError(message) {
    modalError.textContent = message;
    modalError.classList.remove("hidden");
  }

  function clearModalError() {
    modalError.textContent = "";
    modalError.classList.add("hidden");
  }

  function openDialog() {
    clearError();
    clearModalError();
    form.reset();
    dialog.showModal();
    clientNameInput.focus();
  }

  function closeDialog() {
    dialog.close();
  }

  function statusBadge(status) {
    if (status === "signed") return '<span class="badge badge-signed">Valide</span>';
    if (status === "dispute") return '<span class="badge badge-dispute">Litige</span>';
    return '<span class="badge badge-pending">En attente</span>';
  }

  function formatPrice(value) {
    if (value === null || value === undefined || value === "") return "-";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      maximumFractionDigits: 0
    }).format(Number(value));
  }

  function render() {
    const visibleRows = rows;
    if (!visibleRows.length) {
      table.innerHTML = `
        <tr>
          <td class="px-4 py-3 text-slate-500" colspan="8">Aucune validation pour le moment.</td>
        </tr>
      `;
    } else {
      table.innerHTML = visibleRows.map((row) => `
      <tr class="border-b">
        <td class="px-4 py-3 font-medium">${escapeHtml(row.client_name || "-")}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(row.intervention_title || "-")}</td>
        <td class="px-4 py-3">${statusBadge(row.status)}</td>
        <td class="px-4 py-3 text-slate-600">${formatPrice(row.intervention_price)}</td>
        <td class="px-4 py-3 text-slate-600">${window.ChantierProof.formatDate(row.created_at)}</td>
        <td class="px-4 py-3">${accountingBadge(row.accounting_status)}</td>
        <td class="px-4 py-3"><a class="text-blue-700 font-semibold" href="${detailUrl(row.id)}">Ouvrir</a></td>
        <td class="px-4 py-3">${fieldAction(row)}</td>
      </tr>
      `).join("");
    }

    if (loadMoreButton) {
      loadMoreButton.classList.toggle("hidden", rows.length >= currentTotal);
      loadMoreButton.disabled = false;
    }
  }

  function fieldAction(row) {
    if (row.status === "signed") {
      return '<span class="text-slate-500">Déjà validé</span>';
    }

    return `<a class="text-blue-700 font-semibold" href="${validationUrl(row.id)}">Photos / signature</a>`;
  }

  function accountingBadge(status) {
    if (status === "sent_to_accounting") {
      return '<span class="badge badge-signed">Envoye compta</span>';
    }
    return '<span class="badge badge-pending">Non envoye</span>';
  }

  async function loadSignedMonthCount() {
    try {
      const response = await apiRequest("signed-month-count");
      count.textContent = response.count;
    } catch (error) {
      console.error("Load signed month count failed:", error);
      count.textContent = "0";
    }
  }

  async function loadRows(options = {}) {
    const shouldReset = Boolean(options.reset);
    if (shouldReset) {
      rows = [];
      currentTotal = 0;
      render();
    }

    try {
      const from = rows.length;
      const response = await apiRequest("validations", {
        query: { status: activeFilter, offset: from, limit: pageSize }
      });
      rows = shouldReset ? response.rows : rows.concat(response.rows);
      currentTotal = response.total;
    } catch (error) {
      console.error("Load validations failed:", error);
      rows = [];
      currentTotal = 0;
      showError(`Impossible de charger les validations : ${error.message || "verifie Supabase."}`);
    }
    render();
  }

  async function createValidation(event) {
    event.preventDefault();
    clearError();
    clearModalError();

    const clientName = clientNameInput.value.trim();
    const clientPhone = clientPhoneInput.value.trim() || null;
    const interventionTitle = interventionTitleInput.value.trim();
    const price = interventionPriceInput.value ? Number(interventionPriceInput.value) : null;

    if (!clientName || !interventionTitle) {
      showModalError("Renseigne le client et l'objet de l'intervention.");
      return;
    }

    try {
      const response = await apiRequest("validations", {
        method: "POST",
        body: JSON.stringify({
          client_name: clientName,
          client_phone: clientPhone,
          intervention_title: interventionTitle,
          intervention_price: price
        })
      });
      setGeneratedLink(validationUrl(response.id));
      closeDialog();
      await loadSignedMonthCount();
      await loadRows({ reset: true });
    } catch (error) {
      console.error("Create validation failed:", error);
      showModalError(error.message || "Impossible de créer la validation.");
    }
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((item) => item.classList.toggle("active", item === button));
      clearError();
      loadRows({ reset: true });
    });
  });

  loadMoreButton?.addEventListener("click", async () => {
    loadMoreButton.disabled = true;
    await loadRows();
  });

  newButton.addEventListener("click", openDialog);
  closeDialogButton.addEventListener("click", closeDialog);
  cancelDialogButton.addEventListener("click", closeDialog);
  form.addEventListener("submit", createValidation);

  copyButton.addEventListener("click", async () => {
    if (!linkInput.value) return;
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copyButton.textContent = "Copie";
    } catch (error) {
      linkInput.select();
      copyButton.textContent = "Lien selectionne";
    }
    setTimeout(() => { restoreButtonIcon(copyButton, "copy", "Copier"); }, 1200);
  });

  shareButton.addEventListener("click", async () => {
    if (!linkInput.value) return;
    if (!navigator.share) {
      linkInput.select();
      shareButton.textContent = "Lien selectionne";
      setTimeout(() => { restoreButtonIcon(shareButton, "share-2", "Partager"); }, 1200);
      return;
    }

    await navigator.share({
      title: "Lien de validation ChantierProof",
      text: "Merci de valider l'intervention depuis ce lien.",
      url: linkInput.value
    });
  });

  if (!navigator.share) {
    shareButton.title = "Partage natif indisponible dans ce navigateur";
  }

  logoutButton.addEventListener("click", async () => {
    try {
      await apiRequest("logout", { method: "POST", body: "{}" });
      window.location.href = "./login.html";
    } catch (error) {
      showError(error.message || "Impossible de fermer la session.");
    }
  });

  menuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDashboardMenu();
  });

  actionMenu?.addEventListener("click", (event) => {
    if (event.target.closest("a,button")) closeDashboardMenu();
  });

  document.addEventListener("click", (event) => {
    if (!actionMenu?.classList.contains("open")) return;
    if (actionMenu.contains(event.target) || menuButton?.contains(event.target)) return;
    closeDashboardMenu();
  });

  window.lucide?.createIcons();
  requireSession().then((ok) => {
    if (ok) {
      loadSignedMonthCount();
      loadRows({ reset: true });
    }
  });
})();
