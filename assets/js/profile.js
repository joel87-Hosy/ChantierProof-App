(function () {
  const form = document.getElementById("profile-form");
  const avatarInput = document.getElementById("avatar-file");
  const avatarPreview = document.getElementById("avatar-preview");
  const avatarPlaceholder = document.getElementById("avatar-placeholder");
  const nameInput = document.getElementById("profile-full-name");
  const emailInput = document.getElementById("profile-email");
  const roleInput = document.getElementById("profile-role");
  const teamInput = document.getElementById("profile-team");
  const errorBox = document.getElementById("profile-error");
  const successBox = document.getElementById("profile-success");

  let currentUser = null;
  let currentProfile = null;
  let csrfToken = "";

  async function apiRequest(action, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
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
    successBox.classList.add("hidden");
  }

  function showSuccess(message) {
    successBox.textContent = message;
    successBox.classList.remove("hidden");
    errorBox.classList.add("hidden");
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Compression avatar impossible."));
        }
      }, type, quality);
    });
  }

  function imageFromFile(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file);
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Avatar illisible."));
      image.src = URL.createObjectURL(file);
    });
  }

  async function compressAvatar(file) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Le fichier avatar doit etre une image.");
    }

    const source = await imageFromFile(file);
    const size = 512;
    const scale = Math.max(size / source.width, size / source.height);
    const width = Math.round(source.width * scale);
    const height = Math.round(source.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const x = Math.round((size - width) / 2);
    const y = Math.round((size - height) / 2);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("La compression de la photo a échoué.");
    context.drawImage(source, x, y, width, height);
    source.close?.();
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.82);

    return new File([blob], "avatar.jpg", {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  }

  async function loadProfile() {
    const session = await apiRequest("session");
    if (!session.profile) {
      window.location.href = "./login.html";
      return;
    }

    csrfToken = session.csrfToken;
    currentProfile = session.profile;
    currentUser = { id: currentProfile.id, email: currentProfile.email };

    nameInput.value = currentProfile.full_name || "";
    emailInput.value = currentUser.email || currentProfile.email || "";
    roleInput.value = currentProfile.role || "";
    teamInput.value = currentProfile.team_name || "";

    if (currentProfile.avatar_url && currentProfile.avatar_url.startsWith("profile-avatars/")) {
      avatarPreview.src = `./api/index.php?action=profile-avatar&v=${Date.now()}`;
      avatarPreview.classList.remove("hidden");
      avatarPlaceholder.classList.add("hidden");
    } else {
      avatarPreview.removeAttribute("src");
      avatarPreview.classList.add("hidden");
      avatarPlaceholder.classList.remove("hidden");
    }
  }

  async function uploadAvatar() {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) return;

    const avatar = await compressAvatar(file);
    const formData = new FormData();
    formData.append("avatar", avatar);
    await apiRequest("profile-avatar", {
      method: "POST",
      body: formData
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    let profileSaved = false;
    try {
      const result = await apiRequest("profile", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: nameInput.value.trim(),
          team_name: teamInput.value.trim() || null
        })
      });
      currentProfile = result.profile;
      profileSaved = true;
      await uploadAvatar();
      showSuccess("Profil mis a jour.");
      await loadProfile();
    } catch (error) {
      console.error("Profile update failed:", error);
      const message = error.message || "Impossible de mettre a jour le profil.";
      showError(profileSaved ? `Le nom et l’équipe sont enregistrés, mais la photo n’a pas pu être envoyée. ${message}` : message);
    } finally {
      submitButton.disabled = false;
    }
  });

  loadProfile().catch((error) => {
    console.error("Profile loading failed:", error);
    showError(error.message || "Impossible de charger le profil.");
  });
  window.lucide?.createIcons();
})();
