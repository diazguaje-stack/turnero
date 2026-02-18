document.addEventListener("DOMContentLoaded", verificarSesion);

async function verificarSesion() {
    try {
        const response = await fetch('/api/verify-session', {
            method: 'GET',
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.authenticated) {
            window.location.href = "/";
            return;
        }

        // 🔒 Validar que el rol coincida con la página
        const currentPath = window.location.pathname;

        if (currentPath.includes("recepcion") && data.rol !== "recepcion") {
            alert("Acceso no autorizado");
            window.location.href = "/";
            return;
        }

        if (currentPath.includes("registro") && data.rol !== "registro") {
            alert("Acceso no autorizado");
            window.location.href = "/";
            return;
        }

        // ✅ Mostrar nombre
        document.getElementById("userName").textContent = data.nombre;

    } catch (error) {
        console.error("Error verificando sesión:", error);
        window.location.href = "/";
    }
}
