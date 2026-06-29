(function () {
  const client = window.ChantierProof.getClient();
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

  async function signedAvatar(path) {
    if (!path) return null;
    const response = await client.storage.from("profile-avatars").createSignedUrl(path, 600);
    return response.error ? null : response.data.signedUrl;
  }

  async function loadProfile() {
    const sessionResponse = await client.auth.getSession();
    const session = sessionResponse.data.session;
    if (!session) {
      window.location.href = "./login.html";
      return;
    }

    currentUser = session.user;
    const response = await client.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    currentProfile = response.data || {
      id: currentUser.id,
      email: currentUser.email,
      full_name: currentUser.email,
      role: "technician"
    };

    nameInput.value = currentProfile.full_name || "";
    emailInput.value = currentUser.email || currentProfile.email || "";
    roleInput.value = currentProfile.role || "";
    teamInput.value = currentProfile.team_name || "";

    const avatarUrl = await signedAvatar(currentProfile.avatar_url);
    if (avatarUrl) {
      avatarPreview.src = avatarUrl;
      avatarPreview.classList.remove("hidden");
      avatarPlaceholder.classList.add("hidden");
    }
  }

  async function uploadAvatar() {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) return currentProfile.avatar_url || null;

    const extension = file.name.split(".").pop() || "jpg";
    const path = `${currentUser.id}/avatar-${Date.now()}.${extension}`;
    const response = await client.storage.from("profile-avatars").upload(path, file);
    if (response.error) throw response.error;
    return response.data.path;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const avatarPath = await uploadAvatar();
      const response = await client.from("profiles").upsert({
        id: currentUser.id,
        email: currentUser.email,
        full_name: nameInput.value.trim(),
        role: currentProfile.role || "technician",
        team_id: currentProfile.team_id || null,
        team_name: teamInput.value.trim() || null,
        avatar_url: avatarPath
      });

      if (response.error) throw response.error;
      showSuccess("Profil mis a jour.");
      await loadProfile();
    } catch (error) {
      console.error("Profile update failed:", error);
      showError(error.message || "Impossible de mettre a jour le profil.");
    }
  });

  loadProfile();
  window.lucide?.createIcons();
})();
