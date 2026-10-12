(function () {
  const id = window.ChantierProof.getValidationId();
  const clientEl = document.getElementById("detail-client");
  const titleEl = document.getElementById("detail-title");
  const statusEl = document.getElementById("detail-status");
  const priceEl = document.getElementById("detail-price");
  const clientPhoneEl = document.getElementById("detail-client-phone");
  const gpsEl = document.getElementById("detail-gps");
  const technicianEl = document.getElementById("detail-technician");
  const notesEl = document.getElementById("detail-notes");
  const mapLink = document.getElementById("detail-map-link");
  const signerEl = document.getElementById("detail-signer");
  const signedAtEl = document.getElementById("detail-signed-at");
  const accountingEl = document.getElementById("detail-accounting");
  const pdfButton = document.getElementById("detail-pdf-btn");
  const beforeEl = document.getElementById("detail-before");
  const afterEl = document.getElementById("detail-after");
  const errorEl = document.getElementById("detail-error");
  const fieldLink = document.getElementById("detail-field-link");

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
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

  function mapUrl(gpsPosition) {
    if (!gpsPosition) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gpsPosition)}`;
  }

  function validationUrl(validationId) {
    return new URL(`./v/validation.html?id=${encodeURIComponent(validationId)}`, window.location.href).href;
  }

  function assetUrl(path) {
    if (!path) return null;
    return `./api/index.php?action=asset&path=${encodeURIComponent(path)}`;
  }

  function renderImage(element, path, alt) {
    const url = assetUrl(path);
    if (!url) {
      element.textContent = path
        ? "Photo enregistree, mais acces Storage indisponible"
        : "Aucune photo pour le moment";
      return;
    }

    element.innerHTML = `<img src="${url}" alt="${alt}" class="photo-img" loading="lazy" decoding="async">`;
  }

  async function loadDetail() {
    if (!id) {
      showError("Lien de detail invalide.");
      return;
    }

    try {
      const response = await fetch(`./api/index.php?action=validation-detail&id=${encodeURIComponent(id)}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (response.status === 401) window.location.href = "./login.html";
        throw new Error(result.error || "Validation introuvable.");
      }
      const row = result.validation;
      pdfButton.onclick = null;
      fieldLink.href = validationUrl(row.id);
      clientEl.textContent = row.client_name || "-";
      titleEl.textContent = row.intervention_title || "-";
      statusEl.innerHTML = statusBadge(row.status);
      if (row.status === "signed") {
        fieldLink.innerHTML = '<i data-lucide="eye" class="icon"></i>Voir le formulaire';
        fieldLink.classList.remove("btn-primary");
        fieldLink.classList.add("btn-secondary");
      }
      priceEl.textContent = formatPrice(row.intervention_price);
      clientPhoneEl.textContent = row.client_phone || "-";
      gpsEl.textContent = row.gps_position || "-";
      technicianEl.textContent = row.technician_name || "-";
      notesEl.textContent = row.technician_notes || "Aucun commentaire pour le moment";
      signerEl.textContent = row.signer_name || "Non signe";
      signedAtEl.textContent = row.signed_at ? window.ChantierProof.formatDate(row.signed_at) : "En attente de validation";
      accountingEl.textContent = row.accounting_status === "sent_to_accounting"
        ? `Envoye au comptable le ${window.ChantierProof.formatDate(row.sent_to_accounting_at)}`
        : "Non envoye";

      if (row.pdf_url) {
        pdfButton.classList.remove("hidden");
        pdfButton.onclick = () => window.open(assetUrl(row.pdf_url), "_blank", "noopener");
      } else {
        pdfButton.classList.add("hidden");
      }

      const url = mapUrl(row.gps_position);
      if (url) {
        mapLink.href = url;
        mapLink.classList.remove("hidden");
      }

      renderImage(beforeEl, row.photo_before_url, "Photo avant intervention");
      renderImage(afterEl, row.photo_after_url, "Photo apres intervention");
      window.lucide?.createIcons();
    } catch (error) {
      console.error("Load validation detail failed:", error);
      clientEl.textContent = "Detail indisponible";
      titleEl.textContent = "";
      showError(`Impossible de charger la validation : ${error.message || "réessayez."}`);
    }
  }

  loadDetail();
})();
