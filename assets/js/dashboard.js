(function () {
  const table = document.getElementById("validations-table");
  const count = document.getElementById("signed-month-count");
  const linkInput = document.getElementById("generated-link");
  const newButton = document.getElementById("new-validation-btn");
  const logoutButton = document.getElementById("logout-btn");
  const userChip = document.getElementById("user-chip");
  const usersLink = document.getElementById("users-link");
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

  let rows = [];
  let activeFilter = "all";
  let currentUser = null;
  let currentProfile = null;

  async function requireSession() {
    const client = window.ChantierProof.getClient();
    const sessionResponse = await client.auth.getSession();
    const session = sessionResponse.data.session;

    if (!session) {
      window.location.href = "./login.html";
      return false;
    }

    currentUser = session.user;
    await loadProfile();
    return true;
  }

  async function loadProfile() {
    const client = window.ChantierProof.getClient();
    const response = await client
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (!response.error) {
      currentProfile = response.data;
    }

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
    usersLink.classList.toggle("hidden", role !== "admin");
  }

  async function signedAvatar(path) {
    if (!path) return null;
    const client = window.ChantierProof.getClient();
    const response = await client.storage.from("profile-avatars").createSignedUrl(path, 600);
    return response.error ? null : response.data.signedUrl;
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
    const visibleRows = activeFilter === "all" ? rows : rows.filter((row) => row.status === activeFilter);
    if (!visibleRows.length) {
      table.innerHTML = `
        <tr>
          <td class="px-4 py-3 text-slate-500" colspan="8">Aucune validation pour le moment.</td>
        </tr>
      `;
    } else {
      table.innerHTML = visibleRows.map((row) => `
      <tr class="border-b">
        <td class="px-4 py-3 font-medium">${row.client_name || "-"}</td>
        <td class="px-4 py-3 text-slate-600">${row.intervention_title || "-"}</td>
        <td class="px-4 py-3">${statusBadge(row.status)}</td>
        <td class="px-4 py-3 text-slate-600">${formatPrice(row.intervention_price)}</td>
        <td class="px-4 py-3 text-slate-600">${window.ChantierProof.formatDate(row.created_at)}</td>
        <td class="px-4 py-3">${accountingBadge(row.accounting_status)}</td>
        <td class="px-4 py-3"><a class="text-blue-700 font-semibold" href="${detailUrl(row.id)}">Ouvrir</a></td>
        <td class="px-4 py-3">${fieldAction(row)}</td>
      </tr>
      `).join("");
    }

    count.textContent = rows.filter((row) => {
      if (row.status !== "signed" || !row.signed_at) return false;
      const signedAt = new Date(row.signed_at);
      const now = new Date();
      return signedAt.getMonth() === now.getMonth() && signedAt.getFullYear() === now.getFullYear();
    }).length;
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

  async function loadRows() {
    try {
      const client = window.ChantierProof.getClient();
      const response = await client
        .from("validations")
        .select("*")
        .order("created_at", { ascending: false });

      if (response.error) throw response.error;
      rows = response.data || [];
    } catch (error) {
      console.error("Load validations failed:", error);
      rows = [];
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
      const client = window.ChantierProof.getClient();
      const response = await client
        .from("validations")
        .insert({
          client_name: clientName,
          client_phone: clientPhone,
          intervention_title: interventionTitle,
          intervention_price: price,
          created_by: currentUser.id
        })
        .select("id")
        .single();

      if (response.error) throw response.error;
      setGeneratedLink(validationUrl(response.data.id));
      closeDialog();
      await loadRows();
    } catch (error) {
      console.error("Create validation failed:", error);
      showModalError(`Creation impossible dans Supabase : ${error.message || "verifie les colonnes et policies RLS."}`);
    }
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
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
    const client = window.ChantierProof.getClient();
    await client.auth.signOut();
    window.location.href = "./login.html";
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
    if (ok) loadRows();
  });
})();
