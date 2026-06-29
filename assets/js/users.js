(function () {
  const client = window.ChantierProof.getClient();
  const form = document.getElementById("invite-form");
  const errorBox = document.getElementById("invite-error");
  const linkBox = document.getElementById("invite-link-box");
  const table = document.getElementById("invitations-table");
  const fullNameInput = document.getElementById("invite-full-name");
  const emailInput = document.getElementById("invite-email");
  const roleInput = document.getElementById("invite-role");
  const teamInput = document.getElementById("invite-team");

  let currentUser = null;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  async function requireAdmin() {
    const sessionResponse = await client.auth.getSession();
    const session = sessionResponse.data.session;
    if (!session) {
      window.location.href = "./login.html";
      return false;
    }

    currentUser = session.user;
    const profileResponse = await client
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();

    if (profileResponse.error || profileResponse.data.role !== "admin") {
      showError("Acces reserve a l'admin.");
      form.querySelectorAll("input, select, button").forEach((el) => { el.disabled = true; });
      return false;
    }

    return true;
  }

  async function resolveTeam(name) {
    const teamName = name.trim();
    if (!teamName) return null;

    const insertResponse = await client.from("teams").insert({ name: teamName }).select("id").single();
    if (!insertResponse.error) return insertResponse.data.id;

    const selectResponse = await client.from("teams").select("id").eq("name", teamName).single();
    return selectResponse.error ? null : selectResponse.data.id;
  }

  function invitationUrl(token, email) {
    const url = new URL("./login.html", window.location.href);
    url.searchParams.set("invite", token);
    url.searchParams.set("email", email);
    return url.href;
  }

  async function loadInvitations() {
    const response = await client
      .from("user_invitations")
      .select("*")
      .is("accepted_at", null)
      .order("created_at", { ascending: false });

    if (response.error) {
      showError(response.error.message);
      return;
    }

    const rows = response.data || [];
    table.innerHTML = rows.length ? rows.map((row) => `
      <tr class="border-b">
        <td class="px-4 py-3 font-medium">${row.full_name || "-"}</td>
        <td class="px-4 py-3 text-slate-600">${row.email}</td>
        <td class="px-4 py-3 text-slate-600">${row.role}</td>
        <td class="px-4 py-3 text-slate-600">${row.team_name || "-"}</td>
        <td class="px-4 py-3"><code>${row.token}</code></td>
      </tr>
    `).join("") : '<tr><td class="px-4 py-3 text-slate-500" colspan="5">Aucune invitation en attente.</td></tr>';
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");
    linkBox.classList.add("hidden");

    const teamName = teamInput.value.trim();
    const teamId = await resolveTeam(teamName);
    const response = await client.from("user_invitations").insert({
      email: emailInput.value.trim().toLowerCase(),
      full_name: fullNameInput.value.trim(),
      role: roleInput.value,
      team_id: teamId,
      team_name: teamName || null,
      invited_by: currentUser.id
    }).select("*").single();

    if (response.error) {
      showError(response.error.message);
      return;
    }

    const link = invitationUrl(response.data.token, response.data.email);
    linkBox.innerHTML = `Invitation creee. Donnez ce lien au collaborateur : <br><a class="font-semibold text-blue-700" href="${link}">${link}</a>`;
    linkBox.classList.remove("hidden");
    form.reset();
    await loadInvitations();
  });

  requireAdmin().then((ok) => {
    if (ok) loadInvitations();
  });
  window.lucide?.createIcons();
})();
