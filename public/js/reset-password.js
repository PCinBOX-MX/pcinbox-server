document.addEventListener("DOMContentLoaded", () => {
  const formSubmit = document.getElementById("formSubmit");
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirmPassword");

  const successMessage = document.getElementById("successMessage");
  const errorMessage = document.getElementById("errorMessage");
  const errorText = document.getElementById("errorText");

  const submitBtn = document.getElementById("submitBtn");

  // Estado inicial
  successMessage.style.display = "none";
  errorMessage.style.display = "none";

  formSubmit.addEventListener("submit", async (e) => {
    e.preventDefault();

    const pass = password.value.trim();
    const confirm = confirmPassword.value.trim();

    // Validación básica
    if (!pass || !confirm) {
      showError("Campos vacíos");
      return;
    }

    if (pass !== confirm) {
      showError("Las contraseñas no coinciden");
      return;
    }

    const paramsUrl = new URLSearchParams(window.location.search);
    const token = paramsUrl.get("token");
    const idUser = paramsUrl.get("idUser");

    if (!token || !idUser) {
      showError("Token inválido o faltante");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/v1/resetpassword/changePassword", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPassword: confirm,
          token,
          idUser,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Error al cambiar contraseña");
      }

      showSuccess("¡Contraseña actualizada correctamente!");
      formSubmit.reset();
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  });

  function showError(msg) {
    errorMessage.style.display = "block";
    errorText.innerText = msg;

    setTimeout(() => {
      errorMessage.style.display = "none";
    }, 3000);
  }

  function showSuccess(msg) {
    successMessage.style.display = "block";
    successMessage.innerText = msg;

    setTimeout(() => {
      successMessage.style.display = "none";
    }, 3000);
  }

  function setLoading(state) {
    submitBtn.disabled = state;

    if (state) {
      submitBtn.classList.add("loading");
    } else {
      submitBtn.classList.remove("loading");
    }
  }
});

/**
 * Toggle de visibilidad de contraseña
 * (esto SÍ puede estar global porque lo llamas desde onclick en EJS)
 */
function togglePassword(fieldId) {
  const field = document.getElementById(fieldId);
  const button = field.nextElementSibling;
  const svg = button.querySelector("svg");

  if (field.type === "password") {
    field.type = "text";

    svg.innerHTML = `
      <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0"/>
      <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8m8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7"/>
    `;
  } else {
    field.type = "password";

    svg.innerHTML = `
      <path d="m10.79 12.912-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7 7 0 0 0 2.79-.588M5.21 3.088A7 7 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474z"/>
      <path d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829zm4.95.708-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829zm3.171 6-12-12 .708-.708 12 12z"/>
    `;
  }
}
