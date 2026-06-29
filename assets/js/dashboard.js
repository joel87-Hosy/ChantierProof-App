(function () {
  const fallbackRows = [
    {
      id: "demo",
      client_name: "Client demo",
      intervention_title: "Remise en etat tableau electrique",
      status: "pending",
      created_at: new Date().toISOString()
    }
  ];

  const table = document.getElementById("validations-table");
  const count = document.getElementById("signed-month-count");
  const linkInput = document.getElementById("generated-link");
  const newButton = document.getElementById("new-validation-btn");
  const copyButton = document.getElementById("copy-link-btn");
  const shareButton = document.getElementById("share-link-btn");
  const qrPanel = document.getElementById("qr-panel");
  const qrCode = document.getElementById("qr-code");
  const errorBox = document.getElementById("dashboard-error");
  const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));

  let rows = [];
  let activeFilter = "all";

  function validationUrl(id) {
    return new URL(`./v/validation.html?id=${encodeURIComponent(id)}`, window.location.href).href;
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

  function statusBadge(status) {
    if (status === "signed") return '<span class="badge badge-signed">Validé</span>';
    if (status === "dispute") return '<span class="badge badge-dispute">Litige</span>';
    return '<span class="badge badge-pending">En attente</span>';
  }

  function render() {
    const visibleRows = activeFilter === "all" ? rows : rows.filter((row) => row.status === activeFilter);
    table.innerHTML = visibleRows.map((row) => `
      <tr class="border-b">
        <td class="px-4 py-3 font-medium">${row.client_name || "-"}</td>
        <td class="px-4 py-3 text-slate-600">${row.intervention_title || "-"}</td>
        <td class="px-4 py-3">${statusBadge(row.status)}</td>
        <td class="px-4 py-3 text-slate-600">${window.ChantierProof.formatDate(row.created_at)}</td>
        <td class="px-4 py-3"><a class="text-blue-700 font-semibold" href="${validationUrl(row.id)}">Ouvrir</a></td>
      </tr>
    `).join("");

    count.textContent = rows.filter((row) => {
      if (row.status !== "signed" || !row.signed_at) return false;
      const signedAt = new Date(row.signed_at);
      const now = new Date();
      return signedAt.getMonth() === now.getMonth() && signedAt.getFullYear() === now.getFullYear();
    }).length;
  }

  async function loadRows() {
    try {
      const client = window.ChantierProof.getClient();
      const response = await client
        .from("validations")
        .select("*")
        .order("created_at", { ascending: false });

      rows = response.error ? fallbackRows : response.data;
    } catch (error) {
      rows = fallbackRows;
    }
    render();
  }

  async function createValidation() {
    clearError();
    const clientName = prompt("Nom du client");
    if (!clientName) return;

    const interventionTitle = prompt("Objet de l'intervention");
    if (!interventionTitle) return;

    try {
      const client = window.ChantierProof.getClient();
      const response = await client
        .from("validations")
        .insert({ client_name: clientName, intervention_title: interventionTitle })
        .select("id")
        .single();

      if (response.error) throw response.error;
      setGeneratedLink(validationUrl(response.data.id));
      await loadRows();
    } catch (error) {
      console.error("Create validation failed:", error);
      showError(`Création impossible dans Supabase : ${error.message || "vérifie les policies RLS."}`);
    }
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
  });

  newButton.addEventListener("click", createValidation);

  copyButton.addEventListener("click", async () => {
    if (!linkInput.value) return;
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copyButton.textContent = "Copié";
    } catch (error) {
      linkInput.select();
      copyButton.textContent = "Lien sélectionné";
    }
    setTimeout(() => { restoreButtonIcon(copyButton, "copy", "Copier"); }, 1200);
  });

  shareButton.addEventListener("click", async () => {
    if (!linkInput.value) return;
    if (!navigator.share) {
      linkInput.select();
      shareButton.textContent = "Lien sélectionné";
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

  window.lucide?.createIcons();
  loadRows();
})();
