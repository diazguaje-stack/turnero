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

        // 🔐 Validar que el rol coincida con la página
        const currentPath = window.location.pathname;

        if (currentPath.includes("recepcion") && data.role !== "recepcion") {
            alert("Acceso no autorizado");
            window.location.href = "/";
            return;
        }

        if (currentPath.includes("registro") && data.role !== "registro") {
            alert("Acceso no autorizado");
            window.location.href = "/";
            return;
        }

        // ✅ Mostrar NOMBRE COMPLETO del usuario
        const nombreCompleto = data.nombre_completo || data.usuario || "Usuario";
        
        const userNameElement = document.getElementById("userName");
        if (userNameElement) {
            userNameElement.textContent = nombreCompleto;
        }

        // 👤 Actualizar avatar con inicial del nombre
        const userAvatarElement = document.getElementById("userAvatar");
        if (userAvatarElement) {
            const inicial = nombreCompleto.charAt(0).toUpperCase();
            userAvatarElement.textContent = inicial;
        }

        console.log(`✅ Bienvenido ${nombreCompleto} (${data.role})`);

    } catch (error) {
        console.error("Error verificando sesión:", error);
        window.location.href = "/";
    }
}