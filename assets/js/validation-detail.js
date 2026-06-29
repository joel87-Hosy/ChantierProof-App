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

  async function resolveImageUrl(client, path) {
    if (!path) return null;
    const response = await client.storage
      .from(window.CHANTIERPROOF_CONFIG.storageBucket)
      .createSignedUrl(path, 60 * 10);

    if (response.error) {
      console.warn("Signed image URL failed:", response.error);
      return null;
    }

    return response.data.signedUrl;
  }

  async function renderImage(client, element, path, alt) {
    const url = await resolveImageUrl(client, path);
    if (!url) {
      element.textContent = "Aucune photo pour le moment";
      return;
    }

    element.innerHTML = `<img src="${url}" alt="${alt}" class="photo-img">`;
  }

  async function loadDetail() {
    if (!id) {
      showError("Lien de detail invalide.");
      return;
    }

    try {
      const client = window.ChantierProof.getClient();
      const response = await client.from("validations").select("*").eq("id", id).single();
      if (response.error) throw response.error;

      const row = response.data;
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

      const url = mapUrl(row.gps_position);
      if (url) {
        mapLink.href = url;
        mapLink.classList.remove("hidden");
      }

      await renderImage(client, beforeEl, row.photo_before_url, "Photo avant intervention");
      await renderImage(client, afterEl, row.photo_after_url, "Photo apres intervention");
      window.lucide?.createIcons();
    } catch (error) {
      console.error("Load validation detail failed:", error);
      clientEl.textContent = "Detail indisponible";
      titleEl.textContent = "";
      showError(`Impossible de charger la validation : ${error.message || "verifie Supabase."}`);
    }
  }

  loadDetail();
})();
